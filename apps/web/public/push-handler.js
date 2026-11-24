self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AutoCars", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: data.data || {},
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.leadId ? "/garage" : "/";
  event.waitUntil(clients.openWindow(url));
});
