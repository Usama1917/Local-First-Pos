// مسح البيانات التجريبية (الوهمية) من قاعدة بيانات المحل — بيتعمل مرة واحدة بعد التثبيت.
// بيحتفظ بـ: المستخدمين، الإعدادات (اسم المحل…)، التصنيفات، الوحدات.
// وبيمسح كل حاجة تانية: المنتجات، العملاء، الموردين، الصنايعية، الماركات، الفواتير،
// التسعيرات، المشتريات، المرتجعات، الحركات، المدفوعات، المصروفات… ويصفّر ترقيم الفواتير.
// بياخد نسخة احتياطية كاملة الأول في <data>\backups. لازم النظام يكون مقفول ("Stop POS.bat").
//
//   node scripts\clear-demo-data.mjs
//
// (الرسائل بالإنجليزي عشان تظهر سليمة في الـ cmd العادي.)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const KEEP = new Set(["users", "sessions", "settings", "categories", "units"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function fail(msg) {
  console.error(`\n[ERROR] ${msg}\n`);
  process.exit(1);
}

async function serverIsRunning() {
  const port = process.env.PORT || "8080";
  try {
    await fetch(`http://localhost:${port}/api/healthz`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

const dataDir = resolveDataDir();
const dbPath = path.join(dataDir, "store.db");
if (!fs.existsSync(dbPath)) fail(`Database not found: ${dbPath}`);
if (await serverIsRunning()) fail('The POS server is running. Close it first with "Stop POS.bat", then run this again.');

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);
const toClear = tables.filter((t) => !KEEP.has(t));
const counts = toClear.map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n]);

console.log(`\nDatabase: ${dbPath}\n`);
console.log("Will DELETE all rows from:");
for (const [t, n] of counts) if (n > 0) console.log(`  - ${t.padEnd(24)} ${n}`);
console.log(`\nWill KEEP: ${[...KEEP].join(", ")}`);
console.log("A full backup is taken first.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('Type YES to continue: ')).trim();
rl.close();
if (answer !== "YES") {
  console.log("Cancelled — nothing was changed.");
  process.exit(0);
}

// 1) Backup — VACUUM INTO writes a consistent single-file snapshot (includes the WAL).
const backupDir = path.join(dataDir, "backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const backupFile = path.join(backupDir, `store-before-clear-demo-${stamp}.db`);
db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
console.log(`\nBackup saved: ${backupFile}`);

// 2) Clear. FK checks off for the bulk delete (order doesn't matter), verified after.
db.exec("PRAGMA foreign_keys = OFF");
db.exec("BEGIN");
try {
  for (const t of toClear) db.exec(`DELETE FROM "${t}"`);
  const hasSeq = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'").get();
  if (hasSeq) {
    const del = db.prepare("DELETE FROM sqlite_sequence WHERE name = ?");
    for (const t of toClear) del.run(t);
  }
  // Invoice / quotation / purchase numbering restarts at 000001.
  db.exec("UPDATE settings SET invoiceCounter = 0, quotationCounter = 0, purchaseCounter = 0, updatedAt = datetime('now') WHERE id = 1");
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  fail(`Nothing was changed: ${err.message}`);
}
db.exec("PRAGMA foreign_keys = ON");

const broken = db.prepare("PRAGMA foreign_key_check").all();
if (broken.length > 0) console.warn(`[WARN] ${broken.length} dangling reference(s):`, broken);

db.exec("VACUUM");
db.close();

console.log("\nDone. Demo data cleared. Start the system again from the desktop shortcut.\n");
