import { z } from "zod";
import { ThemeChoiceSchema } from "@/lib/themes";
import { DocSchema } from "@/lib/doc";
import { ACCEPTED_IMAGE_TYPES, FORMAT_KEYS, MAX_BATCH_PHOTOS, MAX_IMAGE_EDGE, MAX_SLIDES, MAX_UPLOAD_BYTES, type FormatKey } from "@/lib/formats";

/** Input shapes for every route. The same schemas run in the tests. */
const format = z.enum(FORMAT_KEYS as [FormatKey, ...FormatKey[]]);
const title = z.string().trim().max(80);

export const createProjectInput = z.object({
  format: format.optional(),
  slideCount: z.number().int().min(1).max(MAX_SLIDES).optional(),
  title: title.optional(),
});

export const patchProjectInput = z.object({
  rev: z.number().int().min(0),
  doc: DocSchema.optional(),
  title: title.optional(),
  format: format.optional(),
  slideCount: z.number().int().min(1).max(MAX_SLIDES).optional(),
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

export const composeInput = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH_PHOTOS),
  format: format.optional(),
  title: title.optional(),
  seed: z.number().int().min(0).max(1_000_000).optional(),
  theme: ThemeChoiceSchema.optional(),
});

export const deleteMeInput = z.object({ confirm: z.literal("DELETE") });
export const onboardingInput = z.object({ locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional() });

export { safeReturnTo } from "@/lib/redirect";
