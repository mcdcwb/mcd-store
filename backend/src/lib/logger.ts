type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "OTHER";
type ErrorKind = "prisma" | "syntax" | "type" | "range" | "unknown";

export interface HttpLogFields {
    requestId?: string;
    method?: string;
    route?: string;
    statusCode?: number;
    durationMs?: number;
}

const methods = new Set<HttpMethod>(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "OTHER"]);
const routePattern = /^(?:\/(?:[A-Za-z0-9_:-]+|\*)?)*$/;

function safeMethod(value?: string): HttpMethod | undefined {
    if (!value) return undefined;
    const method = value.toUpperCase();
    return methods.has(method as HttpMethod) ? method as HttpMethod : "OTHER";
}

function safeRoute(value?: string): string | undefined {
    if (!value || value.length > 200 || !routePattern.test(value)) return value === undefined ? undefined : "unmatched";
    return value || "/";
}

function safeError(error: unknown): { errorType: ErrorKind; errorCode?: string } {
    if (!error || typeof error !== "object") return { errorType: "unknown" };
    const candidate = error as { name?: unknown; code?: unknown };
    if (typeof candidate.code === "string" && /^P\d{4}$/.test(candidate.code)) {
        return { errorType: "prisma", errorCode: candidate.code };
    }
    switch (candidate.name) {
        case "SyntaxError": return { errorType: "syntax" };
        case "TypeError": return { errorType: "type" };
        case "RangeError": return { errorType: "range" };
        default: return { errorType: "unknown" };
    }
}

function emit(level: "info" | "error", record: Record<string, string | number>) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, ...record }));
}

export function logHttpRequest(fields: HttpLogFields) {
    emit("info", {
        event: "http.request",
        ...(fields.requestId ? { requestId: fields.requestId } : {}),
        ...(safeMethod(fields.method) ? { method: safeMethod(fields.method)! } : {}),
        ...(fields.route !== undefined ? { route: safeRoute(fields.route)! } : {}),
        ...(Number.isInteger(fields.statusCode) && fields.statusCode! >= 100 && fields.statusCode! <= 599 ? { statusCode: fields.statusCode! } : {}),
        ...(Number.isFinite(fields.durationMs) && fields.durationMs! >= 0 ? { durationMs: Math.round(fields.durationMs!) } : {})
    });
}

export function logHttpError(event: "http.error" | "healthcheck.error", error: unknown, fields: HttpLogFields) {
    emit("error", {
        event,
        ...(fields.requestId ? { requestId: fields.requestId } : {}),
        ...(safeMethod(fields.method) ? { method: safeMethod(fields.method)! } : {}),
        ...(fields.route !== undefined ? { route: safeRoute(fields.route)! } : {}),
        ...(Number.isInteger(fields.statusCode) && fields.statusCode! >= 100 && fields.statusCode! <= 599 ? { statusCode: fields.statusCode! } : {}),
        ...safeError(error)
    });
}

export function logServerStarted(port: number) {
    emit("info", { event: "server.started", port });
}
