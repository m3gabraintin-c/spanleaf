import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PNG } from "pngjs";

export const ASSETS = path.resolve("test-output/assets");

/** Test images, made once. Nothing here is a real photo or a real person. */
export default async function globalSetup() {
  fs.mkdirSync(ASSETS, { recursive: true });

  // 1600x1000 red-to-blue gradient. Smooth, so any misalignment shows up in the pixels.
  const W = 1600, H = 1000;
  const g = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (W * y + x) << 2;
      g.data[i] = Math.round(255 * (1 - x / (W - 1)));
      g.data[i + 1] = 40;
      g.data[i + 2] = Math.round(255 * (x / (W - 1)));
      g.data[i + 3] = 255;
    }
  fs.writeFileSync(path.join(ASSETS, "gradient.png"), PNG.sync.write(g));

  // 800x600, left half fully transparent, right half solid green
  const t = new PNG({ width: 800, height: 600 });
  for (let y = 0; y < 600; y++)
    for (let x = 0; x < 800; x++) {
      const i = (800 * y + x) << 2;
      const solid = x >= 400;
      t.data[i] = 0; t.data[i + 1] = 160; t.data[i + 2] = 60; t.data[i + 3] = solid ? 255 : 0;
    }
  fs.writeFileSync(path.join(ASSETS, "transparent.png"), PNG.sync.write(t));

  // A 1600x1000 JPEG whose pixels are stored sideways, with EXIF orientation 6 (rotate 90 clockwise to
  // view). A phone camera makes these. Shown correctly it is 1000 wide and 1600 tall.
  // The left third is red so a wrong rotation is easy to spot.
  const raw = Buffer.alloc(1600 * 1000 * 3);
  for (let y = 0; y < 1000; y++)
    for (let x = 0; x < 1600; x++) {
      const i = (1600 * y + x) * 3;
      const red = x < 533;
      raw[i] = red ? 230 : 40; raw[i + 1] = red ? 30 : 90; raw[i + 2] = red ? 30 : 200;
    }
  await sharp(raw, { raw: { width: 1600, height: 1000, channels: 3 } }).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toFile(path.join(ASSETS, "sideways.jpg"));

  // 8000x6000 solid colour. Tiny on disk, but 192 MB once decoded, like a big camera file.
  await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#3a7bd5" } }).jpeg({ quality: 70 }).toFile(path.join(ASSETS, "huge.jpg"));
}
