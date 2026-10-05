import { prepareImage } from "@/lib/image";
import type { Doc } from "@/lib/doc";
import { browserSupabase } from "./supabase-browser";
import {
  DataError,
  type DataErrorCode,
  type DataLayer,
  type MediaRecord,
  type MediaUrls,
  type Me,
  type Project,
  type ProjectSummary,
} from "./types";

/** Calls the Next.js routes in src/app/api. Same contract as fake.ts, so no screen changes. */

async function refreshSession() {
  try {
    // Renews the access token when it is close to expiring, and rewrites the cookie the API reads.
    await browserSupabase().auth.getSession();
  } catch {
    // The API call will report UNAUTHENTICATED if there is really no session.
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await refreshSession();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new DataError("NETWORK", "Can't reach the server. Check your connection.");
  }
  if (!res.ok) {
    let code: DataErrorCode = "INTERNAL";
    let message = "Something went wrong. Try again.";
    try {
      const j = (await res.json()) as { error?: { code?: DataErrorCode; message?: string } };
      if (j.error?.code) code = j.error.code;
      if (j.error?.message) message = j.error.message;
    } catch {
      // not JSON, keep the defaults
    }
    throw new DataError(code, message);
  }
  return (await res.json()) as T;
}

const q = (o: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]]))).toString();
  return s ? `?${s}` : "";
};

const origin = () => (typeof location === "undefined" ? "" : location.origin);

const api: DataLayer = {
  capabilities: { google: process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1", billing: true },

  async getMe() {
    try {
      return await call<Me>("GET", "/api/me");
    } catch (e) {
      if (e instanceof DataError && (e.code === "UNAUTHENTICATED" || e.code === "ACCOUNT_DELETING")) return null;
      throw e;
    }
  },

  async signIn(email, next) {
    const back = next && next !== "/app" ? `?next=${encodeURIComponent(next)}` : "";
    const { error } = await browserSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${origin()}/auth/callback${back}`, shouldCreateUser: true },
    });
    if (error) {
      if (error.status === 429) throw new DataError("RATE_LIMITED", "Too many sign-in emails. Wait a few minutes and try again.");
      if (error.status === 400 || error.status === 422) throw new DataError("INVALID", "Enter a valid email address.");
      throw new DataError("INTERNAL", "Couldn't send the sign-in email. Try again.");
    }
    return { status: "check_email" };
  },

  async signInWithGoogle() {
    const { error } = await browserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin()}/auth/callback` } });
    if (error) throw new DataError("INTERNAL", "Couldn't start Google sign-in. Try again.");
  },

  async signOut() {
    await browserSupabase().auth.signOut();
  },

  async completeOnboarding(locale) {
    await call("POST", "/api/onboarding/complete", locale ? { locale } : {});
  },

  startCheckout: (returnTo) => call("POST", "/api/billing/checkout", returnTo ? { returnTo } : {}),
  openPortal: (returnTo) => call("POST", "/api/billing/portal", returnTo ? { returnTo } : {}),

  async deleteAccount() {
    await call("DELETE", "/api/me", { confirm: "DELETE" });
    await browserSupabase().auth.signOut();
  },

  async listProjects() {
    const all: ProjectSummary[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await call<{ items: ProjectSummary[]; next: string | null }>("GET", `/api/projects${q({ limit: 50, cursor })}`);
      all.push(...r.items);
      if (!r.next) break;
      cursor = r.next;
    }
    return all;
  },

  async createProject(input) {
    return (await call<{ project: Project }>("POST", "/api/projects", input)).project;
  },

  async composeProject(input) {
    return (await call<{ project: Project }>("POST", "/api/compose", input)).project;
  },

  async getProject(id) {
    return (await call<{ project: Project }>("GET", `/api/projects/${encodeURIComponent(id)}`)).project;
  },

  saveProject: (id, patch) => call<{ rev: number }>("PATCH", `/api/projects/${encodeURIComponent(id)}`, patch as { rev: number; doc?: Doc }),

  saveProjectOnExit(id, patch) {
    try {
      // keepalive lets the request finish after the page has gone. The browser caps these at 64 KB, and
      // a bigger document falls back to the normal 1.5 second autosave.
      void fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch as { rev: number; doc?: Doc }),
      }).catch(() => {});
    } catch {
      // too large for keepalive, or the browser refused. Nothing more can be done here.
    }
  },

  async uploadImage(file) {
    // Resize and make a thumbnail here, then ask the API where to put them. The API checks type, size
    // and quota before it hands out an upload URL, and checks the stored file again afterwards.
    const img = await prepareImage(file);
    const slot = await call<{
      mediaId: string;
      upload: { path: string; token: string };
      thumbUpload: { path: string; token: string };
    }>("POST", "/api/media/upload-url", { kind: "image", mime: img.mimeType, bytes: img.full.size, width: img.width, height: img.height });

    const bucket = browserSupabase().storage.from("media");
    const main = await bucket.uploadToSignedUrl(slot.upload.path, slot.upload.token, img.full, { contentType: img.mimeType });
    if (main.error) throw new DataError("NETWORK", "The upload failed. Try again.");
    // A missing thumbnail is not fatal. The photo itself still works.
    await bucket.uploadToSignedUrl(slot.thumbUpload.path, slot.thumbUpload.token, img.thumb, { contentType: img.mimeType });

    const done = await call<{ media: Omit<MediaRecord, "name"> }>("POST", `/api/media/${slot.mediaId}/complete`);
    return { ...done.media, name: file.name || "Photo" };
  },

  async getMediaUrls(ids) {
    const out: Record<string, MediaUrls> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const r = await call<{ urls: Record<string, MediaUrls> }>("POST", "/api/media/urls", { ids: ids.slice(i, i + 100) });
      Object.assign(out, r.urls);
    }
    return out;
  },
};

export default api;
