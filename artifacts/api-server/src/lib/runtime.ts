// NODE_ENV=production is also used by the Windows launcher. Cloud hardening is
// explicit, and cannot be disabled accidentally on Railway.
export const hosted = process.env.POS_HOSTED === "1" || !!process.env.RAILWAY_ENVIRONMENT_ID;
