import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { AuthError, createAuthApi, validateLogin, validateRegistration } from "../src/app/lib/auth.ts";
import { sessionRevalidationDelay, createAuthSession, AUTH_STORAGE_KEY, LEGACY_USER_KEY } from "../src/app/lib/auth-session.ts";

const account = { id: 1, name: "Cliente", email: "test@example.test", role: "USER" };
const token = randomBytes(24).toString("hex");
const session = { accessToken: token, expiresAt: Date.now() + 900000, account };
const loginBody = { accessToken: token, tokenType: "Bearer", expiresIn: 2592000, expiresAt: Date.now() + 2592000000, account };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test("login and registration validation match backend boundaries", () => {
  assert.ok(validateLogin(account.email, ""));
  assert.equal(validateLogin(account.email, "a"), null);
  assert.equal(validateLogin(account.email, "a".repeat(128)), null);
  assert.ok(validateLogin(account.email, "a".repeat(129)));
  assert.ok(validateRegistration({ name: "A", email: account.email, password: "12345" }));
  assert.ok(validateRegistration({ name: "Cliente", email: account.email, password: "1234" }));
  assert.equal(validateRegistration({ name: "Cliente", email: account.email, password: "12345" }), null);
});

test("shared login validates the returned role and token with /auth/me", async () => {
  const calls = [];
  const api = createAuthApi("/api", async (url, init) => {
    calls.push({ url, init });
    return json(url.endsWith("/login") ? loginBody : { account });
  });
  const result = await api.login(" TEST@example.test ", "password");
  assert.deepEqual(result.account, account);
  assert.equal(calls[0].url, "/api/auth/login");
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: account.email, password: "password" });
  assert.equal(calls[1].init.headers.Authorization, "Bearer " + token);
});

test("registration posts only public account fields and does not create a session", async () => {
  let sent;
  const api = createAuthApi("/api", async (_url, init) => {
    sent = JSON.parse(init.body);
    return json({ account }, 201);
  });
  assert.deepEqual(await api.register({ name: " Cliente ", email: " TEST@example.test ", password: "12345" }), account);
  assert.deepEqual(sent, { name: "Cliente", email: account.email, password: "12345" });
});

test("connection refusal never becomes a successful login", async () => {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  await assert.rejects(createAuthApi("http://127.0.0.1:" + port).login(account.email, "x"), { code: "unavailable" });
});

test("credential, conflict, service and rate-limit failures are distinguished", async () => {
  for (const [status, code] of [[401, "unauthorized"], [409, "conflict"], [500, "unavailable"], [429, "rate_limit"], [403, "forbidden"]]) {
    await assert.rejects(createAuthApi("/api", async () => json({}, status)).login(account.email, "x"), { code });
  }
});

test("malformed identities and mismatched /me roles are rejected", async () => {
  for (const invalid of [{}, { ...account, role: "OWNER" }, { ...account, name: "" }]) {
    await assert.rejects(createAuthApi("/api", async () => json({ ...loginBody, account: invalid })).login(account.email, "x"), { code: "invalid_response" });
  }
  await assert.rejects(createAuthApi("/api", async url => json(url.endsWith("/login") ? loginBody : { account: { ...account, role: "ADMIN" } })).login(account.email, "x"), { code: "invalid_response" });
});

test("local mock users are removed and never restore a session", async () => {
  const storage = memoryStorage(); const legacy = memoryStorage();
  legacy.setItem(LEGACY_USER_KEY, JSON.stringify(account));
  const auth = createAuthSession({ me: async () => { throw new Error("Must not run"); } }, () => storage, () => legacy);
  await auth.restore();
  assert.equal(auth.getSnapshot().session, null);
  assert.equal(legacy.getItem(LEGACY_USER_KEY), null);
});

test("restoration requires /auth/me and gets identity from the server", async () => {
  const storage = memoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...session, account: { ...account, role: "ADMIN" } }));
  const auth = createAuthSession({ me: async received => { assert.equal(received, token); return account; } }, () => storage, () => memoryStorage());
  await auth.restore();
  assert.deepEqual(auth.getSnapshot().session.account, account);
});

test("failed restoration and logout clear persisted token", async () => {
  const storage = memoryStorage(); storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  const auth = createAuthSession({ me: async () => { throw new Error("Connection failed"); } }, () => storage, () => memoryStorage());
  await auth.restore();
  assert.equal(auth.getSnapshot().session, null);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
});

test("login persists only token and expiry", async () => {
  const storage = memoryStorage();
  const auth = createAuthSession({ login: async () => session }, () => storage, () => memoryStorage());
  assert.equal(await auth.login(account.email, "x"), true);
  assert.deepEqual(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)), { accessToken: token, expiresAt: session.expiresAt });
});

test("focus revalidation keeps the verified session mounted while checking /auth/me", async () => {
  const storage = memoryStorage();
  let finish;
  const auth = createAuthSession({ login: async () => session, me: () => new Promise(resolve => { finish = resolve; }) }, () => storage, () => memoryStorage());
  await auth.login(account.email, "x");
  const states = [];
  auth.subscribe(() => states.push(auth.getSnapshot()));
  const pending = auth.restore();
  assert.equal(auth.getSnapshot().session === session, true);
  assert.equal(auth.getSnapshot().validating, false);
  finish(account);
  await pending;
  assert.ok(states.every(state => state.session && !state.validating));
});

test("initial restoration stays hidden and failed focus revalidation still revokes access", async () => {
  const storage = memoryStorage(); storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  let finish;
  const auth = createAuthSession({ me: () => new Promise((resolve, reject) => { finish = { resolve, reject }; }) }, () => storage, () => memoryStorage());
  let pending = auth.restore();
  assert.equal(auth.getSnapshot().session, null);
  assert.equal(auth.getSnapshot().validating, true);
  finish.resolve(account); await pending;
  pending = auth.restore();
  finish.reject(new Error("Session revoked")); await pending;
  assert.equal(auth.getSnapshot().session, null);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(auth.getSnapshot().error, "Session revoked");
});

test("profile updates refresh the current identity without accepting stale or foreign sessions", async () => {
  const storage = memoryStorage();
  const auth = createAuthSession({ login: async () => session }, () => storage, () => memoryStorage());
  await auth.login(account.email, "x");
  const updated = { ...account, email: "changed@example.test" };
  auth.updateAccount("another-token", updated);
  auth.updateAccount(token, { ...updated, id: account.id + 1 });
  auth.updateAccount(token, { ...updated, role: "ADMIN" });
  assert.deepEqual(auth.getSnapshot().session.account, account);
  auth.updateAccount(token, updated);
  assert.deepEqual(auth.getSnapshot().session.account, updated);
  assert.deepEqual(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)), { accessToken: token, expiresAt: session.expiresAt });
  auth.logout();
  auth.updateAccount(token, updated);
  assert.equal(auth.getSnapshot().session, null);
});

test("shared logout wins over delayed login in another session", async () => {
  const storage = memoryStorage(); let finish;
  const a = createAuthSession({ login: () => new Promise(resolve => { finish = resolve; }) }, () => storage, () => memoryStorage());
  const b = createAuthSession({}, () => storage, () => memoryStorage());
  const pending = a.login(account.email, "x"); b.logout(); finish(session);
  assert.equal(await pending, false); await a.restore();
  assert.equal(a.getSnapshot().session, null); assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
});

test("later login wins even when earlier response finishes last", async () => {
  const storage = memoryStorage(); let finish;
  const a = createAuthSession({ login: () => new Promise(resolve => { finish = resolve; }) }, () => storage, () => memoryStorage());
  const other = { ...session, accessToken: randomBytes(24).toString("hex"), account: { ...account, id: 2 } };
  const b = createAuthSession({ login: async () => other }, () => storage, () => memoryStorage());
  const pending = a.login(account.email, "x"); await b.login(account.email, "x"); finish(session);
  assert.equal(await pending, false);
  assert.equal(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).accessToken === other.accessToken, true);
});

for (const failed of [false, true]) test(`stale /me ${failed ? "failure" : "success"} cannot clear or restore another identity`, async () => {
  const storage = memoryStorage(); let finish;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  const other = { ...session, accessToken: randomBytes(24).toString("hex"), account: { ...account, id: 2 } };
  const a = createAuthSession({ me: received => received === other.accessToken ? Promise.resolve(other.account) : new Promise((resolve, reject) => { finish = { resolve, reject }; }) }, () => storage, () => memoryStorage());
  const b = createAuthSession({ login: async () => other }, () => storage, () => memoryStorage());
  const pending = a.restore(); await b.login(account.email, "x");
  if (failed) finish.reject(new Error("Revoked")); else finish.resolve(account);
  await pending;
  assert.equal(a.getSnapshot().session.account.id, 2);
  assert.equal(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).accessToken === other.accessToken, true);
});

test("focus reads shared removal instead of reusing the old in-memory token", async () => {
  const storage = memoryStorage();
  const a = createAuthSession({ login: async () => session }, () => storage, () => memoryStorage());
  await a.login(account.email, "x"); storage.removeItem(AUTH_STORAGE_KEY); await a.restore();
  assert.equal(a.getSnapshot().session, null);
});

test("late administrative rejection cannot log out the newer shared USER session", async () => {
  const storage = memoryStorage();
  const a = createAuthSession({ login: async () => session, me: async () => ({ ...account, id: 2 }) }, () => storage, () => memoryStorage());
  await a.login(account.email, "x");
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...session, accessToken: randomBytes(24).toString("hex") }));
  a.invalidate(token, "Unauthorized old request"); await a.restore();
  assert.equal(a.getSnapshot().session.account.id, 2);
  assert.notEqual(storage.getItem(AUTH_STORAGE_KEY), null);
});

test("login uses the backend expiration unchanged even with a skewed browser clock", async () => {
  const expiresAt = 1700000000000;
  const api = createAuthApi("/api", async url => json(url.endsWith("/login") ? { ...loginBody, expiresAt } : { account }));
  assert.equal((await api.login(account.email, "x")).expiresAt, expiresAt);
  for (const invalid of [undefined, null, 0, -1, "tomorrow", 1.5]) {
    await assert.rejects(createAuthApi("/api", async () => json({ ...loginBody, expiresAt: invalid })).login(account.email, "x"), { code: "invalid_response" });
  }
});

test("local expired metadata cannot revoke a token accepted by /auth/me", async () => {
  const storage = memoryStorage(); let calls = 0;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...session, expiresAt: 1 }));
  const auth = createAuthSession({ me: async () => { calls++; return account; } }, () => storage, () => memoryStorage());
  await auth.restore(); await auth.restore();
  assert.equal(calls, 2);
  assert.deepEqual(auth.getSnapshot().session.account, account);
  assert.notEqual(storage.getItem(AUTH_STORAGE_KEY), null);
});

for (const role of ["USER", "ADMIN"]) test(`${role} only loses credentials on authoritative rejection or explicit logout`, async () => {
  for (const code of ["unavailable", "rate_limit", "unauthorized", "forbidden"]) {
    const storage = memoryStorage();
    const roleSession = { ...session, account: { ...account, role } };
    let failure = true;
    const api = { login: async () => roleSession, me: async () => {
      if (failure) throw new AuthError(code, code);
      return roleSession.account;
    } };
    const auth = createAuthSession(api, () => storage, () => memoryStorage());
    await auth.login(account.email, "x"); await auth.restore();
    const transient = ["unavailable", "rate_limit"].includes(code);
    assert.equal(auth.getSnapshot().session !== null, transient);
    assert.equal(storage.getItem(AUTH_STORAGE_KEY) !== null, transient);
    if (transient) {
      const reopened = createAuthSession(api, () => storage, () => memoryStorage());
      await reopened.restore();
      assert.equal(reopened.getSnapshot().session, null);
      assert.notEqual(storage.getItem(AUTH_STORAGE_KEY), null);
      failure = false; await reopened.restore();
      assert.equal(reopened.getSnapshot().session.account.role, role);
      assert.equal(reopened.getSnapshot().error, null);
      reopened.logout();
      assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
    }
  }
});

test("long-session revalidation never overflows a browser timer or spins on an old deadline", () => {
  const now = 1700000000000;
  assert.equal(sessionRevalidationDelay(now + 30 * 86400000, now), 86400000);
  assert.equal(sessionRevalidationDelay(now + 900000, now), 900000);
  assert.equal(sessionRevalidationDelay(now, now), 60000);
  assert.equal(sessionRevalidationDelay(now - 86400000, now), 60000);
});
