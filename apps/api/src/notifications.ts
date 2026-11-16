import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import webpush from "web-push";
type Row = Record<string, any>;
export type PushDelivery = (
  subscription: Row,
  payload: Record<string, unknown>,
) => Promise<{ ticketId?: string }>;
export class NotificationService {
  private timer?: ReturnType<typeof setInterval>;
  private flushing = false;
  private closing = false;
  private inFlight?: Promise<void>;
  constructor(
    private db: DatabaseSync,
    private deliver: PushDelivery = async (subscription, payload) => {
      const data = JSON.parse(subscription.data);
      if (subscription.platform === "web") {
        if (
          !process.env.WEB_PUSH_PUBLIC_KEY ||
          !process.env.WEB_PUSH_PRIVATE_KEY ||
          !process.env.WEB_PUSH_SUBJECT
        )
          throw new Error("Web push is not configured");
        await webpush.sendNotification(data, JSON.stringify(payload), {
          TTL: 86400,
          timeout: 15000,
          vapidDetails: {
            subject: process.env.WEB_PUSH_SUBJECT,
            publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
            privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
          },
        });
        return {};
      }
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          to: data.token,
          title: payload.title,
          body: payload.body,
          data: { path: payload.path },
          sound: "default",
          channelId: "marketplace",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Expo delivery unavailable");
      const result: any = await response.json();
      if (result.data?.status === "error") {
        throw Object.assign(new Error("Expo delivery failed"), {
          gone: result.data.details?.error === "DeviceNotRegistered",
        });
      }
      if (!result.data?.id)
        throw new Error("Expo did not return a receipt ticket");
      return { ticketId: result.data.id };
    },
  ) {}
  start() {
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.flush().catch(() =>
          console.error("Push queue could not be processed."),
        );
      }, 5000);
      this.timer.unref();
    }
  }
  async stop() {
    this.closing = true;
    clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }
  notify(users: string[], title: string, body: string, path = "/account") {
    for (const userId of new Set(users)) {
      if (!this.db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        continue;
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,NULL)")
        .run(id, userId, title, body, path, new Date().toISOString());
      const subscriptions = this.db
        .prepare("SELECT id FROM notification_subscriptions WHERE user_id=?")
        .all(userId) as Row[];
      for (const subscription of subscriptions)
        this.db
          .prepare(
            "INSERT INTO push_jobs(id,notification_id,subscription_id,status,attempts,next_at) VALUES(?,?,?,?,?,?)",
          )
          .run(randomUUID(), id, subscription.id, "pending", 0, Date.now());
    }
  }
  flush() {
    if (!this.inFlight)
      this.inFlight = this.performFlush().finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
  private async performFlush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const jobs = this.db
        .prepare(
          "SELECT j.*,s.platform,s.data,s.user_id,n.title,n.body,n.path,n.created_at FROM push_jobs j JOIN notification_subscriptions s ON j.subscription_id=s.id JOIN notifications n ON j.notification_id=n.id AND n.user_id=s.user_id WHERE j.status IN ('pending','receipt') AND j.next_at<=? ORDER BY j.next_at LIMIT 25",
        )
        .all(Date.now()) as Row[];
      for (const job of jobs) {
        if (this.closing) break;
        try {
          if (Date.now() - new Date(job.created_at).getTime() > 86400000) {
            this.db
              .prepare("UPDATE push_jobs SET status='expired' WHERE id=?")
              .run(job.id);
            continue;
          }
          if (job.status === "receipt") {
            const response = await fetch(
              "https://exp.host/--/api/v2/push/getReceipts",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(process.env.EXPO_ACCESS_TOKEN
                    ? {
                        Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
                      }
                    : {}),
                },
                body: JSON.stringify({ ids: [job.ticket_id] }),
                signal: AbortSignal.timeout(15000),
              },
            );
            if (!response.ok) throw new Error("Receipt unavailable");
            const result: any = await response.json();
            const receipt = result.data?.[job.ticket_id];
            if (!receipt) throw new Error("Receipt pending");
            if (receipt.status === "error")
              throw Object.assign(new Error("Receipt failed"), {
                gone: receipt.details?.error === "DeviceNotRegistered",
              });
            this.db
              .prepare("UPDATE push_jobs SET status='delivered' WHERE id=?")
              .run(job.id);
            continue;
          }
          const result = await this.deliver(job, {
            title: job.title,
            body: job.body,
            path: job.path,
            tag: job.notification_id,
          });
          this.db
            .prepare(
              "UPDATE push_jobs SET status=?,ticket_id=?,next_at=? WHERE id=?",
            )
            .run(
              result.ticketId ? "receipt" : "delivered",
              result.ticketId || null,
              Date.now() + 15 * 60000,
              job.id,
            );
        } catch (e: any) {
          if (e.gone || e.statusCode === 404 || e.statusCode === 410) {
            this.db
              .prepare("DELETE FROM notification_subscriptions WHERE id=?")
              .run(job.subscription_id);
            continue;
          }
          const attempts = job.attempts + 1;
          this.db
            .prepare(
              "UPDATE push_jobs SET attempts=?,status=?,next_at=?,last_error=? WHERE id=?",
            )
            .run(
              attempts,
              attempts >= 5 ? "failed" : job.status,
              Date.now() + Math.min(3600000, 30000 * 2 ** attempts),
              "Delivery failed; check provider configuration.",
              job.id,
            );
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      [
        "fcm.googleapis.com",
        "web.push.apple.com",
        "push.services.mozilla.com",
        "notify.windows.com",
      ].some(
        (domain) => u.hostname === domain || u.hostname.endsWith("." + domain),
      )
    );
  } catch {
    return false;
  }
}
