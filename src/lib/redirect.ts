/** Only same-site paths. Stops a crafted link from sending someone to another site after sign-in or checkout. */
export function safeReturnTo(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  if (!/^\/(?!\/)[A-Za-z0-9/_\-.]*$/.test(raw)) return fallback;
  return raw;
}
