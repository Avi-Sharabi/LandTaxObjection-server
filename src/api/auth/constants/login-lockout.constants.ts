// Applied independently per key (once for the IP-scoped bucket, once for the
// email-scoped bucket) — see AuthService.recordFailedLogin.
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_ATTEMPTS_WINDOW_SECONDS = 24 * 60 * 60; // 24h, mirrors reference TTL
export const LOGIN_LOCK_DURATION_SECONDS = 30 * 60; // 30 min
