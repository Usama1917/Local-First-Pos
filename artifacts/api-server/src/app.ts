import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { requireAuth } from "./middlewares/auth";
import { logger } from "./lib/logger";
import { hosted } from "./lib/runtime.js";
import { requirePermissions } from "./middlewares/permissions.js";

const app: Express = express();
app.disable("x-powered-by");
// Railway's edge appends the client address; trust only the immediate proxy.
if (process.env.RAILWAY_ENVIRONMENT_ID) app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  if (hosted) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});

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
if (!hosted) app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authenticate every /api request (login + health are whitelisted inside).
app.use("/api", requireAuth);
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/api", requirePermissions);
app.use("/api", router);

// Unknown /api/* routes must return JSON (and a 404), never fall through to the
// SPA HTML fallback below. The router calls next() when no route matches.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "غير موجود" });
});
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "API request failed");
  const status = err?.status === 413 ? 413 : err?.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 500 ? "حدث خطأ داخلي" : "بيانات الطلب غير صالحة" });
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
