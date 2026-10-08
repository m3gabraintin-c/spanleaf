import { z } from "zod";
import superjson from "superjson";
import { COLLAGE_COLOURS, COLLAGE_STICKERS, SPOT_NAMES } from "../helpers/collage";

export const schema = z.object({
  photos: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        /** A small JPEG of the photo, as a data address, so the AI can see what is in it. */
        thumb: z.string().startsWith("data:image/jpeg;base64,").max(80_000),
        slide: z.number().int().min(0).max(500),
        landscape: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  tilts: { photoId: string; degrees: number }[];
  stickers: {
    photoId: string;
    spot: (typeof SPOT_NAMES)[number];
    sticker: (typeof COLLAGE_STICKERS)[number];
    colour: (typeof COLLAGE_COLOURS)[number];
    extraRotation: number;
  }[];
};

export class CollagePlanError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

export const postCollagePlan = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/collage-plan`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const text = await result.text();
    let error = "The AI couldn't plan the collage.";
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text);
      const obj = parsed?.json ?? parsed;
      error = obj?.error ?? error;
      code = obj?.code;
    } catch {
      /* not JSON */
    }
    throw new CollagePlanError(error, code);
  }
  return superjson.parse<OutputType>(await result.text());
};
