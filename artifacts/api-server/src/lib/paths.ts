import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Bundled at artifacts/api-server/dist/index.mjs, so three levels up is the project root.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../../..");
const configFile = path.join(projectRoot, "pos-config.json");
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

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

export function getDataLocationSource(): "env" | "config" | "default" {
  if (process.env.POS_DATA_DIR) return "env";
  return readConfigDir() ? "config" : "default";
}

/** Persist a chosen data directory (applied on next restart). */
export function setConfiguredDataDir(dir: string) {
  writeConfig({ dataDir: dir });
}

/**
 * Folder where every finalized document is auto-archived as a PDF, organized into
 * العملاء/الصنايعية/المشتريات subfolders. Read FRESH each time (via pos-config.json)
 * so changing it from Settings applies immediately — no restart needed. Empty/unset
 * = archiving disabled.
 */
export function getArchiveDir(): string | null {
  const cfg = readConfig();
  return cfg?.archiveDir ? path.resolve(String(cfg.archiveDir)) : null;
}

export function setConfiguredArchiveDir(dir: string) {
  writeConfig({ archiveDir: dir });
}
