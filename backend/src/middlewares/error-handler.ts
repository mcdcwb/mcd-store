import type { ErrorRequestHandler, Response } from "express";
import { logHttpError } from "../lib/logger.js";
import { requestLogFields } from "./request-context.js";

type PublicErrorCode = "AUTH_ACCOUNT_LOOKUP";
const publicErrorMessages: Record<PublicErrorCode, string> = {
    AUTH_ACCOUNT_LOOKUP: "Erro ao verificar autenticação."
};

export function preservePublicErrorResponse(res: Response, code: PublicErrorCode) {
    res.locals.publicErrorCode = code;
}

function parserErrorType(error: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("type" in error)) return undefined;
    return typeof error.type === "string" ? error.type : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error);

    const type = parserErrorType(error);
    if (type === "entity.parse.failed") return res.status(400).json({ error: "JSON malformado." });
    if (type === "entity.too.large") return res.status(413).json({ error: "Corpo da requisição muito grande." });

    logHttpError("http.error", error, requestLogFields(req, res, 500));
    const code = res.locals.publicErrorCode as PublicErrorCode | undefined;
    return res.status(500).json({ error: code ? publicErrorMessages[code] : "Erro interno do servidor." });
};
