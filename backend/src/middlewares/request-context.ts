import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logHttpRequest, type HttpLogFields } from "../lib/logger.js";

function routeTemplate(req: Request): string {
    const route = req.route?.path;
    if (typeof route !== "string") return req.baseUrl || "unmatched";
    return `${req.baseUrl}${route}` || "/";
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);

    res.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const fields: HttpLogFields = {
            requestId,
            method: req.method,
            route: routeTemplate(req),
            statusCode: res.statusCode,
            durationMs
        };
        logHttpRequest(fields);
    });

    next();
}

export function requestLogFields(req: Request, res: Response, statusCode = res.statusCode): HttpLogFields {
    return {
        requestId: res.locals.requestId,
        method: req.method,
        route: routeTemplate(req),
        statusCode
    };
}
