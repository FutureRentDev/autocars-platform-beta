import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiClient } from "@autocars/core";
import { enableWebPush, reconnectWebPush } from "../../web/src/web-push";

test("browser push requests permission in the gesture before network work and restores existing registration", async () => {
  const names = ["window", "navigator", "Notification"];
  const previous = Object.fromEntries(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const calls: string[] = [];
  const subscription = {
    options: {},
    toJSON: () => ({
      endpoint: "https://web.push.apple.com/test",
      keys: { auth: "test", p256dh: "test" },
    }),
  };
  const registration = {
    pushManager: { getSubscription: async () => subscription },
  };
  const notification = {
    permission: "granted",
    requestPermission: async () => {
      calls.push("permission");
      return "granted";
    },
  };
  const api = {
    get: async () => {
      calls.push("config");
      return {
        webEnabled: true,
        publicKey: Buffer.alloc(65).toString("base64url"),
      };
    },
    post: async () => {
      calls.push("register");
      return { id: "browser-device" };
    },
  } as unknown as ApiClient;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        isSecureContext: true,
        PushManager: class {},
        Notification: notification,
      },
    });
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: notification,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          getRegistration: async () => registration,
        },
      },
    });
    assert.equal((await enableWebPush(api)).id, "browser-device");
    assert.deepEqual(calls, ["permission", "config", "register"]);
    calls.length = 0;
    assert.equal(await reconnectWebPush(api), "browser-device");
    assert.deepEqual(
      calls,
      ["register"],
      "restoring an opted-in browser must not prompt again",
    );
    calls.length = 0;
    (globalThis.window as any).isSecureContext = false;
    await assert.rejects(enableWebPush(api), /HTTPS or localhost/);
    assert.deepEqual(calls, []);
  } finally {
    for (const name of names) {
      const descriptor = previous[name];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
