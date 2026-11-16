import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { brand } from "@autocars/core";
import { api, useApp, useLoad } from "./lib";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
let installed =
  window.matchMedia("(display-mode: standalone)").matches ||
  !!(navigator as any).standalone;
let updateAvailable = false;
const changed = () => listeners.forEach((fn) => fn());
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPrompt;
  changed();
});
window.addEventListener("appinstalled", () => {
  installed = true;
  installPrompt = null;
  changed();
});
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateAvailable = true;
    changed();
  },
});
export function InstallAppButton({
  className = "button outline small",
}: {
  className?: string;
}) {
  const [, render] = useState(0),
    [help, setHelp] = useState(false);
  useEffect(() => {
    const fn = () => render((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  if (installed) return null;
  return (
    <>
      <button
        className={className}
        onClick={async () => {
          if (installPrompt) {
            const prompt = installPrompt;
            installPrompt = null;
            await prompt.prompt();
            await prompt.userChoice;
            changed();
          } else setHelp(true);
        }}
      >
        {installPrompt ? "Install app ↗" : "Install app"}
      </button>
      {help && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Take {brand.name} with you.</h2>
            {!window.isSecureContext ? (
              <p>
                Open this website over HTTPS to install it. On this Mac,
                localhost also supports installation; a plain HTTP Wi-Fi address
                does not.
              </p>
            ) : (
              <>
                <p>
                  In Chrome, use the install icon at the right of the address
                  bar or Chrome’s menu → Cast, save and share → Install page as
                  app. If it’s already installed, Chrome may show an Open app
                  option instead.
                </p>
                <p>
                  On iPhone or iPad, open in Safari, tap Share, then Add to Home
                  Screen. Safari web push requires the installed Home Screen
                  app.
                </p>
                <p>
                  If you just opened the site, browse briefly and try again.
                  Your browser decides when to offer installation.
                </p>
              </>
            )}
            <button className="button dark" onClick={() => setHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function PwaUpdate() {
  const [, render] = useState(0);
  useEffect(() => {
    const fn = () => render((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return updateAvailable ? (
    <div className="pwa-update" role="status">
      <span>A new version is ready. Save any edits before reloading.</span>
      <button onClick={() => updateSW(true)}>Reload</button>
    </div>
  ) : null;
}
const pushKey = `${brand.slug}.webPushId`;
export async function disableWebPush() {
  const id = localStorage.getItem(pushKey);
  if (id) await api.delete(`/me/push/${id}`);
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  localStorage.removeItem(pushKey);
}
export function NotificationsPanel() {
  const { notify } = useApp(),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(!!localStorage.getItem(pushKey));
  const { data, reload } = useLoad<{ items: any[] }>("/me/notifications", {
    items: [],
  });
  return (
    <div className="panel">
      <h3>Notifications</h3>
      <p>
        Get listing reviews, buyer enquiries and business application updates,
        even when the app is closed.
      </p>
      <div className="button-row">
        <button
          className="button dark"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (
                !window.isSecureContext ||
                !("serviceWorker" in navigator) ||
                !("PushManager" in window) ||
                !("Notification" in window)
              )
                throw new Error(
                  "Use a supported browser over HTTPS. On iOS, install the app to your Home Screen first.",
                );
              const config = await api.get("/push/config");
              if (!config.webEnabled)
                throw new Error(
                  "Web notifications have not been configured by the operator.",
                );
              if ((await Notification.requestPermission()) !== "granted")
                throw new Error(
                  "Notifications are blocked. You can allow them in your browser’s site settings.",
                );
              const registration = await navigator.serviceWorker.ready;
              let subscription =
                await registration.pushManager.getSubscription();
              const encoded = config.publicKey
                .replace(/-/g, "+")
                .replace(/_/g, "/");
              const raw = atob(
                encoded + "=".repeat((4 - (encoded.length % 4)) % 4),
              );
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
              if (!subscription)
                subscription = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: key,
                });
              const r = await api.post("/me/push", {
                platform: "web",
                subscription: subscription.toJSON(),
              });
              localStorage.setItem(pushKey, r.id);
              setEnabled(true);
              notify("Notifications enabled on this browser.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {enabled ? "Reconnect notifications" : "Enable notifications"}
        </button>
        {enabled && (
          <>
            <button
              className="button outline"
              disabled={busy}
              onClick={async () => {
                try {
                  await api.post("/me/push/test");
                  notify(
                    "Test notification queued. Delivery depends on your browser’s notification settings.",
                  );
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Send test
            </button>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await disableWebPush();
                  setEnabled(false);
                  notify("Notifications disabled on this browser.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Disable
            </button>
          </>
        )}
      </div>
      <div className="notification-list">
        {data.items.slice(0, 15).map((n) => (
          <a href={n.path} key={n.id} className="notification-item">
            <b>
              {n.readAt ? "" : "● "}
              {n.title}
            </b>
            <span>{n.body}</span>
            <small>{new Date(n.createdAt).toLocaleString("en-ZA")}</small>
          </a>
        ))}
      </div>
      {data.items.some((n) => !n.readAt) && (
        <button
          className="text-button"
          onClick={async () => {
            await api.post("/me/notifications/read");
            reload();
          }}
        >
          Mark all as read
        </button>
      )}
    </div>
  );
}
