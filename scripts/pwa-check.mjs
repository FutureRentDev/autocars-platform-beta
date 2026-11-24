import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
const root = resolve(import.meta.dirname, "../apps/web/dist");
const manifest = JSON.parse(
  await readFile(resolve(root, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.id, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.prefer_related_applications, false);
for (const size of ["192x192", "512x512"]) {
  const icon = manifest.icons.find((i) => i.sizes === size);
  assert.ok(icon, `Missing ${size} icon`);
  const pathname = new URL(icon.src, "https://autocars.example").pathname;
  assert.ok((await stat(resolve(root, pathname.replace(/^\//, "")))).size > 0);
}
const html = await readFile(resolve(root, "index.html"), "utf8");
assert.match(html, /rel="manifest"/);
assert.match(html, /apple-touch-icon/);
// A missing favicon can fall through to the SPA's HTML with HTTP 200.
// Check the actual published file bytes, not just whether the link exists.
const faviconLinks = [
  ...html.matchAll(
    /<link\b[^>]*rel="(?:icon|shortcut icon)"[^>]*href="([^"]+)"[^>]*>/g,
  ),
];
assert.ok(faviconLinks.length, "Missing favicon links");
for (const [, href] of faviconLinks) {
  const pathname = new URL(href, "https://autocars.example").pathname;
  const bytes = await readFile(resolve(root, pathname.replace(/^\//, "")));
  if (pathname.endsWith(".png")) {
    assert.equal(
      bytes.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      "Favicon must be a real PNG",
    );
  } else if (pathname.endsWith(".ico")) {
    assert.equal(
      bytes.subarray(0, 4).toString("hex"),
      "00000100",
      "Favicon must be a real ICO",
    );
  } else assert.fail("Use a PNG/ICO favicon for reliable browser support");
}
const handlers = new Map(),
  shown = [],
  opened = [];
const scope = {
  location: new URL("https://autocars.example/sw.js"),
  registration: {
    scope: "https://autocars.example/",
    showNotification: async (title, options) =>
      shown.push({ title, ...options }),
  },
  clients: {
    claim: async () => {},
    matchAll: async () => [],
    openWindow: async (url) => opened.push(url),
  },
  addEventListener: (name, fn) => {
    const list = handlers.get(name) || [];
    list.push(fn);
    handlers.set(name, list);
  },
  skipWaiting: async () => {},
};
vm.runInNewContext(
  await readFile(resolve(root, "sw.js"), "utf8"),
  {
    self: scope,
    location: scope.location,
    registration: scope.registration,
    URL,
    Request,
    Response,
    Headers,
    console,
    setTimeout,
    clearTimeout,
    navigator: { userAgent: "PWA verification" },
    fetch: async () => {
      throw new Error("No network in worker verification");
    },
  },
  { timeout: 1000 },
);
async function dispatch(name, event) {
  const waits = [];
  for (const handler of handlers.get(name) || [])
    handler({ ...event, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
}
await dispatch("push", {
  data: {
    json: () => ({
      title: "Review complete",
      body: "Your vehicle is published.",
      path: "/workspace",
      tag: "test",
    }),
  },
});
assert.equal(shown[0].title, "Review complete");
assert.equal(shown[0].data.path, "/workspace");
await dispatch("notificationclick", {
  notification: { data: { path: "//evil.example/phishing" }, close() {} },
});
assert.equal(opened[0], "https://autocars.example/account");
await dispatch("notificationclick", {
  notification: { data: { path: "/account" }, close() {} },
});
assert.equal(opened[1], "https://autocars.example/account");
console.log(
  "PWA checks passed: install manifest/icons, push display, and safe notification click routing.",
);
