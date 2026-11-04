
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Run from backend. Each test run uses a disposable, isolated database.
const database = "mcd_store_test_" + randomUUID().replaceAll("-", "");
const migrateOnly = process.argv[2] === "migrate-only";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing isolated test database operations in production.");
}

if (process.env.MCD_ALLOW_LOCAL_TEST_DATABASE_CREATE_DROP !== "1") {
  throw new Error(
    "Refusing isolated tests without explicit MCD_ALLOW_LOCAL_TEST_DATABASE_CREATE_DROP=1 authorization.",
  );
}

const baseUrl = process.env.DATABASE_URL;

if (!baseUrl) {
  throw new Error(
    "Refusing isolated tests because DATABASE_URL is not set in the process environment.",
  );
}

let url;

try {
  url = new URL(baseUrl);
} catch {
  throw new Error("Refusing isolated tests because DATABASE_URL is not a valid URL.");
}

if (url.hostname !== "127.0.0.1") {
  throw new Error(
    "Refusing isolated tests unless DATABASE_URL points to 127.0.0.1.",
  );
}

const baseDatabase = decodeURIComponent(url.pathname.slice(1));
const allowedBaseDatabase =
  process.env.CI === "true" ? "mcd_store_ci" : "mcd_store_demo";

if (baseDatabase !== allowedBaseDatabase) {
  throw new Error(
    `Refusing isolated tests unless the local base database is ${allowedBaseDatabase}.`,
  );
}

const admin = new pg.Client({ connectionString: baseUrl });

const run = (args, cwd = process.cwd(), env = process.env) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Command failed (${code}): ${args.join(" ")}`)),
    );
  });

let databaseCreated = false;

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  databaseCreated = true;

  url.pathname = "/" + database;

  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    NODE_ENV: "test",
  };

  await run(
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "prisma.isolated.config.ts",
    ],
    process.cwd(),
    env,
  );

  console.log(`Migrations applied successfully to ${database}.`);

  if (!migrateOnly) {
    if (process.argv[2] === "browser") {
      await run(
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          "const {seedDevelopmentProducts}=await import('./src/lib/development-products.ts'); const {prisma}=await import('./src/lib/prisma.ts'); try { await seedDevelopmentProducts(); } finally { await prisma.$disconnect(); }",
        ],
        process.cwd(),
        env,
      );

      await run(
        [
          resolve("../node_modules/@playwright/test/cli.js"),
          "test",
          ...process.argv.slice(3),
        ],
        resolve(".."),
        env,
      );
    } else {
      const files =
        process.argv.length > 2
          ? process.argv.slice(2)
          : (await readdir("tests"))
            .filter((file) => file.endsWith(".test.ts"))
            .map((file) => "tests/" + file);

      await run(
        ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
        process.cwd(),
        env,
      );
    }
  }
} finally {
  try {
    if (databaseCreated) {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      console.log(`Temporary database ${database} removed.`);
    }
  } finally {
    await admin.end().catch(() => { });
  }
}
