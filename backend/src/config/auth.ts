export function getJwtKey(env: NodeJS.ProcessEnv = process.env): Uint8Array {
    const secret = env.JWT_SECRET;
    if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) {
        throw new Error("JWT_SECRET deve conter 64 caracteres hexadecimais aleatórios (32 bytes).");
    }
    return Buffer.from(secret, "hex");
}
