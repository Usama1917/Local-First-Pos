// NODE_ENV=production is also used by the Windows launcher. Cloud hardening is
// explicit, and cannot be disabled accidentally on Railway.
export const hosted = process.env.POS_HOSTED === "1" || !!process.env.RAILWAY_ENVIRONMENT_ID;

/**
 * Sign-in is opt-in. Set POS_AUTH_ENABLED=1 to require a username and password.
 * Without it, the system runs as an open single-user system.
 */
export const authEnabled = process.env.POS_AUTH_ENABLED === "1";
