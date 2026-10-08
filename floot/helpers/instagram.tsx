/**
 * Checks against Instagram's published limits for a feed post, so problems show up before posting rather than
 * after. The limits are Instagram's as of 2026: up to 20 photos or videos in a carousel, captions up to 2,200
 * characters, at most 30 hashtags and 20 mentions.
 */
export const IG_LIMITS = { slides: 20, characters: 2200, hashtags: 30, mentions: 20 } as const;

export const instagramChecks = ({ caption, slides, storyShape }: { caption: string; slides: number; storyShape: boolean }) => {
  const characters = [...caption].length;
  const hashtags = (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  const mentions = (caption.match(/(^|\s)@[\w.]+/g) ?? []).length;
  const warnings: string[] = [];
  if (slides > IG_LIMITS.slides)
    warnings.push(`Instagram takes up to ${IG_LIMITS.slides} slides in one carousel; this export has ${slides}. Export slides 1-20 for one post and the rest for another.`);
  if (characters > IG_LIMITS.characters) warnings.push(`The caption is ${characters - IG_LIMITS.characters} characters over Instagram's limit of 2,200.`);
  if (hashtags > IG_LIMITS.hashtags) warnings.push(`The caption has ${hashtags} hashtags; Instagram allows ${IG_LIMITS.hashtags}.`);
  if (mentions > IG_LIMITS.mentions) warnings.push(`The caption mentions ${mentions} accounts; Instagram allows ${IG_LIMITS.mentions}.`);
  if (storyShape) warnings.push("These slides are 9:16. A feed carousel shows 4:5 at most, so the top and bottom will be cut off. Use 4:5 for feed posts.");
  return { characters, hashtags, mentions, warnings };
};
