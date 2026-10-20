import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { hosted } from "./runtime.js";

// Bundled at artifacts/api-server/dist/index.mjs, so three levels up is the project root.
const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, "../../..");
const configDir = process.env.POS_CONFIG_DIR
  ? path.resolve(process.env.POS_CONFIG_DIR)
  : hosted && process.env.POS_DATA_DIR
    ? path.join(path.resolve(process.env.POS_DATA_DIR), "config")
    : projectRoot;
const configFile = path.join(configDir, "pos-config.json");
const defaultDataDir = path.join(projectRoot, "data");

function readConfig(): Record<string, any> {
  try {
    if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile, "utf8")) || {};
  } catch {
    /* ignore a corrupt config */
  }
  return {};
}

function writeConfig(patch: Record<string, any>) {
  const cfg = { ...readConfig(), ...patch };
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), "utf8");
}

function readConfigDir(): string | null {
  const cfg = readConfig();
  return cfg?.dataDir ? path.resolve(String(cfg.dataDir)) : null;
}

/**
 * Where the local SQLite database (and its backups) live. Resolution order:
 *  1) POS_DATA_DIR env var  (e.g. set by "Start POS.bat" on the shop PC)
 *  2) the path saved from the app's Settings → النسخ الاحتياطي  (pos-config.json)
 *  3) <project>/data  (default)
 * Keeping shop data OUT of the project folder is recommended so updates never touch it.
 */
export const dataDir = process.env.POS_DATA_DIR
  ? path.resolve(process.env.POS_DATA_DIR)
  : readConfigDir() || defaultDataDir;

export const dbPath = path.join(dataDir, "store.db");
export const backupDir = path.join(dataDir, "backups");

if (hosted) {
  if (!process.env.POS_DATA_DIR || !path.isAbsolute(process.env.POS_DATA_DIR)) {
    throw new Error("Hosted mode requires an absolute POS_DATA_DIR on a persistent volume.");
  }
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (process.env.RAILWAY_ENVIRONMENT_ID && !mount) {
    throw new Error("Attach a Railway Volume at /data before starting this service.");
  }
  const persistentRoot = path.resolve(mount || dataDir);
  for (const dir of [dataDir, configDir, process.env.POS_ARCHIVE_DIR || path.join(dataDir, "archive")]) {
    const relative = path.relative(persistentRoot, path.resolve(dir));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Hosted database, configuration and archive must stay inside the persistent volume.");
    }
  }
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

export function getDataLocationSource(): "env" | "config" | "default" {
  if (process.env.POS_DATA_DIR) return "env";
  return readConfigDir() ? "config" : "default";
}

/** Persist a chosen data directory (applied on next restart). */
export function setConfiguredDataDir(dir: string) {
  if (hosted) throw new Error("مكان البيانات ثابت في إعدادات الاستضافة");
  writeConfig({ dataDir: dir });
}

/**
 * Folder where every finalized document is auto-archived as a PDF, organized into
 * العملاء/الصنايعية/المشتريات subfolders. Read FRESH each time (via pos-config.json)
 * so changing it from Settings applies immediately — no restart needed. Empty/unset
 * = archiving disabled.
 */
export function getArchiveDir(): string | null {
  if (process.env.POS_ARCHIVE_DIR) return path.resolve(process.env.POS_ARCHIVE_DIR);
  if (hosted) return path.join(dataDir, "archive");
  const cfg = readConfig();
  return cfg?.archiveDir ? path.resolve(String(cfg.archiveDir)) : null;
}

export function setConfiguredArchiveDir(dir: string) {
  if (hosted || process.env.POS_ARCHIVE_DIR) throw new Error("مكان الأرشفة ثابت في إعدادات الاستضافة");
  writeConfig({ archiveDir: dir });
}
