import { once } from "node:events";
import type { Express } from "express";

export async function startTestServer(app: Express) {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sem porta.");
    const baseUrl = "http://127.0.0.1:" + address.port;
    return {
        baseUrl,
        request(path: string, method = "GET", body?: unknown, token?: string) {
            return fetch(baseUrl + path, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: "Bearer " + token } : {})
                },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        },
        close() {
            return new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    };
}
