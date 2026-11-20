import type { ApiClient } from "@autocars/core";

export async function enableWebPush(api: ApiClient) {
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "Browser push needs HTTPS or localhost. On iPhone/iPad, open the installed Home Screen app. Plain HTTP Wi-Fi addresses cannot receive browser push.",
    );
  // Safari requires this permission request directly in the button gesture,
  // before any network awaits consume that gesture.
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error(
      "Notifications are blocked. Allow them in this browser's site settings, then try again.",
    );
  const config = await api.get("/push/config");
  if (!config.webEnabled || !config.publicKey)
    throw new Error(
      "Web notifications have not been configured by the operator.",
    );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              "The notification service worker is not ready. Reload the app, accept any update, then try again.",
            ),
          ),
        15000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  let subscription = await registration.pushManager.getSubscription();
  const encoded = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4));
  const key = new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
  const existingKey = subscription?.options.applicationServerKey;
  if (subscription && existingKey) {
    const current = new Uint8Array(existingKey);
    if (
      current.length !== key.length ||
      current.some((value, index) => value !== key[index])
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  return api.post("/me/push", {
    platform: "web",
    subscription: subscription.toJSON(),
  });
}

export async function reconnectWebPush(api: ApiClient): Promise<string | null> {
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const { id } = await api.post("/me/push", {
    platform: "web",
    subscription: subscription.toJSON(),
  });
  return id;
}
