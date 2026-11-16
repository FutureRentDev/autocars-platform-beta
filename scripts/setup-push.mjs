import { createRequire } from "node:module";
const webpush = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
)("web-push");
import { readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, ".."),
  file = resolve(root, ".env");
let text = existsSync(file)
  ? await readFile(file, "utf8")
  : await readFile(resolve(root, ".env.example"), "utf8");
const values = parseEnv(text);
if (values.WEB_PUSH_PUBLIC_KEY && values.WEB_PUSH_PRIVATE_KEY) {
  console.log("Existing web push keys preserved. No server started.");
  process.exit(0);
}
if (values.WEB_PUSH_PUBLIC_KEY || values.WEB_PUSH_PRIVATE_KEY)
  throw new Error(
    "Only one push key is configured. Preserve the existing pair or remove both before generating a new pair.",
  );
let keys;
const legacy = resolve(root, "apps/api/data/vapid.json");
if (existsSync(legacy)) {
  const old = JSON.parse(await readFile(legacy, "utf8"));
  if (old.publicKey && old.privateKey) keys = old;
}
keys ||= webpush.generateVAPIDKeys();
const brand = JSON.parse(
  await readFile(resolve(root, "config/brand.json"), "utf8"),
);
text += `\n# Web push identity: keep the private key secret and preserve this pair across deployments.\nWEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=https://${brand.domain}\n`;
await writeFile(file, text, { mode: 0o600 });
await chmod(file, 0o600);
console.log(
  "Web push keys saved privately in .env. No keys printed and no server started.",
);
