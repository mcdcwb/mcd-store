
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for isolated migrations.");
}

const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.slice(1));

if (
  url.hostname !== "127.0.0.1" ||
  !/^mcd_store_test_[0-9a-f]{32}$/i.test(database)
) {
  throw new Error(
    "Refusing migrations outside a local isolated MCD Store test database.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: databaseUrl },
});
