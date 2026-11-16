import sharp from "sharp";
import fs from "node:fs/promises";
import { resolve } from "node:path";
// Run from repository root after replacing public/logo.png and public/icon.svg.
const root = resolve(import.meta.dirname, "..");
const file = (p) => resolve(root, p);
const svg = await fs.readFile(file("apps/web/public/icon.svg"));
for (const n of [192, 512])
  await sharp(svg)
    .resize(n, n)
    .png()
    .toFile(file(`apps/web/public/icon-${n}.png`));
await sharp(svg)
  .resize(410, 410)
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#111111" })
  .png()
  .toFile(file("apps/web/public/icon-maskable.png"));
await sharp(svg)
  .resize(1024, 1024)
  .png()
  .toFile(file("apps/mobile/assets/icon.png"));
await sharp(file("apps/web/public/logo.png"))
  .resize(1000)
  .png()
  .toFile(file("apps/mobile/assets/splash.png"));
await fs.copyFile(
  file("apps/web/public/logo.png"),
  file("apps/mobile/assets/logo.png"),
);
await sharp(Buffer.from(svg.toString().replace(/<rect[^>]*\/>/, "")))
  .resize(96, 96)
  .png()
  .toFile(file("apps/mobile/assets/notification-icon.png"));
console.log("Web and native brand assets generated.");
