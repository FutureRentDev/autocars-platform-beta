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
    const unregisteredTest = await app.inject({
      method: "POST",
      url: "/api/me/push/test",
      headers: h(owner.token),
      payload: {},
    });
    assert.equal(unregisteredTest.statusCode, 409);
    assert.match(unregisteredTest.json().message, /No devices are registered/);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM notifications").get()!.n,
      0,
      "a test with no registered devices must not claim to queue a push",
    );
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
    const reconnect = await app.inject({
      method: "POST",
      url: "/api/me/push",
      headers: h(owner.token),
      payload: { platform: "expo", token: "ExpoPushToken[delivery-test]" },
    });
    assert.equal(reconnect.json().id, sub.id);
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

test("chat pushes reach participants and joined staff; inbox counts clear when a conversation opens", async () => {
  const { app, db } = await buildApp({ dataDir: ":memory:", logger: false });
  try {
    const create = async (name: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { origin, "x-client": "mobile" },
          payload: {
            name,
            email: `${name}@example.com`,
            password: "Chat notification password 2026",
            consent: true,
          },
        })
      ).json();
    const seller = await create("seller"),
      buyer = await create("buyer"),
      staff = await create("staff"),
      outsider = await create("outsider");
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(staff.user.id);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: {
        email: "staff@example.com",
        password: "Chat notification password 2026",
      },
    });
    assert.equal(login.statusCode, 200);
    const rawCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie)!.split(
      ";",
    )[0];
    const listingId = randomUUID(),
      leadId = randomUUID(),
      createdAt = new Date(Date.now() - 60000).toISOString();
    db.prepare("INSERT INTO listings VALUES(?,?,?,?,?,?,?)").run(
      listingId,
      seller.user.id,
      "published",
      0,
      JSON.stringify({ year: 2024, make: "Toyota", model: "Corolla" }),
      createdAt,
      createdAt,
    );
    db.prepare("INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?)").run(
      leadId,
      listingId,
      buyer.user.id,
      "Buyer",
      "buyer@example.com",
      "0821234567",
      "I am interested",
      "new",
      createdAt,
    );
    for (const account of [seller, buyer, staff, outsider]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/me/push",
        headers: { authorization: `Bearer ${account.token}` },
        payload: {
          platform: "expo",
          token: `ExpoPushToken[${account.user.id}]`,
        },
      });
      assert.equal(response.statusCode, 200);
    }
    const recipients = () =>
      db
        .prepare("SELECT user_id FROM notifications ORDER BY user_id")
        .all()
        .map((row) => row.user_id);
    const clear = () =>
      db.exec("DELETE FROM push_jobs; DELETE FROM notifications;");
    const url = `/api/leads/${leadId}/messages`;
    const inbox = async (token: string) =>
      (
        await app.inject({
          url: "/api/me/inbox",
          headers: { authorization: `Bearer ${token}` },
        })
      ).json();
    assert.equal(
      (await inbox(seller.token)).unread,
      1,
      "a new enquiry alerts the seller",
    );
    assert.equal(
      (await inbox(buyer.token)).unread,
      0,
      "the buyer's own enquiry is not unread",
    );
    assert.equal((await inbox(outsider.token)).items.length, 0);
    await app.inject({
      url,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal((await inbox(seller.token)).unread, 0);
    const staffMessage = await app.inject({
      method: "POST",
      url,
      headers: { origin, cookie },
      payload: { body: "AutoCars staff checking in with both participants." },
    });
    assert.equal(staffMessage.statusCode, 200);
    assert.equal((await inbox(seller.token)).unread, 1);
    assert.deepEqual(recipients(), [seller.user.id, buyer.user.id].sort());
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM push_jobs WHERE status='pending'")
        .get()!.n,
      2,
    );
    const deliveries: string[] = [];
    const worker = new NotificationService(
      db,
      async (subscription, payload) => {
        deliveries.push(subscription.user_id);
        assert.equal(payload.path, `/chat/${leadId}`);
        return {};
      },
    );
    await worker.flush();
    await worker.stop();
    assert.deepEqual(deliveries.sort(), [seller.user.id, buyer.user.id].sort());
    for (const [sender, recipient] of [
      [buyer, seller],
      [seller, buyer],
    ]) {
      clear();
      const response = await app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${sender.token}` },
        payload: { body: "Reply from a conversation participant." },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(recipients(), [recipient.user.id, staff.user.id].sort());
      assert.equal(
        db.prepare("SELECT path FROM notifications").get()!.path,
        `/chat/${leadId}`,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM push_jobs").get()!.n,
        2,
      );
    }
    clear();
    assert.ok(
      (await inbox(staff.token)).unread > 0,
      "staff who joined the conversation see replies",
    );
    await app.inject({
      url,
      headers: { authorization: `Bearer ${staff.token}` },
    });
    assert.equal(
      (await inbox(staff.token)).unread,
      0,
      "opening the chat clears the badge",
    );
    const denied = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { body: "Not a participant" },
    });
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(recipients(), []);
    // Long conversations must include the newest messages, rather than stop
    // permanently at the first 500 messages in the thread.
    const insertMessage = db.prepare("INSERT INTO messages VALUES(?,?,?,?,?)");
    const historyStart = Date.now() + 1000;
    for (let index = 0; index < 600; index++) {
      insertMessage.run(
        randomUUID(),
        leadId,
        seller.user.id,
        `History ${index}`,
        new Date(historyStart + index).toISOString(),
      );
    }
    const history = await app.inject({
      url,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().items.length, 501);
    assert.equal(history.json().items[0].body, "I am interested");
    assert.equal(history.json().items[1].body, "History 100");
    assert.equal(history.json().items.at(-1).body, "History 599");
    assert.equal(history.json().truncated, true);
    clear();
    // An admin can also be a buyer. Their enquiry must notify only the seller,
    // not themselves or other staff, and appear once as the opening message.
    const enquiry = await app.inject({
      method: "POST",
      url: `/api/listings/${listingId}/enquire`,
      headers: { origin, cookie },
      payload: {
        name: "Staff buyer",
        email: "staff@example.com",
        phone: "0821234567",
        message: "Can I arrange a viewing this weekend?",
        consent: true,
      },
    });
    assert.equal(enquiry.statusCode, 200, enquiry.body);
    assert.deepEqual(recipients(), [seller.user.id]);
    assert.equal(db.prepare("SELECT count(*) AS n FROM push_jobs").get()!.n, 1);
    const enquiryPath = `/api/leads/${enquiry.json().id}/messages`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const thread = await app.inject({
        url: enquiryPath,
        headers: { origin, cookie },
      });
      assert.equal(thread.json().items.length, 1);
      assert.equal(
        thread.json().items[0].body,
        "Can I arrange a viewing this weekend?",
      );
      assert.equal(thread.json().items[0].senderId, staff.user.id);
      assert.deepEqual(thread.json().vehicle, {
        id: listingId,
        title: "2024 Toyota Corolla",
      });
      assert.equal(thread.json().truncated, false);
    }
  } finally {
    await app.close();
  }
});
