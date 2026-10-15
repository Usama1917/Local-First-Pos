import { Router } from "express";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { execFile } from "child_process";
import db from "../lib/db.js";
import { projectRoot, dataDir, dbPath, backupDir, getDataLocationSource, setConfiguredDataDir, getArchiveDir, setConfiguredArchiveDir } from "../lib/paths.js";
import { pickFolder } from "../lib/dialog.js";
import { browserAvailable } from "../lib/pdf.js";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

// Backups contain the entire database (including user passwords) and data-dir
// changes affect the whole install — admin-only.
router.use("/backup", requireAdmin);

// Create a compressed (.zip) backup of a consistent DB snapshot, saved under
// <dataDir>/backups. The client then downloads it (browser asks where to save).
router.post("/backup/create", (_req, res) => {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshot = path.join(backupDir, `store-${ts}.db`);
    // VACUUM INTO writes a single, consistent snapshot DB (no wal/shm), and is a
    // portable SQLite feature (node:sqlite has no instance .backup() method).
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);

    const zipPath = path.join(backupDir, `backup-${ts}.zip`);
    const zip = new AdmZip();
    zip.addLocalFile(snapshot, "", "store.db");
    zip.writeZip(zipPath);
    fs.unlinkSync(snapshot);

    db.prepare("UPDATE settings SET lastBackupAt = datetime('now') WHERE id = 1").run();
    const size = fs.statSync(zipPath).size;
    res.json({ filename: `backup-${ts}.zip`, path: zipPath, size, createdAt: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/backup/list", (_req, res) => {
  try {
    if (!fs.existsSync(backupDir)) return res.json([]);
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".zip"))
      .map((f) => {
        const full = path.join(backupDir, f);
        const st = fs.statSync(full);
        return { filename: f, path: full, size: st.size, createdAt: st.birthtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// Stream a backup file as an attachment so the browser shows a "save as" dialog.
router.get("/backup/download/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // guard against path traversal
  const full = path.join(backupDir, filename);
  if (!filename.endsWith(".zip") || !fs.existsSync(full)) {
    return res.status(404).json({ error: "النسخة غير موجودة" });
  }
  res.download(full, filename);
});

// Where the database / backups are stored (shown in Settings).
router.get("/backup/info", (_req, res) => {
  res.json({
    dataDir, dbPath, backupDir, source: getDataLocationSource(),
    archiveDir: getArchiveDir(), pdfEngineAvailable: browserAvailable(),
  });
});

// Choose a new data directory (applied after a restart).
router.post("/backup/data-dir", (req, res) => {
  const { dir } = req.body;
  if (!dir || typeof dir !== "string") return res.status(400).json({ error: "المسار مطلوب" });
  try {
    setConfiguredDataDir(dir.trim());
    res.json({ success: true, dir: dir.trim(), restartRequired: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Choose the auto-archive folder (applies immediately — read fresh each document).
router.post("/backup/archive-dir", (req, res) => {
  const { dir } = req.body;
  if (typeof dir !== "string") return res.status(400).json({ error: "المسار مطلوب" });
  try {
    setConfiguredArchiveDir(dir.trim());
    res.json({ success: true, dir: dir.trim() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Open a native folder-picker on the shop PC and return the chosen path ("" = cancelled).
router.post("/backup/pick-folder", (_req, res) => {
  pickFolder()
    .then((dir) => res.json({ path: dir }))
    .catch((e: any) => res.status(500).json({ error: e.message }));
});

// ---- Cloud backup (encrypted DB → private GitHub repo, branch db-backups) ----
// All the logic lives in scripts/cloud-backup.mjs (also run daily by Task Scheduler and by
// "Stop POS.bat"); these routes just drive it. Token/password never leave the server.
const cloudScript = path.join(projectRoot, "scripts", "cloud-backup.mjs");

// The script logs in English (for cmd); show the shop the common causes in Arabic.
function cloudErrorAr(msg: string): string {
  if (/→ 401/.test(msg)) return "التوكن غلط أو انتهت صلاحيته — اعمل توكن جديد ودخّله من «تعديل الإعداد».";
  if (/NOT private/.test(msg)) return "الريبو عام (Public) — لازم تخليه خاص (Private) من إعدادات الريبو على GitHub الأول.";
  if (/→ (403|404)/.test(msg)) return "التوكن مالوش صلاحية على الريبو ده — لازم Contents: Read and write على نفس الريبو.";
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|aborted/i.test(msg)) return "مفيش إنترنت أو GitHub مش بيرد — جرّب تاني بعدين.";
  if (/Password must be/.test(msg)) return "كلمة سر التشفير لازم ٨ حروف على الأقل.";
  if (/Token is required/.test(msg)) return "التوكن مطلوب.";
  if (/Repo must look like/.test(msg)) return "اكتب الريبو بالشكل ده: owner/name";
  return msg;
}

function runCloud(args: string[], input?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [cloudScript, ...args], { cwd: projectRoot, timeout: 5 * 60_000 }, (err, stdout) => {
      if (!err) return resolve(stdout);
      const line = stdout.split(/\r?\n/).reverse().find((l) => l.includes("[ERROR]"));
      reject(new Error(cloudErrorAr(line ? line.replace(/^.*\[ERROR\]\s*/, "") : err.message)));
    });
    child.stdin?.end(input === undefined ? "" : JSON.stringify(input));
  });
}

function cloudStatus() {
  return runCloud(["status"]).then((out) => {
    const st = JSON.parse(out);
    return { ...st, lastError: st.lastError ? cloudErrorAr(st.lastError) : null };
  });
}

router.get("/backup/cloud/status", (_req, res) => {
  cloudStatus()
    .then((st) => res.json(st))
    .catch((e) => res.status(500).json({ error: e.message }));
});

// Save repo/token/password (empty token/password = keep current) + register the daily task.
router.post("/backup/cloud/config", (req, res) => {
  const { repo, token, password } = req.body || {};
  runCloud(["configure"], { repo, token, password })
    .then(() => res.json({ success: true }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

// The Settings button: upload a fresh encrypted copy now.
router.post("/backup/cloud/run", (_req, res) => {
  runCloud(["--force"])
    .then(cloudStatus)
    .then((st) => res.json(st))
    .catch((e) => res.status(500).json({ error: e.message }));
});

router.post("/backup/restore", (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "اسم الملف مطلوب" });
  // Restoring a live SQLite DB safely needs a restart-time swap — not yet implemented.
  res.status(501).json({ error: "الاستعادة من داخل التطبيق غير مفعّلة بعد — استبدل data/store.db يدويًا ثم أعد التشغيل" });
});

export default router;
