// Isolated server: never load the shop DB, configuration or hosted credentials.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const dir = mkdtempSync(path.join(tmpdir(), "pos-mobile-test-"));
const child = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
  env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    NODE_ENV: "production", PORT: "18881", POS_HOSTED: "1", POS_AUTH_ENABLED: process.env.MOBILE_AUTH_ENABLED ?? "1",
    POS_DATA_DIR: dir, POS_CONFIG_DIR: path.join(dir, "config"),
    POS_ARCHIVE_DIR: path.join(dir, "archive"),
    POS_ADMIN_USERNAME: "mobile-test", POS_ADMIN_PASSWORD: "Mobile-test-only-2468!",
  },
  stdio: "inherit",
});
let timer;
const stop = () => {
  child.kill("SIGTERM");
  timer = setTimeout(() => child.kill("SIGKILL"), 8_000);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", code => {
  clearTimeout(timer);
  // Only this process's mkdtemp directory; never application data.
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
