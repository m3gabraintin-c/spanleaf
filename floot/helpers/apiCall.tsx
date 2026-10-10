import superjson from "superjson";

/** Calls one of the app's endpoints and gives back its answer, or throws the endpoint's own message. */
export const callApi = async <T,>(path: string, init: RequestInit, fallback: string): Promise<T> => {
  const result = await fetch(path, init);
  const text = await result.text();
  if (!result.ok) {
    let message = fallback;
    try {
      const parsed = JSON.parse(text);
      message = (parsed?.json ?? parsed)?.error ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return superjson.parse<T>(text);
};

export const jsonInit = (body: unknown, init?: RequestInit): RequestInit => ({
  method: "POST",
  body: superjson.stringify(body),
  ...init,
  headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
});