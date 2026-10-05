import { z } from "zod";
import { DocSchema } from "@/lib/doc";
import { ACCEPTED_IMAGE_TYPES, FORMAT_KEYS, MAX_IMAGE_EDGE, MAX_UPLOAD_BYTES } from "@/lib/formats";

/** Input shapes for every route. The same schemas run in the tests. */
const format = z.enum(FORMAT_KEYS as [string, ...string[]]);
const title = z.string().trim().max(80);

export const createProjectInput = z.object({
  format: format.optional(),
  slideCount: z.number().int().min(1).max(20).optional(),
  title: title.optional(),
  templateId: z.string().uuid().optional(),
});

export const patchProjectInput = z.object({
  rev: z.number().int().min(0),
  doc: DocSchema.optional(),
  title: title.optional(),
  format: format.optional(),
  slideCount: z.number().int().min(1).max(20).optional(),
});

export const listProjectsInput = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const uploadUrlInput = z.object({
  kind: z.literal("image"),
  mime: z.enum(ACCEPTED_IMAGE_TYPES as [string, ...string[]]),
  bytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  width: z.number().int().min(1).max(MAX_IMAGE_EDGE),
  height: z.number().int().min(1).max(MAX_IMAGE_EDGE),
});

export const mediaUrlsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

export const templatesInput = z.object({
  style: z.string().max(40).optional(),
  format: format.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const assetsInput = z.object({
  kind: z.enum(["sticker", "frame"]),
  category: z.string().max(40).optional(),
});

export const checkoutInput = z.object({ returnTo: z.string().max(200).optional() });
export const deleteMeInput = z.object({ confirm: z.literal("DELETE") });
export const onboardingInput = z.object({ locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional() });

export { safeReturnTo } from "@/lib/redirect";
