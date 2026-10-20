import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import db from "./db.js";
import { backupDir, projectRoot } from "./paths.js";
import { hosted } from "./runtime.js";
import { logger } from "./logger.js";

// One process / one volume. Keep seven daily consistent SQLite snapshots locally;
// these are NOT a replacement for off-site backup or Railway volume backups.
export function startHostedBackups(): () => void {
  if (!hosted) return () => {};
  let busy = false;
  const runScript = (args: string[]) => new Promise<string>((resolve, reject) => {
    execFile(process.execPath, [path.join(projectRoot, "scripts/cloud-backup.mjs"), ...args],
      { cwd: projectRoot, timeout: 300_000 }, (err, stdout) => err ? reject(err) : resolve(stdout));
  });
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const target = path.join(backupDir, `auto-${today}.db`);
      if (!fs.existsSync(target)) {
        const pending = `${target}.pending`;
        // Only our own incomplete snapshot is replaced after a crash.
        if (fs.existsSync(pending)) fs.unlinkSync(pending);
        db.exec(`VACUUM INTO '${pending.replace(/'/g, "''")}'`);
        fs.renameSync(pending, target);
        const snapshots = fs.readdirSync(backupDir).filter(f => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        for (const file of snapshots.slice(0, -7)) fs.unlinkSync(path.join(backupDir, file));
        logger.info("Created daily database snapshot");
      }
      const status = JSON.parse(await runScript(["status"]));
      if (status.configured && (!status.lastUploadAt || Date.now() - Date.parse(status.lastUploadAt) >= 86_400_000)) {
        await runScript([]);
        logger.info("Encrypted off-site backup check completed");
      }
    } catch (err) {
      logger.error({ err }, "Hosted backup failed; retrying in one hour");
    } finally { busy = false; }
  }
  const initial = setTimeout(() => void tick(), 60_000);
  const hourly = setInterval(() => void tick(), 3_600_000);
  initial.unref();
  hourly.unref();
  return () => { clearTimeout(initial); clearInterval(hourly); };
}
