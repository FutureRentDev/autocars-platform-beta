/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^brand$/],
});
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api(?:\/|$)/, /^\/uploads\//],
  }),
);
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
self.addEventListener("push", (event) => {
  let data: any = {};
  try {
    data = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "AutoCars", {
      body: data.body || "You have a new update.",
      icon: "/icon-192.png",
      badge: "/badge.png",
      tag: data.tag,
      data: { path: typeof data.path === "string" ? data.path : "/account" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.path;
  const path =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : "/account";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const target = windows.find(
        (c) => new URL(c.url).origin === self.location.origin,
      ) as WindowClient | undefined;
      if (target) {
        await target.navigate(url);
        await target.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
