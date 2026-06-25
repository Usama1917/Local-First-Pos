import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Unknown /api/* routes must return JSON (and a 404), never fall through to the
// SPA HTML fallback below. The router calls next() when no route matches.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "غير موجود" });
});

// --- Shop / production mode: serve the built POS app from this same server ---
// In shop mode one origin (http://localhost:8080) serves BOTH the API (/api/*)
// and the React app, so the owner only needs a single launcher — no separate
// Vite dev server. In development you run Vite on its own port and this block is
// simply skipped because no build output exists. Override the location with the
// POS_STATIC_DIR env var if the build lives elsewhere.
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env["POS_STATIC_DIR"]
  ? path.resolve(process.env["POS_STATIC_DIR"])
  : path.resolve(here, "../../pos/dist/public"); // artifacts/pos/dist/public

if (fs.existsSync(path.join(staticDir, "index.html"))) {
  app.use(express.static(staticDir));
  // SPA fallback: any non-API GET that isn't a real static file returns
  // index.html, so client-side routes and browser refresh on deep links work.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving POS app (shop mode)");
} else {
  logger.info({ staticDir }, "No POS build found — running API only (dev mode)");
}

export default app;
