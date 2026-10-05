// Fills a DEVELOPMENT database with fake templates and stickers so the template picker has something
// to show. No real people, no real images. Safe to run twice. Never run it against production.
//   DATABASE_URL=postgres://... node scripts/seed.mjs
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed with NODE_ENV=production.");
  process.exit(2);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const doc = (n, bg) => ({
  v: 1,
  background: { type: "color", value: bg },
  elements: Array.from({ length: n }, (_, i) => ({
    id: `seed-${i}`, type: "sticker", x: 120 + i * 1080, y: 160, w: 300, h: 300, rotation: 0, locked: false,
    assetPath: "seed/circle.svg",
  })),
});

const templates = [
  ["plain-3", "Plain three", "minimal", "portrait_4_5", 3, false, "#ffffff"],
  ["warm-3", "Warm three", "minimal", "portrait_4_5", 3, false, "#f6ede3"],
  ["square-2", "Square pair", "minimal", "square", 2, false, "#eef2f7"],
  ["story-4", "Story four", "editorial", "story_9_16", 4, false, "#111827"],
  ["film-5", "Film strip", "retro", "portrait_4_5", 5, true, "#1b1b1b"],
  ["grid-6", "Wide grid", "editorial", "portrait_3_4", 6, true, "#fafafa"],
];

try {
  await sql.begin(async (tx) => {
    let order = 0;
    for (const [slug, title, style, format, slides, premium, bg] of templates) {
      const [t] = await tx`
        insert into templates (slug, title, style_tag, format, slide_count, is_premium, status, sort_order)
        values (${slug}, ${title}, ${style}, ${format}, ${slides}, ${premium}, 'published', ${order++})
        on conflict (slug) do update set title = excluded.title, style_tag = excluded.style_tag, format = excluded.format,
          slide_count = excluded.slide_count, is_premium = excluded.is_premium, status = 'published'
        returning id`;
      await tx`insert into template_docs (template_id, doc) values (${t.id}, ${tx.json(doc(slides, bg))})
               on conflict (template_id) do update set doc = excluded.doc`;
    }
    const assets = [["Circle", "shapes"], ["Square", "shapes"], ["Star", "shapes"], ["Squiggle", "doodles"], ["Arrow", "doodles"]];
    for (const [name, category] of assets) {
      await tx`insert into assets (kind, name, category, storage_path, license, source_url)
               select 'sticker', ${name}, ${category}, ${"seed/" + name.toLowerCase() + ".svg"}, 'seed data, no real asset', null
               where not exists (select 1 from assets where name = ${name} and category = ${category})`;
    }
  });
  console.log(`seeded ${templates.length} templates and 5 sticker records (no image files are uploaded)`);
} catch (e) {
  console.error("seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
