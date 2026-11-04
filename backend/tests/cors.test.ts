import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/app.js";

test("CORS allows configured frontend origins and rejects unconfigured preflights", async () => {
    const previous = {
        FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
        JWT_SECRET: process.env.JWT_SECRET,
        NODE_ENV: process.env.NODE_ENV
    };
    process.env.FRONTEND_ORIGIN = "https://mcd-store-demo.vercel.app, https://admin.example/";
    process.env.JWT_SECRET = Buffer.alloc(32, 7).toString("hex");
    process.env.NODE_ENV = "production";

    const server = createApp().listen(0, "127.0.0.1");
    try {
        await new Promise<void>(resolve => server.once("listening", resolve));
        const address = server.address() as AddressInfo;
        const url = `http://127.0.0.1:${address.port}/auth/login`;
        const preflight = (origin: string) => fetch(url, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type"
            }
        });

        const allowed = await preflight("https://mcd-store-demo.vercel.app");
        assert.equal(allowed.status, 204);
        assert.equal(allowed.headers.get("access-control-allow-origin"), "https://mcd-store-demo.vercel.app");
        assert.match(allowed.headers.get("access-control-allow-headers") ?? "", /Authorization/i);

        const rejected = await preflight("https://untrusted.example");
        assert.equal(rejected.status, 403);
        assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
