import { randomBytes } from "node:crypto";
import { createApp } from "../../src/app.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
// Mesmo padrão do .env local: o cliente vê o painel em modo leitura (modo demonstração).
process.env.PANEL_READ_ONLY_FOR_USERS ??= "true";
createApp().listen(3187, "127.0.0.1");
