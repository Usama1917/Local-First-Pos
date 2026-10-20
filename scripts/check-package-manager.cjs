const path = require("node:path");
const ua = process.env.npm_config_user_agent || "";
const cli = path.basename(process.env.npm_execpath || "");
if (ua !== "pnpm" && !ua.startsWith("pnpm/") && !/^pnpm(?:\.(?:c?js|mjs))?$/.test(cli)) {
  console.error("Use pnpm instead", { userAgent: ua, executable: cli });
  process.exit(1);
}
