import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decodeJwt, SignJWT } from "jose";
import { getJwtKey } from "../src/config/auth.js";
import { signAccountToken, tokenLifetimeSeconds, verifyAccountToken } from "../src/lib/token.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

for (const role of ["USER", "ADMIN"] as const) {
  test(`${role}: 30-day signed lifetime and validation boundaries without waiting`, async t => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const accessToken = await signAccountToken(1, role);
    const claims = decodeJwt(accessToken);
    assert.equal(tokenLifetimeSeconds, 30 * 86400);
    assert.equal(claims.exp! - claims.iat!, tokenLifetimeSeconds);
    assert.deepEqual(await verifyAccountToken(accessToken), { id: 1, role });
    const sign = (iat: number, exp: number) => new SignJWT({ ...claims, iat, exp })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(getJwtKey());
    // Tokens older than the former 15-minute limit must remain valid.
    const oldValid = await sign(issuedAt - 86400, issuedAt + 29 * 86400);
    assert.deepEqual(await verifyAccountToken(oldValid), { id: 1, role });
    const expired = await sign(issuedAt - tokenLifetimeSeconds - 10, issuedAt - 10);
    await assert.rejects(verifyAccountToken(expired));
    const excessiveAge = await sign(issuedAt - tokenLifetimeSeconds - 10, issuedAt + 100);
    await assert.rejects(verifyAccountToken(excessiveAge));
    await assert.rejects(verifyAccountToken("invalid-token"));
    const tampered = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(randomBytes(32));
    await assert.rejects(verifyAccountToken(tampered));
    t.mock.timers.enable({ apis: ["Date"], now: (claims.exp! - 1) * 1000 });
    assert.deepEqual(await verifyAccountToken(accessToken), { id: 1, role });
    t.mock.timers.setTime(claims.exp! * 1000);
    await assert.rejects(verifyAccountToken(accessToken));
  });
}
