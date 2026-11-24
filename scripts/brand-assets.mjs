import sharp from "sharp";
import fs from "node:fs/promises";
import { resolve } from "node:path";

// Source assets: transparent web wordmark and the original mobile autologo.png.
// Crop the actual opening A instead of substituting a font or redrawing it.
const root = resolve(import.meta.dirname, "..");
const file = (path) => resolve(root, path);
const brand = JSON.parse(await fs.readFile(file("config/brand.json"), "utf8"));
const { data, info } = await sharp(file("apps/mobile/assets/autologo.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Remove the original's black backing, preserving white artwork edge coverage.
for (let i = 0; i < data.length; i += 4) {
  const alpha = Math.round(
    (Math.max(data[i], data[i + 1], data[i + 2]) * data[i + 3]) / 255,
  );
  data[i] = data[i + 1] = data[i + 2] = 255;
  data[i + 3] = alpha;
}
const occupied = (x, y) => data[(y * info.width + x) * 4 + 3] > 8;
const occupiedColumn = (x) => {
  for (let y = 0; y < info.height; y++) if (occupied(x, y)) return true;
  return false;
};
let left = 0;
while (left < info.width && !occupiedColumn(left)) left++;
let right = left;
while (right < info.width && occupiedColumn(right)) right++;
if (left === info.width || right === info.width) {
  throw new Error(
    "Cannot isolate the opening A from autologo.png; leave a clear gap before the next letter.",
  );
}
let top = info.height,
  bottom = 0;
for (let x = left; x < right; x++) {
  for (let y = 0; y < info.height; y++) {
    if (occupied(x, y)) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
}
// Preserve one source pixel around the detected antialiased edges.
left = Math.max(0, left - 1);
right = Math.min(info.width, right + 1);
top = Math.max(0, top - 1);
bottom = Math.min(info.height - 1, bottom + 1);
const monogram = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .extract({ left, top, width: right - left, height: bottom - top + 1 })
  .png()
  .toBuffer();
await fs.writeFile(file("apps/mobile/assets/monogram.png"), monogram);

async function icon(size, fraction, background = brand.background) {
  const mark = await sharp(monogram)
    .resize({
      width: Math.round(size * fraction),
      height: Math.round(size * fraction),
      fit: "inside",
    })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  }).composite([{ input: mark, gravity: "centre" }]);
}
for (const size of [192, 512]) {
  await (
    await icon(size, 0.64)
  )
    .removeAlpha()
    .png()
    .toFile(file(`apps/web/public/icon-${size}.png`));
}
await (
  await icon(512, 0.62)
)
  .removeAlpha()
  .png()
  .toFile(file("apps/web/public/icon-maskable.png"));
await (
  await icon(180, 0.64)
)
  .removeAlpha()
  .png()
  .toFile(file("apps/web/public/apple-touch-icon.png"));
await (
  await icon(1024, 0.64)
)
  .removeAlpha()
  .png()
  .toFile(file("apps/mobile/assets/icon.png"));
// Android masks its foreground independently; keep the whole A in the safe zone.
await (
  await icon(1024, 0.54, { r: 0, g: 0, b: 0, alpha: 0 })
)
  .png()
  .toFile(file("apps/mobile/assets/adaptive-icon.png"));
await (
  await icon(96, 0.8, { r: 0, g: 0, b: 0, alpha: 0 })
)
  .png()
  .toFile(file("apps/mobile/assets/notification-icon.png"));
await fs.copyFile(
  file("apps/mobile/assets/notification-icon.png"),
  file("apps/web/public/badge.png"),
);

// Embed original cropped pixels in the favicon, replacing the approximate SVG A.
const { width, height } = await sharp(monogram).metadata();
const markWidth = 512 * 0.64;
const markHeight = (markWidth * height) / width;
await fs.writeFile(
  file("apps/web/public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${brand.background}"/><image x="${(512 - markWidth) / 2}" y="${(512 - markHeight) / 2}" width="${markWidth}" height="${markHeight}" href="data:image/png;base64,${monogram.toString("base64")}"/></svg>\n`,
);

const logo = file("apps/web/public/logo.png");
await fs.copyFile(logo, file("apps/mobile/assets/logo.png"));
await sharp(logo)
  .resize({ width: 1000 })
  .png()
  .toFile(file("apps/mobile/assets/splash.png"));
console.log(
  "Generated native/PWA icons from the original A and synced the transparent wordmark.",
);
