import api from "./api";
import fake from "./fake";
import type { DataLayer } from "./types";

/**
 * The one switch point. Set NEXT_PUBLIC_DATA_LAYER=api to use the real backend (Supabase).
 * Without it the app runs entirely in the browser on fake data, which is what the demo and the
 * end-to-end check use.
 */
export const data: DataLayer = process.env.NEXT_PUBLIC_DATA_LAYER === "api" ? api : fake;
export * from "./types";
