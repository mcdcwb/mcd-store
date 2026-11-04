import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { errorHandler, preservePublicErrorResponse } from "../src/middlewares/error-handler.js";
import { requestContext } from "../src/middlewares/request-context.js";
import { startTestServer } from "./helpers/http.js";

test("central error handler and request logs redact sensitive values", async t => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const output: string[] = [];
    t.mock.method(console, "log", (...args: unknown[]) => { output.push(String(args[0])); });

    const app = express();
    app.use(requestContext);
    app.get("/private/:accountId", (_req, _res) => {
        const error = new Error("password=private-pass token=private-token cookie=private-cookie");
        Object.assign(error, { password: "private-pass", authorization: "private-token", connectionString: "private-url" });
        throw error;
    });
    app.get("/auth-account-lookup-failure", (_req, res, next) => {
        preservePublicErrorResponse(res, "AUTH_ACCOUNT_LOOKUP");
        next(new Error("private database diagnostics"));
    });
    app.use(errorHandler);
    const server = await startTestServer(app);

    try {
        const response = await fetch(`${server.baseUrl}/private/123?email=private-email`, {
            headers: { Authorization: "Bearer private-token", Cookie: "session=private-cookie", "X-Request-ID": "attacker-controlled" }
        });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: "Erro interno do servidor." });
        const requestId = response.headers.get("x-request-id");
        assert.match(requestId ?? "", /^[0-9a-f-]{36}$/i);
        assert.notEqual(requestId, "attacker-controlled");

        const authFailure = await fetch(`${server.baseUrl}/auth-account-lookup-failure`);
        assert.equal(authFailure.status, 500);
        assert.deepEqual(await authFailure.json(), { error: "Erro ao verificar autenticação." });

        const records = output.map(line => JSON.parse(line));
        const errorRecord = records.find(record => record.event === "http.error");
        const requestRecord = records.find(record => record.event === "http.request");
        assert.ok(errorRecord);
        assert.ok(requestRecord);
        assert.equal(errorRecord.errorType, "unknown");
        assert.equal(errorRecord.route, "/private/:accountId");
        assert.equal(requestRecord.route, "/private/:accountId");
        assert.equal(requestRecord.statusCode, 500);
        assert.equal(requestRecord.requestId, requestId);

        const serialized = JSON.stringify(records);
        for (const secret of ["private-pass", "private-token", "private-cookie", "private-url", "private-email", "private database diagnostics", "attacker-controlled", "stack", "message", "authorization", "connectionString"])
            assert.equal(serialized.includes(secret), false, `logs must not include ${secret}`);
        assert.equal(new URL(response.url).searchParams.get("email"), "private-email");
    } finally {
        await server.close();
        if (previousEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnvironment;
    }
});
