import sharp from "sharp";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// One source for the displayed wordmark and every app icon.
// Crop the actual opening A instead of substituting a font or redrawing it.
const root = resolve(import.meta.dirname, "..");
const file = (path) => resolve(root, path);
const brand = JSON.parse(await fs.readFile(file("config/brand.json"), "utf8"));
const logo = file("apps/web/public/logo.png");
const { data, info } = await sharp(logo)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Preserve the transparent wordmark's RGB and alpha pixels exactly when cropping.
if (
  !(await sharp(logo).stats()).channels.some(
    (channel, index) => index === 3 && channel.min === 0,
  )
)
  throw new Error("The source wordmark must have a transparent background.");
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
    "Cannot isolate the opening A from logo.png; leave a clear gap before the next letter.",
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

// Real PNG/ICO favicons work without embedded-image SVG favicon support.
await (
  await icon(32, 0.8)
)
  .removeAlpha()
  .png()
  .toFile(file("apps/web/public/favicon.png"));
const faviconSizes = [16, 32, 48];
const faviconImages = await Promise.all(
  faviconSizes.map(async (size) =>
    (await icon(size, 0.8)).removeAlpha().png().toBuffer(),
  ),
);
const directory = Buffer.alloc(6 + faviconSizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(faviconSizes.length, 4);
let offset = directory.length;
faviconImages.forEach((png, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = faviconSizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await fs.writeFile(
  file("apps/web/public/favicon.ico"),
  Buffer.concat([directory, ...faviconImages]),
);

// Distinct filenames update both favicon and installed-app icon references.
const revision = createHash("sha256")
  .update(await fs.readFile(file("apps/web/public/icon-512.png")))
  .digest("hex")
  .slice(0, 12);
await fs.mkdir(file("apps/web/public/brand-icons"), { recursive: true });
for (const name of [
  "icon-192.png",
  "icon-512.png",
  "icon-maskable.png",
  "apple-touch-icon.png",
  "favicon.png",
  "favicon.ico",
]) {
  const versioned = name.replace(/(\.[a-z]+)$/, `.${revision}$1`);
  await fs.copyFile(
    file(`apps/web/public/${name}`),
    file(`apps/web/public/brand-icons/${versioned}`),
  );
}

await fs.copyFile(logo, file("apps/mobile/assets/logo.png"));
await sharp(logo)
  .resize({ width: 1000 })
  .png()
  .toFile(file("apps/mobile/assets/splash.png"));
console.log(
  "Generated native/PWA icons directly from the displayed wordmark A, including versioned PNG/ICO favicons.",
);
