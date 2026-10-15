// نسخة احتياطية سحابية: لقطة من قاعدة البيانات ← ضغط ← تشفير AES-256-GCM ← رفع على ريبو GitHub *خاص*
// (فرع منفصل اسمه db-backups عشان "git pull origin main" على جهاز المحل ما ينزّلش النسخ).
// بيشتغل لوحده يومياً (Task Scheduler) ومع "Stop POS.bat" ومن زرار في الإعدادات ← النسخ الاحتياطي.
// الإعداد مرة واحدة: من نفس الشاشة في البرنامج، أو بـ "Setup Cloud Backup.bat".
//
//   node scripts\cloud-backup.mjs              رفع نسخة (بيتخطّى لو مفيش تغيير من آخر رفعة)
//   node scripts\cloud-backup.mjs --force      رفع نسخة حتى لو مفيش تغيير
//   node scripts\cloud-backup.mjs setup        الإعداد لأول مرة (الريبو + التوكن + كلمة سر التشفير + المهمة اليومية)
//   node scripts\cloud-backup.mjs configure    نفس الإعداد بس من JSON على stdin (بيستخدمه البرنامج)
//   node scripts\cloud-backup.mjs status       حالة النسخ كـ JSON (من غير التوكن/كلمة السر)
//   node scripts\cloud-backup.mjs restore <file.enc> [out.db]   فك تشفير نسخة نزلتها من GitHub
//
// الإعدادات (التوكن + كلمة السر) في cloud-backup.json جنب المشروع — في .gitignore، ما يترفعش أبداً.
// السجل: logs\cloud-backup.log. (الرسائل بالإنجليزي عشان تظهر سليمة في الـ cmd العادي.)
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(root, "cloud-backup.json");
const logFile = path.join(root, "logs", "cloud-backup.log");
const BRANCH = "db-backups";
const TASK_NAME = "POS Cloud Backup";
const TASK_TIME = "13:00";

// File format: MAGIC | salt(16) | iv(12) | tag(16) | AES-256-GCM(gzip(sqlite db))
const MAGIC = Buffer.from("POSBAK01");
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// Same resolution order as artifacts/api-server/src/lib/paths.ts.
function resolveDataDir() {
  if (process.env.POS_DATA_DIR) return path.resolve(process.env.POS_DATA_DIR);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "pos-config.json"), "utf8"));
    if (cfg?.dataDir) return path.resolve(String(cfg.dataDir));
  } catch {
    /* no config → default */
  }
  return path.join(root, "data");
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line + os.EOL);
  } catch {
    /* logging must never break the backup */
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), "utf8");
}

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, SCRYPT);
}

export function encrypt(plain, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

export function decrypt(blob, password) {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a POS cloud backup file.");
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += 16));
  const iv = blob.subarray(o, (o += 12));
  const tag = blob.subarray(o, (o += 16));
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(blob.subarray(o)), decipher.final()]);
  } catch {
    throw new Error("Wrong password (or the file is damaged).");
  }
}

/** Consistent snapshot of the live DB (safe while the server is running — WAL mode). */
export function snapshotDb(dbPath) {
  const tmp = path.join(os.tmpdir(), `pos-cloud-${process.pid}-${Date.now()}.db`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  try {
    return fs.readFileSync(tmp);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function github(cfg, method, urlPath, body, { allow404 = false } = {}) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "local-first-pos-cloud-backup",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    const hint =
      res.status === 401 ? " (token is wrong or EXPIRED — enter a new one in Settings > Backup)"
      : res.status === 403 || res.status === 404 ? " (token has no access to this repo — needs Contents: Read and write)"
      : "";
    throw new Error(`GitHub ${method} ${urlPath} → ${res.status}${hint}: ${json?.message || text.slice(0, 200)}`);
  }
  return json;
}

/** Refuse to upload anywhere that isn't a private repo — the DB holds customers, debts and passwords. */
async function assertPrivateRepo(cfg) {
  const repo = await github(cfg, "GET", `/repos/${cfg.repo}`);
  if (repo?.private !== true) throw new Error(`Repo ${cfg.repo} is NOT private. Refusing to upload the database.`);
}

/** Backups live on their own orphan branch — never mixed with the code on main. */
async function ensureBranch(cfg) {
  if (await github(cfg, "GET", `/repos/${cfg.repo}/branches/${BRANCH}`, null, { allow404: true })) return;
  const tree = await github(cfg, "POST", `/repos/${cfg.repo}/git/trees`, {
    tree: [{ path: "README.md", mode: "100644", type: "blob",
      content: "# Encrypted POS database backups\n\nOpen with: node scripts/cloud-backup.mjs restore <file.db.gz.enc>\n" }],
  });
  const commit = await github(cfg, "POST", `/repos/${cfg.repo}/git/commits`, { message: "init db-backups", tree: tree.sha, parents: [] });
  await github(cfg, "POST", `/repos/${cfg.repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  log(`Created branch '${BRANCH}' in ${cfg.repo}.`);
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return {
    dir: `${d.getFullYear()}/${p(d.getMonth() + 1)}`,
    name: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`,
  };
}

async function runBackup({ force = false } = {}) {
  const cfg = readConfig();
  if (!cfg?.repo || !cfg?.token || !cfg?.password) {
    log("Cloud backup is not set up (no cloud-backup.json) — skipped. Run 'Setup Cloud Backup.bat'.");
    return;
  }
  const dbPath = path.join(resolveDataDir(), "store.db");
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);

  const snapshot = snapshotDb(dbPath);
  const hash = crypto.createHash("sha256").update(snapshot).digest("hex");
  if (!force && hash === cfg.lastHash) {
    log("No changes since the last upload — skipped.");
    return;
  }

  const blob = encrypt(zlib.gzipSync(snapshot, { level: 9 }), cfg.password);
  if (blob.length > 90 * 1024 * 1024) throw new Error(`Backup too large for GitHub (${blob.length} bytes).`);

  await assertPrivateRepo(cfg);
  await ensureBranch(cfg);
  const { dir, name } = stamp();
  const remotePath = `backups/${dir}/store-${name}.db.gz.enc`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await github(cfg, "PUT", `/repos/${cfg.repo}/contents/${remotePath}`, {
        message: `backup ${name} (${os.hostname()})`,
        content: blob.toString("base64"),
        branch: BRANCH,
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      log(`Upload attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 10_000));
    }
  }
  if (lastErr) throw lastErr;

  writeConfig({ ...readConfig(), lastHash: hash, lastUploadAt: new Date().toISOString(), lastRemotePath: remotePath, lastError: null });
  log(`Uploaded ${remotePath} (${(blob.length / 1024).toFixed(0)} KB, db ${(snapshot.length / 1024).toFixed(0)} KB).`);
}

// ---------- interactive helpers ----------

function makePrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let muted = false;
  const origWrite = rl._writeToOutput?.bind(rl);
  rl._writeToOutput = (s) => {
    if (!muted) origWrite(s);
    else if (s.includes("\n") || s.includes("\r")) origWrite("\n");
  };
  return {
    ask: (q) => rl.question(q).then((s) => s.trim()),
    secret: async (q) => {
      process.stdout.write(q);
      muted = true;
      try {
        return (await rl.question("")).trim();
      } finally {
        muted = false;
      }
    },
    close: () => rl.close(),
  };
}

function registerDailyTask() {
  if (process.platform !== "win32") {
    log("Not Windows — skipping the scheduled task.");
    return;
  }
  const vbs = path.join(root, "Cloud Backup Hidden.vbs");
  const ps = [
    `$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"${vbs.replace(/'/g, "''")}"'`,
    `$t = New-ScheduledTaskTrigger -Daily -At ${TASK_TIME}`,
    // StartWhenAvailable: if the PC was off at ${TASK_TIME}, run as soon as it's back on.
    `$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)`,
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $a -Trigger $t -Settings $s -Force | Out-Null`,
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { stdio: "pipe" });
    log(`Scheduled task '${TASK_NAME}' registered (daily ${TASK_TIME}, catches up if the PC was off).`);
  } catch {
    try {
      // Fallback without the catch-up setting.
      execFileSync("schtasks.exe", ["/Create", "/F", "/SC", "DAILY", "/ST", TASK_TIME, "/TN", TASK_NAME, "/TR", `wscript.exe "${vbs}"`], { stdio: "pipe" });
      log(`Scheduled task '${TASK_NAME}' registered via schtasks (daily ${TASK_TIME}).`);
    } catch (e) {
      log(`[WARN] Could not register the daily task (${e.message}). The Settings button and Stop POS.bat still work.`);
    }
  }
}

/** Validate + save {repo, token, password}; empty token/password keep the current ones. */
async function saveSettings({ repo, token, password }) {
  const old = readConfig() || {};
  repo = String(repo || old.repo || "").trim()
    .replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Repo must look like owner/name.");
  token = String(token || "").trim() || old.token;
  if (!token) throw new Error("Token is required.");
  password = String(password || "") || old.password;
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
  const cfg = { ...old, repo, token, password };
  await assertPrivateRepo(cfg);
  if (password !== old.password || repo !== old.repo) delete cfg.lastHash; // new key/target → upload a fresh copy
  writeConfig(cfg);
}

function suggestedRepo() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return /github\.com[/:]([\w.-]+\/[\w.-]+?)(\.git)?$/.exec(url)?.[1] || null;
  } catch {
    return null;
  }
}

function status() {
  const cfg = readConfig() || {};
  return {
    configured: Boolean(cfg.repo && cfg.token && cfg.password),
    repo: cfg.repo || null,
    branch: BRANCH,
    suggestedRepo: suggestedRepo(),
    lastUploadAt: cfg.lastUploadAt || null,
    lastRemotePath: cfg.lastRemotePath || null,
    lastError: cfg.lastError || null,
    lastErrorAt: cfg.lastErrorAt || null,
  };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return JSON.parse(data || "{}");
}

async function setup() {
  const p = makePrompt();
  try {
    const old = readConfig() || {};
    console.log("\n=== Cloud backup setup (GitHub, PRIVATE repo) ===\n");
    console.log("1) The repo MUST be private (GitHub -> repo Settings -> Danger Zone -> Change visibility).");
    console.log("2) Create a fine-grained token: github.com/settings/personal-access-tokens/new");
    console.log("   - Repository access: Only select repositories -> this repo");
    console.log("   - Permissions -> Repository -> Contents: Read and write");
    console.log("   - Expiration: the longest allowed (uploads stop when it expires)\n");

    const repoDefault = old.repo || suggestedRepo();
    const repo = (await p.ask(`Repo (owner/name)${repoDefault ? ` [${repoDefault}]` : ""}: `)) || repoDefault;
    const token = await p.secret(`Token${old.token ? " [Enter = keep current]" : ""}: `);

    console.log("\nEncryption password: needed to OPEN the backups later. WRITE IT DOWN somewhere safe —");
    console.log("if it's lost, the backups can never be opened. (Min 8 characters.)");
    const password = await p.secret(`Password${old.password ? " [Enter = keep current]" : ""}: `);
    if (password) {
      const again = await p.secret("Repeat password: ");
      if (again !== password) throw new Error("Passwords don't match.");
    }
    process.stdout.write("\nChecking the repo ... ");
    await saveSettings({ repo, token, password });
    console.log("OK (private).");
    console.log("\nSaved to cloud-backup.json.\n");
  } finally {
    p.close();
  }
  await runBackup({ force: true });
  registerDailyTask();
  console.log(`\nDone. Backups go to branch '${BRANCH}' daily, on 'Stop POS.bat', and from the Settings button.\n`);
}

async function restore(input, output) {
  if (!input) throw new Error("Usage: node scripts/cloud-backup.mjs restore <file.db.gz.enc> [out.db]");
  const out = path.resolve(output || input.replace(/(\.db)?\.gz\.enc$/i, "") + ".db");
  if (fs.existsSync(out)) throw new Error(`Output already exists: ${out}`);
  const p = makePrompt();
  let password;
  try {
    password = await p.secret("Encryption password: ");
  } finally {
    p.close();
  }
  const db = zlib.gunzipSync(decrypt(fs.readFileSync(input), password));
  fs.writeFileSync(out, db);
  console.log(`\nRestored → ${out}`);
  console.log("To use it: stop the POS, then replace <data>\\store.db with this file (delete store.db-wal/-shm).");
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "setup") await setup();
  else if (cmd === "configure") {
    await saveSettings(await readStdin());
    registerDailyTask();
  } else if (cmd === "status") process.stdout.write(JSON.stringify(status()));
  else if (cmd === "restore") await restore(rest[0], rest[1]);
  else {
    try {
      await runBackup({ force: cmd === "--force" });
    } catch (e) {
      // Remember the failure so Settings can show it (e.g. an expired token on the daily run).
      if (readConfig()) writeConfig({ ...readConfig(), lastError: e.message, lastErrorAt: new Date().toISOString() });
      throw e;
    }
  }
} catch (e) {
  log(`[ERROR] ${e.message}`);
  process.exitCode = 1;
}
