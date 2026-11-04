const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Database tests require the isolated test runner and explicit test environment.");
}

let url: URL;
try {
  url = new URL(databaseUrl);
} catch {
  throw new Error("Database tests require a valid isolated DATABASE_URL.");
}

const database = decodeURIComponent(url.pathname.slice(1));
if (url.hostname !== "127.0.0.1" || !/^mcd_store_test_[0-9a-f]{32}$/i.test(database)) {
  throw new Error("Database tests may use only a local isolated lowen_test database.");
}
