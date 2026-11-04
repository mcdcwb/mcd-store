import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { startTestServer } from "./helpers/http.js";
import { randomBytes } from "node:crypto";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("HTTP security headers and explicit JSON body handling", async () => {
    const server = await startTestServer(createApp());
    try {
        const headers = await server.request("/auth/me");
        assert.equal(headers.status, 401);
        assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
        assert.equal(headers.headers.get("x-frame-options"), "SAMEORIGIN");
        assert.equal(headers.headers.get("content-security-policy"), null);

        const malformed = await fetch(server.baseUrl + "/auth/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid"
        });
        assert.equal(malformed.status, 400);
        assert.deepEqual(await malformed.json(), { error: "JSON malformado." });
        const oversized = await fetch(server.baseUrl + "/auth/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(1024 * 1024) })
        });
        assert.equal(oversized.status, 413);
        assert.deepEqual(await oversized.json(), { error: "Corpo da requisição muito grande." });
    } finally {
        await server.close();
    }
});
