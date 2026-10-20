import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "artifacts/api-server/dist/index.mjs");
const password = "Hosting-test-only-2468!";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function environment(dir, overrides = {}) {
  // Never inherit local secrets, production data paths, or Railway account env.
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: "production",
    POS_HOSTED: "1",
    POS_DATA_DIR: dir,
    POS_CONFIG_DIR: path.join(dir, "config"),
    POS_ARCHIVE_DIR: path.join(dir, "archive"),
    POS_ADMIN_USERNAME: "owner",
    POS_ADMIN_PASSWORD: password,
    RAILWAY_ENVIRONMENT_ID: "isolated-test",
    RAILWAY_VOLUME_MOUNT_PATH: dir,
    ...overrides,
  };
}

async function start(dir, overrides = {}) {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [entry], {
    cwd: root, env: environment(dir, { PORT: String(port), ...overrides }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server failed: ${output}`);
    try {
      const res = await fetch(`${base}/api/healthz`);
      if (res.ok) return { base, stop, output: () => output };
    } catch {}
    await pause(100);
  }
  await stop();
  throw new Error(`Server did not become healthy: ${output}`);
}

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-hosting-test-"));
  // Test teardown first stops children/closes SQLite; only then remove temp data.
  process.once("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function request(server, url, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${server.base}/api${url}`, {
    method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json(), headers: res.headers };
}
async function login(server, username = "owner", pass = password) {
  const r = await request(server, "/auth/login", { method: "POST", body: { username, password: pass } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}

test("hosted startup fails closed without volume, credentials, or persistent paths", t => {
  for (const override of [
    { RAILWAY_VOLUME_MOUNT_PATH: "" },
    { POS_ADMIN_PASSWORD: "" },
    { POS_DATA_DIR: "" },
    { POS_ARCHIVE_DIR: "/tmp/outside-pos-volume" },
    { POS_CONFIG_DIR: "/tmp/outside-pos-volume" },
  ]) {
    const dir = temporary(t);
    const child = spawnSync(process.execPath, [entry], {
      cwd: root, env: environment(dir, override), encoding: "utf8", timeout: 10_000,
    });
    assert.notEqual(child.status, 0);
    assert.equal(child.error, undefined);
    assert.match(child.stderr, /Volume|POS_ADMIN|POS_DATA_DIR|persistent volume/);
  }
});

test("hosted API: durable data, auth, permissions, backups, PDF and restart", async t => {
  const dir = temporary(t);
  let server = await start(dir);
  t.after(() => server.stop());
  const database = new DatabaseSync(path.join(dir, "store.db"));
  t.after(() => database.close());
  let token = await login(server);

  await t.test("empty shop and no exposed/default credentials", async () => {
    assert.equal((await request(server, "/products")).status, 401);
    assert.equal((await request(server, "/auth/login", {
      method: "POST", body: { username: "admin", password: "admin123" },
    })).status, 401);
    assert.equal((await request(server, "/products", { token })).data.total, 0);
    const users = await request(server, "/users", { token });
    assert.equal(users.data.items.length, 1);
    assert.equal(users.data.items[0].password, "");
    assert.match(database.prepare("SELECT password FROM users").get().password, /^scrypt-v1\$/);
    assert.equal(users.headers.get("cache-control"), "no-store");
    assert.equal(users.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(`${server.base}/sales`)).status, 200);
    assert.equal((await request(server, "/unknown", { token })).status, 404);
  });

  await t.test("fixed paths and working backup download", async () => {
    const info = (await request(server, "/backup/info", { token })).data;
    assert.equal(info.hosted, true);
    assert.equal(info.dbPath, path.join(dir, "store.db"));
    for (const endpoint of ["pick-folder", "data-dir", "archive-dir"]) {
      assert.equal((await request(server, `/backup/${endpoint}`, {
        token, method: "POST", body: { dir: "/tmp/unsafe" },
      })).status, 409);
    }
    const backup = await request(server, "/backup/create", { token, method: "POST" });
    assert.equal(backup.status, 200);
    const download = await fetch(`${server.base}/api/backup/download/${backup.data.filename}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(download.status, 200);
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 2).toString(), "PK");
    assert.equal((await request(server, "/backup/cloud/status", { token })).data.configured, false);
  });

  let staffToken;
  let staffId;
  await t.test("staff permissions fail closed, including encoded paths and drafts", async () => {
    const staff = await request(server, "/users", { token, method: "POST", body: {
      username: "cashier", password, name: "كاشير تجريبي", permissions: ["/pos"],
    } });
    assert.equal(staff.status, 201);
    staffId = staff.data.id;
    staffToken = await login(server, "cashier");
    for (const endpoint of ["/users", "/backup/info", "/reports/profit", "/Reports/profit",
      "/%72eports/profit", "/purchases", "/drafts", "/drafts?type=purchase",
      "/delete-preview/products/1"]) {
      assert.equal((await request(server, endpoint, { token: staffToken })).status, 403, endpoint);
    }
    assert.equal((await request(server, "/products", { token: staffToken })).status, 200);
    assert.equal((await request(server, "/customers", { token: staffToken })).status, 200);
    assert.equal((await request(server, "/products/next-barcode", { token: staffToken })).status, 403);
    assert.equal((await request(server, "/products", { token: staffToken, method: "POST", body: {} })).status, 403);
    assert.equal((await request(server, "/drafts", { token: staffToken, method: "POST", body: {
      type: "sales_invoice", entityId: "new", data: { items: [] },
    } })).status, 200);
    assert.equal((await request(server, "/users", { token, method: "POST", body: {
      username: "weak", name: "weak", password: "123", role: "staff",
    } })).status, 400);
  });

  await t.test("cashier sale, trusted audit identity, stock and PDF archive", async st => {
    const product = await request(server, "/products", { token, method: "POST", body: {
      nameAr: "صنف اختبار استضافة", sku: "HOSTING-TEST", currentStock: 10, sellingPrice: 20, trueCost: 10,
    } });
    assert.equal(product.status, 201);
    const sale = await request(server, "/sales", { token: staffToken, method: "POST",
      headers: { "X-Actor-Name": "forged-admin" }, body: {
        items: [{ productId: product.data.id, quantity: 2, unitPrice: 20 }],
      },
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.data.createdBy, "كاشير تجريبي");
    assert.equal((await request(server, `/sales/${sale.data.id}/finalize`, {
      token: staffToken, method: "POST", body: {},
    })).status, 200);
    assert.equal((await request(server, `/products/${product.data.id}`, { token })).data.currentStock, 8);
    const info = (await request(server, "/backup/info", { token })).data;
    if (!info.pdfEngineAvailable) {
      assert.notEqual(process.env.REQUIRE_PDF, "1", "Container must include Chromium");
      st.diagnostic("PDF rendering not checked: no system browser on this machine");
      return;
    }
    const archive = path.join(dir, "archive");
    let pdf;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(archive)) {
        pdf = fs.readdirSync(archive, { recursive: true }).find(f => String(f).endsWith(".pdf"));
        if (pdf && fs.statSync(path.join(archive, pdf)).size > 0) break;
      }
      await pause(200);
    }
    assert.ok(pdf, server.output());
    assert.equal(fs.readFileSync(path.join(archive, pdf)).subarray(0, 4).toString(), "%PDF");
  });

  await t.test("sessions expire, revoke on password reset, and logout", async () => {
    database.prepare("UPDATE sessions SET createdAt = datetime('now','-13 hours') WHERE token = ?").run(staffToken);
    assert.equal((await request(server, "/products", { token: staffToken })).status, 401);
    staffToken = await login(server, "cashier");
    assert.equal((await request(server, `/users/${staffId}`, {
      token, method: "PATCH", body: { password: "A-new-test-password-2468" },
    })).status, 200);
    assert.equal((await request(server, "/products", { token: staffToken })).status, 401);
    const logout = await login(server);
    assert.equal((await request(server, "/auth/logout", { token: logout, method: "POST" })).status, 200);
    assert.equal((await request(server, "/products", { token: logout })).status, 401);
  });

  await t.test("automatic daily snapshot contains a consistent database", async () => {
    let snapshot;
    for (let i = 0; i < 75; i++) {
      snapshot = fs.readdirSync(path.join(dir, "backups")).find(f => /^auto-.*\.db$/.test(f));
      if (snapshot) break;
      await pause(1000);
    }
    assert.ok(snapshot, server.output());
    const copy = new DatabaseSync(path.join(dir, "backups", snapshot), { readOnly: true });
    try {
      assert.equal(copy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.equal(copy.prepare("SELECT count(*) AS n FROM sales_invoices").get().n, 1);
    } finally { copy.close(); }
  });

  await t.test("restart preserves records and never resets the admin password", async () => {
    await server.stop();
    server = await start(dir, { POS_ADMIN_PASSWORD: "Changed-env-is-not-a-reset" });
    token = await login(server);
    assert.equal((await request(server, "/products", { token })).data.total, 1);
    assert.equal((await request(server, "/sales", { token })).data.total, 1);
  });

  await t.test("login rate limiting", async () => {
    let status;
    for (let i = 0; i < 22; i++) status = (await request(server, "/auth/login", {
      method: "POST", body: { username: "missing", password: "wrong" },
    })).status;
    assert.equal(status, 429);
  });
});

test("local mode still works; copied legacy accounts migrate only in hosted mode", async t => {
  const dir = temporary(t);
  let server = await start(dir, {
    POS_HOSTED: "0", RAILWAY_ENVIRONMENT_ID: "", RAILWAY_VOLUME_MOUNT_PATH: "",
    POS_SEED_DEMO: "0",
  });
  t.after(() => server.stop());
  const token = await login(server, "admin", "admin123");
  const users = (await request(server, "/users", { token })).data.items;
  assert.equal(users[0].password, "admin123");
  await server.stop();
  const rejected = spawnSync(process.execPath, [entry], {
    cwd: root, env: environment(dir), encoding: "utf8", timeout: 10_000,
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /needs a password/);
  const db = new DatabaseSync(path.join(dir, "store.db"));
  db.prepare("UPDATE users SET password = ?").run(password);
  db.close();
  server = await start(dir);
  const hostedToken = await login(server, "admin");
  assert.equal((await request(server, "/products", { token })).status, 401);
  assert.equal((await request(server, "/users", { token: hostedToken })).data.items[0].password, "");
});
