import superjson from "superjson";
import { flootAi, FlootAiOutOfCreditsError, FlootAiRateLimitError } from "@floot/ai";
import { schema, OutputType } from "./collage-plan_POST.schema";
import { COLLAGE_COLOURS, COLLAGE_STICKERS, SPOT_NAMES } from "../helpers/collage";

const INSTRUCTIONS = `You art-direct a scrapbook-style photo collage for an Instagram carousel. Photos are placed as loose, overlapping prints on paper. You decide two things.

1. Tilts. Choose a tilt in degrees for every photo, between -9 and 9. Aim for a relaxed, hand-placed look: tilt roughly half to two thirds of the photos by 2 to 7 degrees, keep the rest straight or almost straight (0 to 1), and alternate directions so neighbouring photos on the same slide lean different ways. Keep the photo that matters most on each slide (a clear portrait or the main subject) straight or barely tilted. Detail shots, landscapes and casual snaps can lean more. Never tilt every photo the same way.

2. Stickers. Decorate sparingly: at most three stickers per slide, and not on every photo. Spots on a photo: tape-top, tape-top-left, tape-top-right (strips of tape holding the print; sticker "tape", colour "#f3ead7" or "#ffffff"), pin-top (a push pin; sticker "pin", any bright colour), and accent-top-right, accent-bottom-left, accent-bottom-right (a small decoration overlapping a corner; sticker "daisy" with colour "#ffffff", or "sparkle", "heart" or "star" in a colour that suits the photo). Look at each photo: put accents on the corner furthest from faces and the main subject, never over a face. Prefer tape on tilted photos. extraRotation is a small extra turn for the sticker, -20 to 20, so stickers don't look machine-placed.

Reply with JSON only, matching the schema.`;

const FORMAT = {
  type: "json_schema",
  name: "collage_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["tilts", "stickers"],
    properties: {
      tilts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["photoId", "degrees"],
          properties: { photoId: { type: "string" }, degrees: { type: "number" } },
        },
      },
      stickers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["photoId", "spot", "sticker", "colour", "extraRotation"],
          properties: {
            photoId: { type: "string" },
            spot: { type: "string", enum: SPOT_NAMES },
            sticker: { type: "string", enum: [...COLLAGE_STICKERS] },
            colour: { type: "string", enum: [...COLLAGE_COLOURS] },
            extraRotation: { type: "number" },
          },
        },
      },
    },
  },
} as const;

const reply = (body: unknown, status = 200) => new Response(superjson.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(request: Request) {
  let input;
  try {
    input = schema.parse(superjson.parse(await request.text()));
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Invalid request." }, 400);
  }

  const content = [
    { type: "input_text", text: `There are ${input.photos.length} photos. Each image below is labelled with its id and the slide it is on.` },
    ...input.photos.flatMap((p) => [
      { type: "input_text", text: `Photo id ${p.id}, slide ${p.slide + 1}, ${p.landscape ? "landscape" : "portrait"}:` },
      { type: "input_image", image_url: p.thumb, detail: "low" },
    ]),
  ];

  try {
    const r = await flootAi.chat({
      model: "gpt-6-luna",
      instructions: INSTRUCTIONS,
      input: [{ type: "message", role: "user", content }],
      reasoning: { effort: "low" },
      text: { format: FORMAT },
      max_output_tokens: 3000,
    });
    // Collect the reply text from the response's message items.
    const items = (r.output ?? []) as unknown as { type: string; content?: { type: string; text?: string }[] }[];
    const text = items
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    const plan = JSON.parse(text) as OutputType;
    if (!Array.isArray(plan.tilts) || !Array.isArray(plan.stickers)) throw new Error("The AI's answer wasn't a plan.");
    return reply(plan satisfies OutputType);
  } catch (err) {
    if (err instanceof FlootAiOutOfCreditsError) {
      return reply({ error: "AI features are temporarily unavailable. Please contact the app owner.", code: "OUT_OF_CREDITS" }, 503);
    }
    if (err instanceof FlootAiRateLimitError) {
      return reply({ error: "Too many shuffles at once. Try again in a minute.", code: "RATE_LIMITED" }, 429);
    }
    console.error("collage_plan_failed", err);
    return reply({ error: "The AI couldn't plan the collage this time." }, 502);
  }
}
