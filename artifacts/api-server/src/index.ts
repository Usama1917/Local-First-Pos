import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed.js";
import db from "./lib/db.js";
import { startHostedBackups } from "./lib/hosted-backups.js";

seedDatabase();

// Shop/production mode defaults to 8080 so the one-click Windows launcher works
// with no environment setup. Dev still passes PORT explicitly.
const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
});
server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
const stopBackups = startHostedBackups();
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  stopBackups();
  server.close(() => {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
