import type { Doc } from "@/lib/doc";
import type { FormatKey } from "@/lib/formats";
import type { ThemeChoice } from "@/lib/themes";

/**
 * The data layer contract. Every function maps to a route in architecture.md, so swapping the
 * fake implementation for the real API changes no screen code.
 */
export type DataErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "REV_CONFLICT"
  | "LIMIT_REACHED"
  | "INVALID"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "DECODE_FAILED"
  | "RATE_LIMITED"
  | "UPLOAD_MISSING"
  | "IN_USE"
  | "ACCOUNT_DELETING"
  | "NETWORK"
  | "INTERNAL";

export class DataError extends Error {
  code: DataErrorCode;
  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
  }
}

export interface Me {
  id: string;
  email: string;
  /** The fields below come from the real API. The fake data layer leaves them out. */
  onboardingCompleted?: boolean;
  locale?: string;
}

/** Real sign-in sends an email link and finishes in another tab. The fake signs in on the spot. */
type SignInResult = { status: "signed_in"; me: Me } | { status: "check_email" };

interface Capabilities {
  google: boolean;
  /** Whether signing in sends an email link. The browser-only build doesn't. */
  email: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
  format: FormatKey;
  slideCount: number;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  doc: Doc;
  rev: number;
}

export interface MediaRecord {
  id: string;
  kind: "image";
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  name: string;
}

export interface MediaUrls {
  url: string;
  thumbUrl: string;
}

interface SavePatch {
  /** The revision the client last saw. A mismatch means someone else saved first. */
  rev: number;
  doc?: Doc;
  title?: string;
  format?: FormatKey;
  slideCount?: number;
}

export interface DataLayer {
  capabilities: Capabilities;
  /** GET /api/me */
  getMe(): Promise<Me | null>;
  /** Supabase email link. The fake one signs you in on this device without sending email. */
  signIn(email: string, next?: string): Promise<SignInResult>;
  /** Only when capabilities.google is true. */
  signInWithGoogle?(): Promise<void>;
  signOut(): Promise<void>;
  /** POST /api/onboarding/complete */
  completeOnboarding(locale?: string): Promise<void>;
  /** DELETE /api/me. Signs the user out afterwards. */
  deleteAccount(): Promise<void>;
  /** GET /api/projects */
  listProjects(): Promise<ProjectSummary[]>;
  /** POST /api/projects */
  createProject(input: { format: FormatKey; slideCount: number; title?: string }): Promise<Project>;
  /**
   * POST /api/compose. Turns photos already uploaded with uploadImage into a finished carousel and returns the
   * new project. The real API asks a vision model to choose colours, captions and a style. The fake one
   * uses plain defaults. Same seed, same layout.
   */
  composeProject(input: { mediaIds: string[]; format?: FormatKey; title?: string; seed?: number; theme?: ThemeChoice }): Promise<Project>;
  /** GET /api/projects/:id */
  getProject(id: string): Promise<Project>;
  /** PATCH /api/projects/:id. Throws REV_CONFLICT. */
  saveProject(id: string, patch: SavePatch): Promise<{ rev: number }>;
  /**
   * A last save for when the page is closing or reloading. It can't be awaited and must start
   * synchronously, so a normal save, which waits on I/O first, would be cut off. Best effort.
   */
  saveProjectOnExit?(id: string, patch: SavePatch): void;
  /** POST /api/projects/:id/duplicate. A copy, with " copy" added to its title. */
  duplicateProject(id: string): Promise<ProjectSummary>;
  /** DELETE /api/projects/:id. Moves it to the trash, where restoreProject can bring it back for 30 days. */
  deleteProject(id: string): Promise<void>;
  /** POST /api/projects/:id/restore */
  restoreProject(id: string): Promise<void>;
  /** Changes a project's title without opening it. */
  renameProject(id: string, title: string): Promise<void>;
  /** POST /api/media/upload-url, then PUT to the signed URL, then POST /api/media/:id/complete */
  uploadImage(file: File): Promise<MediaRecord>;
  /** POST /api/media/urls */
  getMediaUrls(ids: string[]): Promise<Record<string, MediaUrls>>;
}
