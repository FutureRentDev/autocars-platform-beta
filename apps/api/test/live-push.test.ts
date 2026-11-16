import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth";
import { NotificationService, validPushEndpoint } from "../src/notifications";
const origin = "http://localhost:5173";
const tick = () => new Promise((r) => setImmediate(r));
test("actual WebSocket upgrade authenticates mobile clients, scopes changes, and revokes deleted sessions", async () => {
  const { app, db } = await buildApp({ dataDir: ":memory:", logger: false });
  const sockets: any[] = [];
  try {
    const a = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin, "x-client": "mobile" },
      payload: {
        name: "Live buyer",
        email: "live@example.com",
        password: "Live account password 2026",
        consent: true,
      },
    });
    const user = a.json();
    const adminId = randomUUID();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
      adminId,
      "Staff",
      "staff@example.com",
      await hashPassword("Staff password 2026"),
      "admin",
      1,
      new Date().toISOString(),
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin, "x-client": "mobile" },
      payload: { email: "staff@example.com", password: "Staff password 2026" },
    });
    await app.ready();
    const connect = async () => {
      const messages: any[] = [];
      const ws = await app.injectWS(
        "/api/live",
        { headers: { origin } },
        {
          onInit(socket) {
            socket.on("message", (data) =>
              messages.push(JSON.parse(data.toString())),
            );
          },
        },
      );
      sockets.push(ws);
      return { ws, messages };
    };
    const publicClient = await connect(),
      buyer = await connect(),
      staff = await connect();
    buyer.ws.send(JSON.stringify({ type: "authenticate", token: user.token }));
    staff.ws.send(
      JSON.stringify({ type: "authenticate", token: login.json().token }),
    );
    await tick();
    await tick();
    publicClient.messages.length = 0;
    buyer.messages.length = 0;
    staff.messages.length = 0;
    await app.inject({
      method: "POST",
      url: "/api/me/searches",
      headers: { origin, authorization: `Bearer ${user.token}` },
      payload: { name: "Live search", filters: { bodyType: "SUV" } },
    });
    await tick();
    await tick();
    assert.ok(
      buyer.messages.some(
        (m) => m.type === "changed" && m.topics.includes("garage"),
      ),
    );
    assert.equal(
      publicClient.messages.filter((m) => m.type === "changed").length,
      0,
    );
    assert.equal(staff.messages.filter((m) => m.type === "changed").length, 0);
    await assert.rejects(
      app.injectWS("/api/live", {
        headers: { origin: "https://evil.example" },
      }),
      /403/,
    );
    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin, authorization: `Bearer ${user.token}` },
      payload: {},
    });
    await tick();
    assert.ok(buyer.messages.some((m) => m.type === "session-expired"));
  } finally {
    for (const socket of sockets) socket.terminate();
    await app.close();
  }
});
test("push subscriptions are private, delivery is durable, retries are bounded, and stale devices are removed", async () => {
  const { app, db } = await buildApp({ dataDir: ":memory:", logger: false });
  try {
    const register = async (n: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { origin, "x-client": "mobile" },
          payload: {
            name: n,
            email: `${n}@example.com`,
            password: "Push test password 2026",
            consent: true,
          },
        })
      ).json();
    const owner = await register("owner"),
      other = await register("other");
    const h = (token: string) => ({ origin, authorization: `Bearer ${token}` });
    const sub = (
      await app.inject({
        method: "POST",
        url: "/api/me/push",
        headers: h(owner.token),
        payload: { platform: "expo", token: "ExpoPushToken[delivery-test]" },
      })
    ).json();
    assert.ok(sub.id);
    await app.inject({
      method: "DELETE",
      url: `/api/me/push/${sub.id}`,
      headers: h(other.token),
    });
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM notification_subscriptions").get()!
        .n,
      1,
    );
    const deliveries: any[] = [];
    const worker = new NotificationService(db, async (s, payload) => {
      deliveries.push({ s, payload });
      return {};
    });
    worker.notify(
      [owner.user.id],
      "Review updated",
      "Your listing has an update.",
      "/workspace",
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM push_jobs WHERE status='pending'")
        .get()!.n,
      1,
    );
    await worker.flush();
    assert.equal(deliveries.length, 1);
    assert.equal(
      db.prepare("SELECT status FROM push_jobs").get()!.status,
      "delivered",
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/me/notifications",
          headers: h(other.token),
        })
      ).json().items.length,
      0,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/me/notifications",
          headers: h(owner.token),
        })
      ).json().items.length,
      1,
    );
    const failure = new NotificationService(db, async () => {
      throw new Error("Provider down");
    });
    failure.notify([owner.user.id], "New enquiry", "An enquiry arrived.");
    await failure.flush();
    assert.equal(
      db.prepare("SELECT attempts FROM push_jobs WHERE status='pending'").get()!
        .attempts,
      1,
    );
    db.prepare(
      "UPDATE push_jobs SET attempts=4,next_at=0 WHERE status='pending'",
    ).run();
    await failure.flush();
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM push_jobs WHERE status='failed'")
        .get()!.n,
      1,
    );
    const stale = new NotificationService(db, async () => {
      throw Object.assign(new Error("Device removed"), { gone: true });
    });
    stale.notify([owner.user.id], "Update", "New activity");
    await stale.flush();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM notification_subscriptions").get()!
        .n,
      0,
    );
    assert.ok(validPushEndpoint("https://fcm.googleapis.com/fcm/send/test"));
    assert.ok(validPushEndpoint("https://web.push.apple.com/test"));
    assert.equal(validPushEndpoint("https://127.0.0.1/private"), false);
    assert.equal(
      validPushEndpoint("https://fcm.googleapis.com.evil.example/test"),
      false,
    );
    assert.equal(validPushEndpoint("http://fcm.googleapis.com/test"), false);
    await Promise.all([worker.stop(), failure.stop(), stale.stop()]);
  } finally {
    await app.close();
  }
});
