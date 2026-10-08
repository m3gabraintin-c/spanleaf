/**
 * Counts how the app is used, through Floot's built-in analytics. The project runs it in "memory" mode: nothing is
 * stored on the visitor's device and no personal data is sent, so no consent banner is needed. Events carry only
 * small counts and names, never photos, words or file names.
 */
type Payload = Record<string, string | number | boolean>;

export const track = (name: string, payload: Payload = {}) => {
  try {
    const w = window as unknown as { flootAnalytics?: { trackEvent?: (n: string, p: Payload) => void } };
    w.flootAnalytics?.trackEvent?.(name, payload);
  } catch {
    /* analytics must never break the app */
  }
};
