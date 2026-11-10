import { SignJWT, jwtVerify } from "jose";
import { getJwtKey } from "../config/auth.js";
import type { AccountRole, TokenIdentity } from "../types/auth.js";

const issuer = "mcd-store";
const audiences = { ADMIN: "mcd-store-admin", USER: "mcd-store-user" } as const;
// Fixed lifetime for both USER and ADMIN; login metadata uses this same policy.
export const tokenLifetimeSeconds = 30 * 24 * 60 * 60;

export function signAccountToken(id: number, role: AccountRole) {
    const issuedAt = Math.floor(Date.now() / 1000);
    return new SignJWT({ role })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(String(id))
        .setIssuer(issuer)
        .setAudience(audiences[role])
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + tokenLifetimeSeconds)
        .sign(getJwtKey());
}

export function signAdminToken(adminId: number) {
    return signAccountToken(adminId, "ADMIN");
}

export async function verifyAccountToken(token: string): Promise<TokenIdentity> {
    const { payload } = await jwtVerify(token, getJwtKey(), {
        algorithms: ["HS256"],
        issuer,
        audience: Object.values(audiences),
        requiredClaims: ["sub", "iat", "exp"],
        maxTokenAge: tokenLifetimeSeconds
    });
    const id = Number(payload.sub);
    if (!/^[1-9]\d*$/.test(payload.sub ?? "") || !Number.isSafeInteger(id) || id > 2147483647) {
        throw new Error("Token inválido.");
    }

    // Legacy tokens may omit role only for the original administrative audience.
    if (payload.aud === audiences.ADMIN && (payload.role === "ADMIN" || payload.role === undefined)) {
        return { id, role: "ADMIN" };
    }
    if (payload.aud === audiences.USER && payload.role === "USER") return { id, role: "USER" };
    throw new Error("Token inválido.");
}

export async function verifyAdminToken(token: string) {
    const identity = await verifyAccountToken(token);
    if (identity.role !== "ADMIN") throw new Error("Token administrativo necessário.");
    return identity.id;
}
