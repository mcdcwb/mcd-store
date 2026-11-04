
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be explicitly set in the process environment.",
  );
}

const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.slice(1));

const localHosts = ["localhost", "127.0.0.1", "::1"];
const isLocal = localHosts.includes(url.hostname);

const expectedNeonHost =
  "ep-purple-credit-b65gneg7.c-2.sa-east-1.aws.neon.tech";

const isAuthorizedRemoteDemo =
  process.env.NODE_ENV === "production" &&
  process.env.MCD_DEMO_ALLOW_REMOTE_DATABASE === "1" &&
  url.hostname === expectedNeonHost &&
  database === "neondb" &&
  ["postgres:", "postgresql:"].includes(url.protocol) &&
  ["require", "verify-full"].includes(
    url.searchParams.get("sslmode") ?? "",
  );

if (process.env.NODE_ENV === "test") {
  const allowedTestDatabase =
    /^mcd_store_test_[0-9a-f]{32}$/i.test(database) ||
    (Boolean(process.env.CI) && database === "mcd_store_ci");

  if (!isLocal || !allowedTestDatabase) {
    throw new Error(
      "Refusing Prisma operation outside the permitted isolated MCD Store test database.",
    );
  }
} else if (process.env.NODE_ENV === "production") {
  const localDemo = isLocal && database === "mcd_store_demo";

  if (!localDemo && !isAuthorizedRemoteDemo) {
    throw new Error(
      "Refusing database connection outside the authorized MCD Store demonstration database.",
    );
  }
} else if (!isLocal || database !== "mcd_store_demo") {
  throw new Error(
    "Refusing Prisma operation outside local database mcd_store_demo.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
