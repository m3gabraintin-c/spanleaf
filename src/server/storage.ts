import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** The slice of Supabase Storage the app uses. Tests supply an in-memory version. */
export interface Storage {
  createSignedUploadUrl(bucket: string, path: string): Promise<{ path: string; token: string; signedUrl: string }>;
  createSignedUrls(bucket: string, paths: string[], expiresInSec: number): Promise<Record<string, string>>;
  stat(bucket: string, path: string): Promise<{ size: number; mimeType: string } | null>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** Every object path under a folder (one level of folders deep is enough for media/{userId}/). */
  listFolder(bucket: string, folder: string): Promise<string[]>;
}

export interface AuthAdmin {
  deleteUser(userId: string): Promise<void>;
}

let admin: ReturnType<typeof createClient> | undefined;
function client() {
  if (!admin) {
    const e = supabaseEnv();
    admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export function supabaseStorage(): Storage {
  return {
    async createSignedUploadUrl(bucket, path) {
      const { data, error } = await client().storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) throw new Error("storage: could not create an upload URL");
      return data;
    },
    async createSignedUrls(bucket, paths, expiresInSec) {
      const { data, error } = await client().storage.from(bucket).createSignedUrls(paths, expiresInSec);
      if (error || !data) throw new Error("storage: could not sign URLs");
      const out: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
    async stat(bucket, path) {
      const slash = path.lastIndexOf("/");
      const folder = path.slice(0, slash);
      const name = path.slice(slash + 1);
      const { data, error } = await client().storage.from(bucket).list(folder, { limit: 5, search: name });
      if (error) throw new Error("storage: could not read object info");
      const hit = data?.find((o) => o.name === name);
      if (!hit) return null;
      const meta = (hit.metadata ?? {}) as { size?: number; mimetype?: string };
      return { size: Number(meta.size ?? 0), mimeType: String(meta.mimetype ?? "") };
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const { error } = await client().storage.from(bucket).remove(paths);
      if (error) throw new Error("storage: could not remove objects");
    },
    async listFolder(bucket, folder) {
      const out: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client().storage.from(bucket).list(folder, { limit: 100, offset });
        if (error) throw new Error("storage: could not list a folder");
        if (!data || data.length === 0) break;
        for (const o of data) out.push(`${folder}/${o.name}`);
        if (data.length < 100) break;
      }
      return out;
    },
  };
}

export function supabaseAuthAdmin(): AuthAdmin {
  return {
    async deleteUser(userId) {
      const { error } = await client().auth.admin.deleteUser(userId);
      if (error) throw new Error("auth: could not delete the user");
    },
  };
}
