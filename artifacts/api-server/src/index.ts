import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed.js";

seedDatabase();

// Shop/production mode defaults to 8080 so the one-click Windows launcher works
// with no environment setup. Dev still passes PORT explicitly.
const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
