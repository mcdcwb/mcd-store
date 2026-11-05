import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { prisma } from "../src/lib/prisma.js";
import { UploadUnavailableError } from "../src/config/cloudinary.js";
import { MAX_PRODUCT_IMAGE_BYTES, isCloudinaryImageUrl } from "../src/services/upload.service.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
const fixture = (extension: string) => readFileSync(new URL(`../../tests/fixtures/product-upload.${extension}`, import.meta.url));
const png = fixture("png");
const secureUrl = "https://res.cloudinary.com/test/image/upload/v1/mcd-store-demo/products/test.png";

test("upload authorization, multipart validation and sanitized provider failures", async t => {
  let calls = 0, failure: Error | null = null, returnedUrl = secureUrl;
  const app = createApp({ uploadProductImage: async buffer => { calls++; assert.ok(buffer.length); if (failure) throw failure; return returnedUrl; } });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = "TestPasswordA1-" + randomUUID();
  const send = (token?: string, bytes = png, type = "image/png", field = "file") => {
    const body = new FormData(); if (field) body.append(field, new Blob([new Uint8Array(bytes)], { type }), "local-image");
    return fetch(base + "/uploads/produtos", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  };
  try {
    await createAdmin({ email, password }); await createUser({ name: "Upload user", email: userEmail, password });
    const login = async (email: string) => (await (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json()).accessToken;
    const admin = await login(email), user = await login(userEmail);
    await t.test("visitor 401 and USER 403 never reach provider", async () => {
      assert.equal((await send()).status, 401); assert.equal((await send(user)).status, 403); assert.equal(calls, 0);
    });
    await t.test("ADMIN receives only a secure URL for valid PNG, JPEG and WebP files", async () => {
      for (const [bytes, type] of [[png, "image/png"], [fixture("jpg"), "image/jpeg"], [fixture("webp"), "image/webp"]] as const) {
        const response = await send(admin, bytes, type); assert.equal(response.status, 201); assert.deepEqual(await response.json(), { url: secureUrl });
      }
    });
    await t.test("missing, wrong field, invalid MIME, spoofed bytes, mismatched MIME and oversize are rejected before provider", async () => {
      const before = calls;
      for (const [bytes, type, field, status] of [[png, "image/png", "", 400], [png, "image/png", "other", 400], [png, "text/plain", "file", 400], [Buffer.from("not an image"), "image/png", "file", 400], [png, "image/jpeg", "file", 400], [Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1), "image/png", "file", 413]] as const) {
        assert.equal((await send(admin, bytes, type, field)).status, status);
      }
      assert.equal(calls, before);
    });
    await t.test("provider failures/configuration and unsafe responses never leak internal details", async () => {
      failure = new Error("private-api-secret-and-provider-stack");
      let response = await send(admin); assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: "Não foi possível enviar a imagem. Tente novamente." });
      failure = new UploadUnavailableError("private-configuration"); response = await send(admin); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private/);
      failure = null; returnedUrl = "http://res.cloudinary.com/test/image/upload/insecure.png";
      response = await send(admin); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /http:/);
    });
    await t.test("per-admin upload limit rejects excessive requests before calling provider", async () => {
      returnedUrl = secureUrl;
      let response = await send(admin);
      for (let count = 0; count < 30 && response.status === 201; count++) response = await send(admin);
      assert.equal(response.status, 429);
      const before = calls; assert.equal((await send(admin)).status, 429); assert.equal(calls, before);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.admin.deleteMany({ where: { email } }); await prisma.user.deleteMany({ where: { email: userEmail } }); await prisma.$disconnect();
  }
});

test("only credential-free HTTPS Cloudinary image URLs are accepted", () => {
  assert.equal(isCloudinaryImageUrl(secureUrl), true);
  for (const value of [null, "bad", "https://evil.test/a.png", secureUrl + "?api_secret=private", secureUrl + "#secret", secureUrl.replace("https://", "https://secret@"), secureUrl.replace("/image/", "/raw/")]) assert.equal(isCloudinaryImageUrl(value), false);
});
