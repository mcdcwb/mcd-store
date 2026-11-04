import { randomBytes } from "node:crypto";
import { createApp } from "../../src/app.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
createApp().listen(3187, "127.0.0.1");
