import {
  payfastConfig,
  checkoutFields,
  verifyPayfast,
  type PayfastConfig,
} from "./payfast";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { LiveHub } from "./live";
import { NotificationService, validPushEndpoint } from "./notifications";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import sharp from "sharp";
import nodemailer from "nodemailer";

import { writeFileSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  brand,
  bodyTypes,
  fuels,
  provinces,
  requiresAdFee,
  type Listing,
  type Filters,
} from "@autocars/core";
import { openDatabase } from "./db";
import { hashPassword, verifyPassword, hashToken, newToken } from "./auth";
const now = () => new Date().toISOString();
const email = z
  .email()
  .max(254)
  .transform((x) => x.toLowerCase().trim());
const password = z.string().min(12, "Use at least 12 characters.").max(128);
const listingSchema = z.object({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(120).default(""),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1),
  price: z.number().int().min(1000).max(100000000),
  mileage: z.number().int().min(0).max(3000000),
  bodyType: z.enum(bodyTypes as [string, ...string[]]),
  fuel: z.enum(fuels as [string, ...string[]]),
  transmission: z.enum(["Automatic", "Manual"]),
  province: z.enum(provinces as [string, ...string[]]),
  city: z.string().trim().min(2).max(100),
  description: z.string().trim().min(30).max(6000),
  images: z
    .array(z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/))
    .min(1, "Add at least one photo.")
    .max(12),
  sellerName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .regex(/^\+?[\d\s()-]{9,20}$/, "Enter a valid phone number."),
  greatValue: z.boolean().default(false),
});
const businessSchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  registrationNumber: z.string().trim().max(80).default(""),
  contactName: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+?[\d\s()-]{9,20}$/),
  province: z.enum(provinces as [string, ...string[]]),
  city: z.string().trim().min(2).max(100),
  website: z
    .union([
      z.literal(""),
      z
        .url()
        .max(250)
        .refine(
          (v) => /^https?:\/\//.test(v),
          "Use an HTTP(S) website address.",
        ),
    ])
    .default(""),
  message: z.string().trim().max(2000).default(""),
  contactConsent: z.literal(true),
});
const filterSchema = z.object({
  q: z.string().max(150).optional(),
  make: z.string().max(60).optional(),
  bodyType: z.string().max(60).optional(),
  province: z.string().max(60).optional(),
  fuel: z.string().max(30).optional(),
  transmission: z.string().max(30).optional(),
  minPrice: z.string().max(12).regex(/^\d*$/).optional(),
  maxPrice: z.string().max(12).regex(/^\d*$/).optional(),
  minYear: z.string().max(12).regex(/^\d*$/).optional(),
  maxMileage: z.string().max(12).regex(/^\d*$/).optional(),
  greatValue: z.enum(["true", "1"]).optional(),
  sort: z
    .enum(["newest", "price-asc", "price-desc", "mileage", "year"])
    .optional(),
  page: z.string().max(6).regex(/^\d+$/).optional(),
});
type Row = Record<string, any>;
export async function buildApp(
  options: {
    dataDir?: string;
    logger?: boolean;
    webRoot?: string;
    paymentConfig?: PayfastConfig;
    confirmPayment?: (body: string, url: string) => Promise<boolean>;
  } = {},
) {
  const production = process.env.NODE_ENV === "production";
  const paymentConfig = options.paymentConfig || payfastConfig();
  const origins = (process.env.WEB_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  if (
    production &&
    (!process.env.SMTP_URL ||
      !process.env.MAIL_FROM ||
      !process.env.WEB_ORIGIN ||
      origins.some((x) => !x.startsWith("https://")))
  )
    throw new Error(
      "Production requires SMTP_URL, MAIL_FROM and HTTPS WEB_ORIGIN.",
    );
  if (!production) {
    const hosts = [
      "localhost",
      "127.0.0.1",
      ...Object.values(networkInterfaces()).flatMap((entries) =>
        (entries || [])
          .filter((a) => a.family === "IPv4" && !a.internal)
          .map((a) => a.address),
      ),
    ];
    const ports = [
      Number(process.env.PORT) || 4000,
      Number(process.env.WEB_DEV_PORT) || 5173,
    ];
    for (const host of hosts)
      for (const port of ports) {
        const origin = `http://${host}:${port}`;
        if (!origins.includes(origin)) origins.push(origin);
      }
  }
  const directory = options.dataDir || process.env.DATA_DIR || "./data";
  const uploadDir = resolve(
    directory === ":memory:" ? "/tmp/autocars-test-uploads" : directory,
    "uploads",
  );
  mkdirSync(uploadDir, { recursive: true });
  const db = openDatabase(directory);
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            redact: ["req.headers.authorization", "req.headers.cookie"],
            serializers: {
              req: (req: any) => ({
                method: req.method,
                url: req.url.split("?")[0],
                remoteAddress: req.ip,
              }),
            },
          },
    bodyLimit: 256 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  const read = (sql: string, ...args: any[]) =>
    db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: any[]) =>
    db.prepare(sql).all(...args) as Row[];
  const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);
  const audit = (
    actor: string,
    action: string,
    target: string,
    details: unknown = {},
  ) =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      randomUUID(),
      actor,
      action,
      target,
      JSON.stringify(details),
      now(),
    );
  const sendPush = async (
    userIds: (string | null | undefined)[],
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) => {
    notifications.notify(
      userIds.filter((id): id is string => !!id),
      title,
      body,
      data.path ||
        (data.leadId ? `/chat/${encodeURIComponent(data.leadId)}` : "/account"),
    );
  };
  const adminIds = () =>
    all("SELECT id FROM users WHERE role='admin'").map((r) => r.id);
  const publicUser = (u: Row) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    verified: !!u.verified,
    accountType:
      read("SELECT account_type FROM account_profiles WHERE user_id=?", u.id)
        ?.account_type || "customer",
    businessStatus:
      read("SELECT status FROM business_applications WHERE user_id=?", u.id)
        ?.status || null,
  });
  function requireSeller(u: Row) {
    const profile = publicUser(u);
    if (
      u.role !== "admin" &&
      profile.accountType === "business" &&
      profile.businessStatus !== "active"
    )
      fail(
        403,
        "Your business application must be activated by AutoCars before you can advertise vehicles.",
      );
  }
  const businessApplication = (r: Row) => ({
    ...JSON.parse(r.data),
    id: r.id,
    userId: r.user_id,
    email: read("SELECT email FROM users WHERE id=?", r.user_id)?.email,
    status: r.status,
    reviewNote: r.review_note,
    agreementReference: r.agreement_reference,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  const mapListing = (r: Row): Listing => {
    const data = JSON.parse(r.data);
    return {
      ...data,
      id: r.id,
      ownerId: r.owner_id,
      status: r.status,
      featured: !!r.featured,
      greatValue: !!data.greatValue,
      createdAt: r.created_at,
    };
  };
  function current(req: any) {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = bearer || req.cookies.session;
    if (!token) return undefined;
    return read(
      "SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires_at>?",
      hashToken(token),
      Date.now(),
    );
  }
  function fail(code: number, message: string): never {
    throw Object.assign(new Error(message), { statusCode: code, expose: true });
  }
  function requireUser(req: any) {
    return current(req) || fail(401, "Please sign in to continue.");
  }
  function admin(req: any) {
    const u = requireUser(req);
    if (u.role !== "admin") fail(403, "Administrator access required.");
    return u;
  }
  const mailer = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : null;
  async function sendToken(u: Row, kind: "verify" | "reset") {
    if (!mailer) {
      if (production) fail(503, "Email delivery is unavailable.");
      return;
    }
    const token = newToken();
    run("DELETE FROM tokens WHERE user_id=? AND kind=?", u.id, kind);
    run(
      "INSERT INTO tokens VALUES(?,?,?,?)",
      hashToken(token),
      u.id,
      kind,
      Date.now() + 60 * 60 * 1000,
    );
    const link = `${origins[0]}/account?${kind}=${token}`;
    await mailer.sendMail({
      from: process.env.MAIL_FROM,
      to: u.email,
      subject: `${brand.name}: ${kind === "verify" ? "verify your email" : "reset your password"}`,
      text: `Open this link within one hour: ${link}\nIf you did not request this, ignore this email.`,
    });
  }
  async function session(req: any, reply: any, u: Row) {
    const token = newToken();
    run("DELETE FROM sessions WHERE expires_at<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hashToken(token),
      u.id,
      Date.now() + 30 * 86400000,
    );
    if (req.headers["x-client"] !== "mobile")
      reply.setCookie("session", token, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400,
      });
    return {
      user: publicUser(u),
      ...(req.headers["x-client"] === "mobile" ? { token } : {}),
    };
  }
  const identify = (token: string) => {
    const u = read(
      "SELECT u.id,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires_at>?",
      hashToken(token),
      Date.now(),
    );
    return u ? { id: u.id, role: u.role } : undefined;
  };
  const live = new LiveHub(identify);
  const notifications = new NotificationService(db);
  app.addHook("onReady", async () => {
    if (process.env.NODE_ENV !== "test") notifications.start();
  });
  await app.register(websocket, {
    options: { maxPayload: 4096 },
    preClose(done) {
      live.close();
      app.websocketServer.close(done);
    },
  });
  app.addHook("preHandler", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const route = req.routeOptions.url || "",
      id = (req.params as any)?.id,
      u = current(req);
    const users = new Set<string>(u ? [u.id] : []);
    let publicChange = false;
    if (route.includes("/listings") && id) {
      const listing = read(
        "SELECT owner_id,status FROM listings WHERE id=?",
        id,
      );
      if (listing) {
        users.add(listing.owner_id);
        publicChange =
          listing.status === "published" && !route.endsWith("/enquire");
        for (const lead of all(
          "SELECT buyer_id FROM leads WHERE listing_id=?",
          id,
        ))
          if (lead.buyer_id) users.add(lead.buyer_id);
      }
    }
    if (route.includes("/leads/") && id) {
      const lead = read(
        "SELECT e.buyer_id,l.owner_id FROM leads e JOIN listings l ON e.listing_id=l.id WHERE e.id=?",
        id,
      );
      if (lead) {
        users.add(lead.owner_id);
        if (lead.buyer_id) users.add(lead.buyer_id);
      }
    }
    if (route === "/api/leads/:id/messages" && id) {
      const lead = read(
        "SELECT e.buyer_id,l.owner_id FROM leads e JOIN listings l ON e.listing_id=l.id WHERE e.id=?",
        id,
      );
      if (lead) {
        users.add(lead.owner_id);
        if (lead.buyer_id) users.add(lead.buyer_id);
      }
    }
    if (route.includes("/businesses/") && id) {
      const business = read(
        "SELECT user_id FROM business_applications WHERE id=?",
        id,
      );
      if (business) users.add(business.user_id);
    }
    if (route === "/api/me" && u)
      publicChange = !!read(
        "SELECT id FROM listings WHERE owner_id=? AND status='published'",
        u.id,
      );
    if (
      route === "/api/auth/reset" &&
      typeof (req.body as any)?.token === "string"
    ) {
      const t = read(
        "SELECT user_id FROM tokens WHERE hash=? AND kind='reset'",
        hashToken((req.body as any).token),
      );
      if (t) users.add(t.user_id);
    }
    (req as any).liveChange = {
      users: [...users],
      public: publicChange,
      admin:
        route.startsWith("/api/admin/") ||
        route.includes("/listings") ||
        route.startsWith("/api/me/business") ||
        route === "/api/leads/:id/messages" ||
        route === "/api/me" ||
        route === "/api/auth/register" ||
        route === "/api/auth/verify",
    };
  });
  app.addHook("onResponse", async (req, reply) => {
    if (
      reply.statusCode >= 300 ||
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.routeOptions.url?.includes("/uploads")
    )
      return;
    const change = (req as any).liveChange;
    if (!change) return;
    const id = (req.params as any)?.id;
    if (id && /\/listings\/:id(?:\/sold)?$/.test(req.routeOptions.url || ""))
      change.public =
        change.public ||
        read("SELECT status FROM listings WHERE id=?", id)?.status ===
          "published";
    if (req.routeOptions.url?.startsWith("/api/admin/businesses/"))
      change.public = true;
    const route = req.routeOptions.url || "",
      params = req.params as any,
      body = req.body as any;
    const admins = () =>
      all("SELECT id FROM users WHERE role='admin'").map((r) => r.id);
    const listing = params?.id
      ? read("SELECT owner_id FROM listings WHERE id=?", params.id)
      : undefined;
    if (
      (route === "/api/listings" && req.method === "POST") ||
      (route === "/api/listings/:id" && req.method === "PATCH")
    )
      notifications.notify(
        admins(),
        "Listing awaiting review",
        "A vehicle has been submitted for AutoCars review.",
        params?.id || (req as any).createdListingId
          ? `/cars/${encodeURIComponent(params?.id || (req as any).createdListingId)}`
          : "/workspace?tab=inventory",
      );
    if (route === "/api/admin/listings/:id" && listing)
      notifications.notify(
        [listing.owner_id],
        "Listing review updated",
        body?.status === "published"
          ? "Your vehicle listing is now published."
          : "There is an update to your vehicle listing.",
        `/cars/${encodeURIComponent(params.id)}`,
      );
    if ((req as any).createdBusiness)
      notifications.notify(
        admins(),
        "New business application",
        "A dealership or professional seller has requested a business account.",
        "/workspace?tab=businesses",
      );
    live.publish(change);
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        formAction: [
          "'self'",
          "https://www.payfast.co.za",
          "https://sandbox.payfast.co.za",
        ],
      },
    },
  });
  await app.register(cors, { origin: origins, credentials: true });
  await app.register(cookie);
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
  });
  await app.register(staticFiles, {
    root: uploadDir,
    prefix: "/uploads/",
    decorateReply: false,
    maxAge: "1d",
  });
  app.addHook("onRequest", async (req) => {
    if (req.routeOptions.url === "/api/payments/payfast/itn") return;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin))
        fail(403, "Origin is not allowed.");
      if (
        req.cookies.session &&
        !req.headers.authorization &&
        !origin &&
        req.headers["x-client"] !== "mobile"
      )
        fail(403, "Browser requests require an Origin header.");
    }
  });
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        message: err.issues
          .map((i: any) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (
      err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      err.message?.includes("UNIQUE constraint failed")
    )
      return reply.code(409).send({ message: "This record already exists." });
    if (
      err.statusCode >= 400 &&
      err.statusCode < 600 &&
      (err.statusCode < 500 || err.expose)
    )
      return reply.code(err.statusCode).send({ message: err.message });
    req.log.error(err);
    return reply
      .code(500)
      .send({ message: "Something went wrong. Please try again." });
  });
  app.get(
    "/api/live",
    {
      websocket: true,
      preValidation: async (req) => {
        if (req.headers.origin && !origins.includes(req.headers.origin))
          fail(403, "Origin is not allowed.");
      },
    },
    (socket, req) => {
      live.add(
        socket,
        req.cookies.session ||
          req.headers.authorization?.replace(/^Bearer /, ""),
      );
    },
  );
  app.get("/api/health", async () => ({ ok: !!read("SELECT 1 AS ok") }));
  app.get("/api/config", async () => ({
    brand,
    emailEnabled: !!mailer,
    paymentsEnabled: !!paymentConfig,
    paymentSandbox: paymentConfig?.sandbox || false,
  }));
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const b = z
        .object({
          name: z.string().trim().min(2).max(100),
          email,
          password,
          consent: z.literal(true),
          accountType: z.enum(["customer", "business"]).default("customer"),
          business: businessSchema.optional(),
        })
        .refine((b) => b.accountType !== "business" || !!b.business, {
          message: "Add your business contact details.",
          path: ["business"],
        })
        .parse(req.body);
      const id = randomUUID();
      const passwordHash = await hashPassword(b.password);
      db.exec("BEGIN");
      try {
        run(
          "INSERT INTO users VALUES(?,?,?,?,?,?,?)",
          id,
          b.name,
          b.email,
          passwordHash,
          "user",
          0,
          now(),
        );
        run("INSERT INTO account_profiles VALUES(?,?)", id, b.accountType);
        if (b.accountType === "business") {
          (req as any).createdBusiness = true;
          const applicationId = randomUUID();
          run(
            "INSERT INTO business_applications VALUES(?,?,?,?,?,?,?,?)",
            applicationId,
            id,
            "pending",
            JSON.stringify(b.business),
            "",
            "",
            now(),
            now(),
          );
          audit(id, "business.applied", applicationId);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      const u = read("SELECT * FROM users WHERE id=?", id)!;
      await sendToken(u, "verify").catch((e) =>
        req.log.error(e, "Verification email failed"),
      );
      reply.code(201);
      return session(req, reply, u);
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const b = z
        .object({ email, password: z.string().max(128) })
        .parse(req.body);
      const u = read("SELECT * FROM users WHERE email=?", b.email);
      const valid = await verifyPassword(
        b.password,
        u?.password || "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!u || !valid) fail(401, "Email or password is incorrect.");
      return session(req, reply, u);
    },
  );
  app.get("/api/auth/me", async (req) => ({
    user: publicUser(requireUser(req)),
  }));
  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.headers.authorization?.slice(7) || req.cookies.session;
    if (token) run("DELETE FROM sessions WHERE hash=?", hashToken(token));
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/auth/forgot",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (req) => {
      const b = z.object({ email }).parse(req.body);
      if (!mailer)
        fail(
          503,
          "Password recovery requires email delivery. Please contact the operator.",
        );
      const u = read("SELECT * FROM users WHERE email=?", b.email);
      if (u) await sendToken(u, "reset");
      return { ok: true };
    },
  );
  app.post(
    "/api/auth/verify/send",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (req) => {
      if (!mailer) fail(503, "Email delivery has not been configured.");
      await sendToken(requireUser(req), "verify");
      return { ok: true };
    },
  );
  app.post("/api/auth/verify", async (req) => {
    const { token } = z
      .object({ token: z.string().min(20).max(200) })
      .parse(req.body);
    const t = read(
      "SELECT * FROM tokens WHERE hash=? AND kind=? AND expires_at>?",
      hashToken(token),
      "verify",
      Date.now(),
    );
    if (!t) fail(400, "This verification link has expired.");
    run("UPDATE users SET verified=1 WHERE id=?", t.user_id);
    run("DELETE FROM tokens WHERE hash=?", hashToken(token));
    return { ok: true };
  });
  app.post("/api/auth/reset", async (req) => {
    const b = z
      .object({ token: z.string().min(20).max(200), password })
      .parse(req.body);
    const t = read(
      "SELECT * FROM tokens WHERE hash=? AND kind=? AND expires_at>?",
      hashToken(b.token),
      "reset",
      Date.now(),
    );
    if (!t) fail(400, "This reset link has expired.");
    const hash = await hashPassword(b.password);
    db.exec("BEGIN");
    try {
      if (
        !read(
          "SELECT hash FROM tokens WHERE hash=? AND kind=? AND expires_at>?",
          hashToken(b.token),
          "reset",
          Date.now(),
        )
      )
        fail(400, "This reset link has expired.");
      run("UPDATE users SET password=? WHERE id=?", hash, t.user_id);
      run("DELETE FROM sessions WHERE user_id=?", t.user_id);
      run("DELETE FROM tokens WHERE user_id=?", t.user_id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true };
  });
  app.get("/api/listings", async (req) => {
    const f = filterSchema.parse(req.query);
    const where = [
      "status='published'",
      "(json_extract(data,'$.paidUntil') IS NULL OR json_extract(data,'$.paidUntil')>?)",
    ];
    const args: any[] = [now()];
    if (f.q) {
      where.push(
        "instr(lower(json_extract(data,'$.make') || ' ' || json_extract(data,'$.model') || ' ' || json_extract(data,'$.variant') || ' ' || json_extract(data,'$.city')),lower(?))>0",
      );
      args.push(f.q);
    }
    for (const key of [
      "make",
      "bodyType",
      "province",
      "fuel",
      "transmission",
    ] as const)
      if (f[key]) {
        where.push(`lower(json_extract(data,'$.${key}'))=lower(?)`);
        args.push(f[key]);
      }
    for (const [key, column, operator] of [
      ["minPrice", "price", ">="],
      ["maxPrice", "price", "<="],
      ["minYear", "year", ">="],
      ["maxMileage", "mileage", "<="],
    ] as const)
      if (f[key]) {
        where.push(
          `CAST(json_extract(data,'$.${column}') AS INTEGER) ${operator} ?`,
        );
        args.push(Number(f[key]));
      }
    if (f.greatValue) where.push("json_extract(data,'$.greatValue')=1");
    const sorts: Record<string, string> = {
      newest: "created_at DESC",
      "price-asc": "CAST(json_extract(data,'$.price') AS INTEGER) ASC",
      "price-desc": "CAST(json_extract(data,'$.price') AS INTEGER) DESC",
      mileage: "CAST(json_extract(data,'$.mileage') AS INTEGER) ASC",
      year: "CAST(json_extract(data,'$.year') AS INTEGER) DESC",
    };
    const clause = where.join(" AND ");
    const total = read(
      `SELECT COUNT(*) AS n FROM listings WHERE ${clause}`,
      ...args,
    )!.n;
    const page = Math.max(1, Math.min(100000, Number(f.page) || 1));
    const items = all(
      `SELECT * FROM listings WHERE ${clause} ORDER BY ${sorts[f.sort || "newest"]},id LIMIT 18 OFFSET ?`,
      ...args,
      (page - 1) * 18,
    ).map((r) => ({ ...mapListing(r), phone: "" }));
    return { items, total, page, pages: Math.ceil(total / 18) };
  });
  app.get("/api/facets", async () => ({
    makes: all(
      "SELECT DISTINCT json_extract(data,'$.make') AS make FROM listings WHERE status='published' ORDER BY make",
    ).map((r) => r.make),
    total: read("SELECT COUNT(*) AS n FROM listings WHERE status='published'")!
      .n,
  }));
  app.get("/api/listings/:id", async (req) => {
    const { id } = req.params as { id: string };
    const r = read("SELECT * FROM listings WHERE id=?", id);
    if (!r) fail(404, "Vehicle not found.");
    const u = current(req);
    const expired = (() => {
      const d = JSON.parse(r.data);
      return !!d.paidUntil && d.paidUntil <= now();
    })();
    if (
      (r.status !== "published" || expired) &&
      u?.id !== r.owner_id &&
      u?.role !== "admin"
    )
      fail(404, "Vehicle not found.");
    return {
      listing: {
        ...mapListing(r),
        phone:
          u?.id === r.owner_id || u?.role === "admin"
            ? mapListing(r).phone
            : "",
      },
    };
  });
  function checkImages(images: string[], user: Row) {
    for (const image of images)
      if (
        !read(
          "SELECT * FROM uploads WHERE path=? AND owner_id=?",
          image,
          user.id,
        )
      )
        fail(400, "Use photos uploaded by your account.");
  }
  async function releaseUnusedPhotos(paths: string[], ownerId: string) {
    const used = new Set(
      all("SELECT data FROM listings WHERE owner_id=?", ownerId).flatMap(
        (r) => JSON.parse(r.data).images,
      ),
    );
    const stale = paths.filter((path) => !used.has(path));
    const removed = stale
      .map((path) =>
        read(
          "SELECT id FROM uploads WHERE path=? AND owner_id=?",
          path,
          ownerId,
        ),
      )
      .filter((r): r is Row => !!r);
    for (const r of removed) run("DELETE FROM uploads WHERE id=?", r.id);
    await Promise.all(
      removed.map((r) =>
        unlink(resolve(uploadDir, `${r.id}.webp`)).catch(() => {}),
      ),
    );
  }
  function adExpiry(from?: string) {
    const base = from && from > now() ? from : now();
    return new Date(
      new Date(base).getTime() + brand.adDays * 86400000,
    ).toISOString();
  }
  app.post("/api/payments/checkout", async (req) => {
    const u = requireUser(req);
    requireSeller(u);
    if (req.headers["x-client"] === "mobile")
      fail(
        409,
        "Paid listing purchases are not enabled in this native build. Native store billing must be configured before release.",
      );
    if (!paymentConfig)
      fail(
        503,
        "Secure checkout has not been configured. Please contact AutoCars.",
      );
    if (production && paymentConfig.sandbox)
      fail(503, "Live checkout is not configured.");
    const b = z
      .object({
        listing: listingSchema.optional(),
        renewId: z.string().uuid().optional(),
      })
      .refine(
        (v) => !!v.listing !== !!v.renewId,
        "Choose a new listing or a renewal.",
      )
      .parse(req.body);
    if (!requiresAdFee(publicUser(u)))
      fail(400, "This account advertises under separate commercial terms.");
    if (b.listing) checkImages(b.listing.images, u);
    if (b.renewId) {
      const row = read("SELECT owner_id FROM listings WHERE id=?", b.renewId);
      if (!row || row.owner_id !== u.id) fail(404, "Vehicle not found.");
    }
    const id = randomUUID();
    run(
      "INSERT INTO payment_orders VALUES(?,?,?,?,?,NULL,NULL,?,?,?)",
      id,
      u.id,
      brand.adFee,
      "pending",
      JSON.stringify(b),
      now(),
      now(),
      "",
    );
    return {
      id,
      ...checkoutFields(
        paymentConfig,
        id,
        { name: u.name, email: u.email },
        brand.adFee,
        `${brand.name} ${brand.adDays}-day vehicle advertisement`,
      ),
    };
  });
  app.get("/api/payments/:id", async (req) => {
    const u = requireUser(req);
    const order = read(
      "SELECT id,amount,status,listing_id AS listingId,error,created_at AS createdAt FROM payment_orders WHERE id=? AND user_id=?",
      (req.params as any).id,
      u.id,
    );
    if (!order) fail(404, "Payment not found.");
    return { payment: order };
  });
  app.get("/api/me/payments", async (req) => ({
    items: all(
      "SELECT id,amount,status,listing_id AS listingId,created_at AS createdAt,error FROM payment_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      requireUser(req).id,
    ),
  }));
  app.post("/api/payments/payfast/itn", async (req, reply) => {
    if (!paymentConfig) fail(503, "Payments are not configured.");
    if (typeof req.body !== "string")
      fail(400, "Invalid payment notification.");
    let fields: Record<string, string>;
    try {
      fields = await verifyPayfast(
        req.body,
        req.ip,
        paymentConfig,
        options.confirmPayment,
      );
    } catch {
      fail(400, "Invalid payment notification.");
    }
    const order = read(
      "SELECT * FROM payment_orders WHERE id=?",
      fields.m_payment_id,
    );
    if (!order) fail(404, "Payment not found.");
    if (
      !/^\d+\.\d{2}$/.test(fields.amount_gross || "") ||
      Math.round(Number(fields.amount_gross) * 100) !== order.amount * 100
    )
      fail(400, "Payment amount mismatch.");
    if (!fields.pf_payment_id || fields.pf_payment_id.length > 100)
      fail(400, "Invalid payment reference.");
    if (order.status === "paid") {
      if (order.provider_id !== fields.pf_payment_id)
        fail(409, "Payment reference conflict.");
      return reply.type("text/plain").send("OK");
    }
    if (fields.payment_status !== "COMPLETE") {
      if (["FAILED", "CANCELLED"].includes(fields.payment_status))
        run(
          "UPDATE payment_orders SET status='failed',updated_at=? WHERE id=?",
          now(),
          order.id,
        );
      live.publish({ users: [order.user_id], admin: true });
      return reply.type("text/plain").send("OK");
    }
    let listingId: string | undefined,
      error = "";
    db.exec("BEGIN");
    try {
      run(
        "UPDATE payment_orders SET status='paid',provider_id=?,updated_at=? WHERE id=?",
        fields.pf_payment_id,
        now(),
        order.id,
      );
      const owner = read("SELECT * FROM users WHERE id=?", order.user_id)!;
      const purpose = JSON.parse(order.purpose);
      try {
        requireSeller(owner);
        if (purpose.listing) {
          const draft = listingSchema.parse(purpose.listing);
          checkImages(draft.images, owner);
          listingId = randomUUID();
          run(
            "INSERT INTO listings VALUES(?,?,?,?,?,?,?)",
            listingId,
            owner.id,
            "pending",
            0,
            JSON.stringify({
              ...draft,
              paymentOrderId: order.id,
              rejectionReason: "",
            }),
            now(),
            now(),
          );
          audit(owner.id, "listing.created", listingId, {
            paymentOrderId: order.id,
          });
        } else {
          const row = read(
            "SELECT * FROM listings WHERE id=? AND owner_id=?",
            purpose.renewId,
            owner.id,
          );
          if (!row) throw new Error("Vehicle no longer exists.");
          listingId = row.id;
          const old = JSON.parse(row.data);
          run(
            "UPDATE listings SET data=?,updated_at=? WHERE id=?",
            JSON.stringify({
              ...old,
              paymentOrderId: order.id,
              paidUntil: adExpiry(old.paidUntil),
            }),
            now(),
            row.id,
          );
          audit(owner.id, "listing.renewed", row.id, {
            paymentOrderId: order.id,
          });
        }
      } catch {
        error =
          "Payment received. AutoCars must resolve your listing before it can be fulfilled.";
        listingId = undefined;
      }
      run(
        "UPDATE payment_orders SET listing_id=?,error=? WHERE id=?",
        listingId || null,
        error,
        order.id,
      );
      audit(order.user_id, "payment.verified", order.id, {
        provider: "payfast",
        amount: order.amount,
        listingId: listingId || null,
      });
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    notifications.notify(
      [order.user_id],
      "Payment received",
      error || "Your advertisement payment has been verified.",
      listingId ? `/cars/${listingId}` : `/payment?id=${order.id}`,
    );
    notifications.notify(
      adminIds(),
      "Advertisement payment verified",
      error || "A paid vehicle advertisement is ready for review.",
      "/workspace?tab=payments",
    );
    live.publish({ public: true, users: [order.user_id], admin: true });
    return reply.type("text/plain").send("OK");
  });
  app.post("/api/listings", async (req, reply) => {
    const u = requireUser(req);
    requireSeller(u);
    if (production && !u.verified)
      fail(403, "Verify your email before publishing a vehicle.");
    const b = listingSchema.parse(req.body);
    checkImages(b.images, u);
    if (requiresAdFee(publicUser(u)))
      fail(
        402,
        "Private advertisements must be submitted through secure checkout.",
      );
    const id = randomUUID();
    run(
      "INSERT INTO listings VALUES(?,?,?,?,?,?,?)",
      id,
      u.id,
      "pending",
      0,
      JSON.stringify({ ...b, rejectionReason: "" }),
      now(),
      now(),
    );
    audit(u.id, "listing.created", id);
    (req as any).createdListingId = id;
    reply.code(201);
    return {
      listing: mapListing(read("SELECT * FROM listings WHERE id=?", id)!),
    };
  });
  app.patch("/api/listings/:id", async (req) => {
    const u = requireUser(req);
    requireSeller(u);
    const { id } = req.params as { id: string };
    const row = read("SELECT * FROM listings WHERE id=?", id);
    if (!row) fail(404, "Vehicle not found.");
    if (row.owner_id !== u.id) fail(403, "You cannot edit this listing.");
    const body = listingSchema.parse(req.body);
    checkImages(body.images, u);
    const old = JSON.parse(row.data);
    run(
      "UPDATE listings SET data=?,status='pending',featured=0,updated_at=? WHERE id=?",
      JSON.stringify({
        ...body,
        rejectionReason: "",
        ...(old.paidUntil ? { paidUntil: old.paidUntil } : {}),
        ...(old.paymentOrderId ? { paymentOrderId: old.paymentOrderId } : {}),
      }),
      now(),
      id,
    );
    audit(u.id, "listing.edited", id);
    await releaseUnusedPhotos(JSON.parse(row.data).images, u.id);
    return { ok: true };
  });
  app.post("/api/listings/:id/sold", async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const row = read("SELECT * FROM listings WHERE id=?", id);
    if (!row) fail(404, "Vehicle not found.");
    if (row.owner_id !== u.id && u.role !== "admin")
      fail(403, "Access denied.");
    run(
      "UPDATE listings SET status='sold',featured=0,updated_at=? WHERE id=?",
      now(),
      id,
    );
    audit(u.id, "listing.sold", id);
    return { ok: true };
  });
  app.delete("/api/listings/:id", async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const row = read("SELECT * FROM listings WHERE id=?", id);
    if (!row) fail(404, "Vehicle not found.");
    if (row.owner_id !== u.id && u.role !== "admin")
      fail(403, "Access denied.");
    run("DELETE FROM listings WHERE id=?", id);
    audit(u.id, "listing.deleted", id);
    await releaseUnusedPhotos(JSON.parse(row.data).images, row.owner_id);
    return { ok: true };
  });
  app.get("/api/me/listings", async (req) => ({
    items: all(
      "SELECT * FROM listings WHERE owner_id=? ORDER BY created_at DESC",
      requireUser(req).id,
    ).map(mapListing),
  }));
  app.get("/api/me/favourites", async (req) => ({
    items: all(
      "SELECT l.* FROM listings l JOIN favourites f ON l.id=f.listing_id WHERE f.user_id=? AND l.status='published' ORDER BY l.created_at DESC",
      requireUser(req).id,
    ).map((r) => ({ ...mapListing(r), phone: "" })),
  }));
  app.post("/api/me/favourites/:id", async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    if (!read("SELECT id FROM listings WHERE id=? AND status='published'", id))
      fail(404, "Vehicle not available.");
    run("INSERT OR IGNORE INTO favourites VALUES(?,?)", u.id, id);
    return { ok: true };
  });
  app.delete("/api/me/favourites/:id", async (req) => {
    run(
      "DELETE FROM favourites WHERE user_id=? AND listing_id=?",
      requireUser(req).id,
      (req.params as any).id,
    );
    return { ok: true };
  });
  app.get("/api/me/searches", async (req) => ({
    items: all(
      "SELECT * FROM searches WHERE user_id=? ORDER BY created_at DESC",
      requireUser(req).id,
    ).map((r) => ({
      id: r.id,
      name: r.name,
      filters: JSON.parse(r.filters),
      createdAt: r.created_at,
    })),
  }));
  app.post("/api/me/searches", async (req) => {
    const u = requireUser(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        filters: filterSchema,
      })
      .parse(req.body);
    if (
      (read("SELECT COUNT(*) AS count FROM searches WHERE user_id=?", u.id)
        ?.count || 0) >= 30
    )
      fail(400, "You can save up to 30 searches.");
    const id = randomUUID();
    run(
      "INSERT INTO searches VALUES(?,?,?,?,?)",
      id,
      u.id,
      b.name,
      JSON.stringify(b.filters),
      now(),
    );
    return { id };
  });
  app.delete("/api/me/searches/:id", async (req) => {
    run(
      "DELETE FROM searches WHERE id=? AND user_id=?",
      (req.params as any).id,
      requireUser(req).id,
    );
    return { ok: true };
  });
  app.post(
    "/api/listings/:id/enquire",
    { config: { rateLimit: { max: 6, timeWindow: "15 minutes" } } },
    async (req) => {
      const u = requireUser(req);
      const b = z
        .object({
          name: z.string().trim().min(2).max(100),
          email,
          phone: z.string().regex(/^\+?[\d\s()-]{9,20}$/),
          message: z.string().trim().min(10).max(2000),
          consent: z.literal(true),
        })
        .parse(req.body);
      const l = read(
        "SELECT * FROM listings WHERE id=? AND status='published'",
        (req.params as any).id,
      );
      if (!l) fail(404, "Vehicle not available.");
      if (l.owner_id === u.id) fail(400, "This is your own listing.");
      const id = randomUUID();
      run(
        "INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        l.id,
        u.id,
        b.name,
        b.email,
        b.phone,
        b.message,
        "new",
        now(),
      );
      const seller = read("SELECT email FROM users WHERE id=?", l.owner_id)!;
      const car = `${JSON.parse(l.data).year} ${JSON.parse(l.data).make} ${JSON.parse(l.data).model}`;
      sendPush(
        [l.owner_id],
        "New vehicle enquiry",
        `${b.name} is interested in your ${car}.`,
        { leadId: id, type: "enquiry" },
      ).catch(() => {});
      if (mailer)
        await mailer
          .sendMail({
            from: process.env.MAIL_FROM,
            to: seller.email,
            subject: `${brand.name}: new vehicle enquiry`,
            text: `You have a new enquiry. Sign in at ${origins[0]}/workspace to respond.`,
          })
          .catch((e) => req.log.error(e, "Lead email failed"));
      return { id };
    },
  );
  app.get("/api/me/enquiries", async (req) => {
    const me = requireUser(req);
    return {
      items: all(
        "SELECT e.*,l.data,l.owner_id,(SELECT COUNT(*) FROM messages m WHERE m.lead_id=e.id AND m.sender_id<>? AND m.created_at>COALESCE((SELECT read_at FROM lead_reads WHERE lead_id=e.id AND user_id=?),'')) AS unread FROM leads e JOIN listings l ON e.listing_id=l.id WHERE e.buyer_id=? ORDER BY e.created_at DESC",
        me.id,
        me.id,
        me.id,
      ).map((r) => {
        const l = JSON.parse(r.data);
        return {
          id: r.id,
          listingId: r.listing_id,
          ownerId: r.owner_id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          message: r.message,
          status: r.status,
          createdAt: r.created_at,
          make: l.make,
          model: l.model,
          year: l.year,
          unread: r.unread,
        };
      }),
    };
  });
  const leadAccess = (req: any) => {
    const u = requireUser(req);
    const id = (req.params as any).id;
    const lead = read(
      "SELECT e.*,l.owner_id,l.data AS listing_data FROM leads e JOIN listings l ON e.listing_id=l.id WHERE e.id=?",
      id,
    );
    if (!lead) fail(404, "Enquiry not found.");
    if (lead.buyer_id !== u.id && lead.owner_id !== u.id && u.role !== "admin")
      fail(403, "Access denied.");
    return { u, lead };
  };
  const mapMessage = (r: Row): import("@autocars/core").ChatMessage => ({
    id: r.id,
    leadId: r.lead_id,
    senderId: r.sender_id,
    senderName: r.sender_name || "AutoCars",
    body: r.body,
    createdAt: r.created_at,
  });
  app.get("/api/leads/:id/messages", async (req) => {
    const { u, lead } = leadAccess(req);
    const lastMessage = read(
      "SELECT MAX(created_at) AS latest FROM messages WHERE lead_id=? AND sender_id<>?",
      lead.id,
      u.id,
    )?.latest;
    const last = [lastMessage, lead.buyer_id !== u.id ? lead.created_at : null]
      .filter(Boolean)
      .sort()
      .at(-1);
    const previous = read(
      "SELECT read_at FROM lead_reads WHERE lead_id=? AND user_id=?",
      lead.id,
      u.id,
    )?.read_at;
    if (last && (!previous || previous < last)) {
      run(
        "INSERT OR REPLACE INTO lead_reads VALUES(?,?,?)",
        lead.id,
        u.id,
        last,
      );
      live.publish({ users: [u.id] });
    }
    const replies = all(
      "SELECT * FROM (SELECT m.*,m.rowid AS message_position,u.name AS sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.lead_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 500) ORDER BY created_at ASC,message_position ASC",
      lead.id,
    ).map(mapMessage);
    const vehicle = JSON.parse(lead.listing_data);
    return {
      vehicle: {
        id: lead.listing_id,
        title: [vehicle.year, vehicle.make, vehicle.model, vehicle.variant]
          .filter(Boolean)
          .join(" "),
      },
      truncated:
        (read("SELECT COUNT(*) AS n FROM messages WHERE lead_id=?", lead.id)
          ?.n || 0) > 500,
      items: [
        {
          id: `${lead.id}:enquiry`,
          leadId: lead.id,
          senderId: lead.buyer_id || "",
          senderName: lead.name,
          body: lead.message,
          createdAt: lead.created_at,
        },
        ...replies,
      ],
    };
  });
  app.post("/api/leads/:id/messages", async (req) => {
    const { u, lead } = leadAccess(req);
    const b = z
      .object({ body: z.string().trim().min(1).max(2000) })
      .parse(req.body);
    const id = randomUUID();
    run(
      "INSERT INTO messages VALUES(?,?,?,?,?)",
      id,
      lead.id,
      u.id,
      b.body,
      now(),
    );
    // Staff may participate without being either party to the enquiry.
    // Notify both participants in that case, excluding the sender.
    const staffParticipants = all(
      "SELECT DISTINCT m.sender_id FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.lead_id=? AND u.role='admin'",
      lead.id,
    ).map((row) => row.sender_id);
    const recipients = [
      lead.owner_id,
      lead.buyer_id,
      ...staffParticipants,
    ].filter((id): id is string => !!id && id !== u.id);
    const l = JSON.parse(lead.listing_data);
    const car = `${l.year} ${l.make} ${l.model}`;
    sendPush(
      recipients,
      `${u.name} sent a message`,
      `About the ${car}: ${b.body.slice(0, 80)}`,
      { leadId: lead.id, type: "message" },
    ).catch(() => {});
    return {
      message: mapMessage(
        read(
          "SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?",
          id,
        )!,
      ),
    };
  });
  app.get("/api/me/inbox", async (req) => {
    const u = requireUser(req);
    const rows = all(
      `SELECT e.id,e.listing_id,l.data,
      COALESCE((SELECT created_at FROM messages WHERE lead_id=e.id ORDER BY created_at DESC,rowid DESC LIMIT 1),e.created_at) AS updated_at,
      COALESCE((SELECT body FROM messages WHERE lead_id=e.id ORDER BY created_at DESC,rowid DESC LIMIT 1),e.message) AS preview,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id=e.id AND m.sender_id<>? AND m.created_at>COALESCE((SELECT read_at FROM lead_reads WHERE lead_id=e.id AND user_id=?),''))
      + CASE WHEN e.buyer_id IS NOT ? AND e.created_at>COALESCE((SELECT read_at FROM lead_reads WHERE lead_id=e.id AND user_id=?),'') THEN 1 ELSE 0 END AS unread
      FROM leads e JOIN listings l ON l.id=e.listing_id
      WHERE ?='admin' OR l.owner_id=? OR e.buyer_id=?
      ORDER BY updated_at DESC LIMIT 1000`,
      u.id,
      u.id,
      u.id,
      u.id,
      u.role,
      u.id,
      u.id,
    );
    const items = rows.map((row) => {
      const vehicle = JSON.parse(row.data);
      return {
        id: row.id,
        listingId: row.listing_id,
        title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        preview: row.preview,
        unread: Number(row.unread),
        updatedAt: row.updated_at,
      };
    });
    return { items, unread: items.reduce((sum, item) => sum + item.unread, 0) };
  });
  app.get("/api/me/leads", async (req) => {
    const me = requireUser(req);
    return {
      items: all(
        "SELECT e.*,l.data,(SELECT COUNT(*) FROM messages m WHERE m.lead_id=e.id AND m.sender_id<>? AND m.created_at>COALESCE((SELECT read_at FROM lead_reads WHERE lead_id=e.id AND user_id=?),'')) AS unread FROM leads e JOIN listings l ON e.listing_id=l.id WHERE l.owner_id=? ORDER BY e.created_at DESC",
        me.id,
        me.id,
        me.id,
      ).map((r) => {
        const l = JSON.parse(r.data);
        return {
          id: r.id,
          listingId: r.listing_id,
          buyerId: r.buyer_id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          message: r.message,
          status: r.status,
          createdAt: r.created_at,
          make: l.make,
          model: l.model,
          year: l.year,
          unread: r.unread,
        };
      }),
    };
  });
  app.patch("/api/me/leads/:id", async (req) => {
    const u = requireUser(req);
    const b = z
      .object({ status: z.enum(["new", "contacted", "closed"]) })
      .parse(req.body);
    const l = read(
      "SELECT e.id FROM leads e JOIN listings l ON e.listing_id=l.id WHERE e.id=? AND l.owner_id=?",
      (req.params as any).id,
      u.id,
    );
    if (!l) fail(404, "Enquiry not found.");
    run("UPDATE leads SET status=? WHERE id=?", b.status, l.id);
    return { ok: true };
  });
  app.get("/api/admin/leads", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT e.*,l.data FROM leads e JOIN listings l ON e.listing_id=l.id ORDER BY e.created_at DESC LIMIT 1000",
      ).map((r) => {
        const l = JSON.parse(r.data);
        return {
          id: r.id,
          listingId: r.listing_id,
          buyerId: r.buyer_id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          message: r.message,
          status: r.status,
          createdAt: r.created_at,
          make: l.make,
          model: l.model,
          year: l.year,
          sellerName: l.sellerName,
        };
      }),
    };
  });
  app.patch("/api/admin/leads/:id", async (req) => {
    const u = admin(req);
    const b = z
      .object({ status: z.enum(["new", "contacted", "closed"]) })
      .parse(req.body);
    const id = (req.params as { id: string }).id;
    if (!read("SELECT id FROM leads WHERE id=?", id))
      fail(404, "Enquiry not found.");
    run("UPDATE leads SET status=? WHERE id=?", b.status, id);
    audit(u.id, "enquiry.updated", id, b);
    return { ok: true };
  });
  app.post(
    "/api/uploads",
    {
      config: {
        rateLimit: {
          max: async (req: any) => (current(req)?.role === "admin" ? 500 : 30),
          timeWindow: "15 minutes",
        },
      },
    },
    async (req) => {
      const u = requireUser(req);
      requireSeller(u);
      if (
        (read("SELECT COUNT(*) AS n FROM uploads WHERE owner_id=?", u.id)?.n ||
          0) >= 300
      )
        fail(400, "Photo limit reached. Remove unused photos first.");
      const file = await req.file();
      if (!file) fail(400, "Choose a photo.");
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(file.mimetype)
      )
        fail(400, "Use a JPEG, PNG, WebP or supported HEIC photo.");
      const buffer = await file.toBuffer();
      let image: Buffer;
      try {
        image = await sharp(buffer, { limitInputPixels: 40000000 })
          .rotate()
          .resize({
            width: 1920,
            height: 1440,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        fail(400, "This photo could not be read. Try a JPEG or PNG.");
      }
      const id = randomUUID(),
        path = `/uploads/${id}.webp`;
      await writeFile(resolve(uploadDir, `${id}.webp`), image!);
      run("INSERT INTO uploads VALUES(?,?,?,?)", id, u.id, path, now());
      return { url: path };
    },
  );
  app.delete("/api/uploads/:id", async (req) => {
    const u = requireUser(req);
    const r = read(
      "SELECT * FROM uploads WHERE id=? AND owner_id=?",
      (req.params as any).id,
      u.id,
    );
    if (!r) fail(404, "Photo not found.");
    if (
      all("SELECT data FROM listings WHERE owner_id=?", u.id).some((l) =>
        JSON.parse(l.data).images.includes(r.path),
      )
    )
      fail(409, "This photo is used by a listing.");
    await unlink(resolve(uploadDir, `${r.id}.webp`)).catch(() => {});
    run("DELETE FROM uploads WHERE id=?", r.id);
    return { ok: true };
  });
  app.get("/api/push/config", async () => ({
    webEnabled: !!(
      process.env.WEB_PUSH_PUBLIC_KEY &&
      process.env.WEB_PUSH_PRIVATE_KEY &&
      process.env.WEB_PUSH_SUBJECT
    ),
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || null,
  }));
  app.get("/api/me/notifications", async (req) => ({
    items: all(
      "SELECT id,title,body,path,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      requireUser(req).id,
    ),
  }));
  app.post("/api/me/notifications/read", async (req) => {
    run(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
      now(),
      requireUser(req).id,
    );
    return { ok: true };
  });
  app.post("/api/me/push", async (req) => {
    const u = requireUser(req);
    const b = z
      .discriminatedUnion("platform", [
        z.object({
          platform: z.literal("web"),
          subscription: z.object({
            endpoint: z
              .string()
              .max(2000)
              .refine(validPushEndpoint, "Unsupported push provider endpoint."),
            keys: z.object({
              p256dh: z
                .string()
                .min(40)
                .max(200)
                .regex(/^[A-Za-z0-9_=-]+$/),
              auth: z
                .string()
                .min(16)
                .max(100)
                .regex(/^[A-Za-z0-9_=-]+$/),
            }),
          }),
        }),
        z.object({
          platform: z.literal("expo"),
          token: z
            .string()
            .max(200)
            .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
        }),
      ])
      .parse(req.body);
    if (
      b.platform === "web" &&
      (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY)
    )
      fail(503, "Web push has not been configured.");
    const key = b.platform === "web" ? b.subscription.endpoint : b.token;
    const existing = read(
      "SELECT id,user_id FROM notification_subscriptions WHERE subscription_key=?",
      key,
    );
    const id = existing?.id || randomUUID();
    if (existing) {
      if (existing.user_id !== u.id)
        run("DELETE FROM push_jobs WHERE subscription_id=?", id);
      run(
        "UPDATE notification_subscriptions SET user_id=?,platform=?,data=? WHERE id=?",
        u.id,
        b.platform,
        JSON.stringify(
          b.platform === "web" ? b.subscription : { token: b.token },
        ),
        id,
      );
    } else {
      if (
        (read(
          "SELECT COUNT(*) AS n FROM notification_subscriptions WHERE user_id=?",
          u.id,
        )?.n || 0) >= 20
      )
        fail(400, "You can register up to 20 devices.");
      run(
        "INSERT INTO notification_subscriptions VALUES(?,?,?,?,?,?)",
        id,
        u.id,
        b.platform,
        key,
        JSON.stringify(
          b.platform === "web" ? b.subscription : { token: b.token },
        ),
        now(),
      );
    }
    return { id };
  });
  app.delete("/api/me/push/:id", async (req) => {
    run(
      "DELETE FROM notification_subscriptions WHERE id=? AND user_id=?",
      (req.params as any).id,
      requireUser(req).id,
    );
    return { ok: true };
  });
  app.post(
    "/api/me/push/test",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (req) => {
      const u = requireUser(req);
      if (
        !read(
          "SELECT id FROM notification_subscriptions WHERE user_id=? LIMIT 1",
          u.id,
        )
      )
        fail(
          409,
          "Enable push notifications on this device first. No devices are registered for your account.",
        );
      notifications.notify(
        [u.id],
        "Notifications are connected",
        "You’ll receive updates about your listings, enquiries and business application.",
        "/account",
      );
      live.publish({ users: [u.id] });
      return { ok: true };
    },
  );
  app.get("/api/admin/payments", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT p.id,p.amount,p.status,p.listing_id AS listingId,p.created_at AS createdAt,p.error,u.name,u.email FROM payment_orders p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 1000",
      ),
    };
  });
  app.get("/api/admin/push/status", async (req) => {
    admin(req);
    return {
      subscriptions: read(
        "SELECT COUNT(*) AS n FROM notification_subscriptions",
      )!.n,
      queued: read(
        "SELECT COUNT(*) AS n FROM push_jobs WHERE status IN ('pending','receipt')",
      )!.n,
      failed: read("SELECT COUNT(*) AS n FROM push_jobs WHERE status='failed'")!
        .n,
    };
  });
  app.get("/api/me/business", async (req) => {
    const u = requireUser(req);
    const r = read("SELECT * FROM business_applications WHERE user_id=?", u.id);
    return { application: r ? businessApplication(r) : null };
  });
  app.post("/api/me/business", async (req) => {
    const u = requireUser(req);
    if (publicUser(u).accountType !== "business")
      fail(403, "This is a customer account.");
    const b = businessSchema.parse(req.body);
    const r = read("SELECT * FROM business_applications WHERE user_id=?", u.id);
    if (r && !["pending", "rejected"].includes(r.status))
      fail(
        409,
        "Contact AutoCars to amend an application that is already being reviewed or has agreed terms.",
      );
    const id = r?.id || randomUUID();
    if (r)
      run(
        "UPDATE business_applications SET data=?,status='pending',review_note='',agreement_reference='',updated_at=? WHERE id=?",
        JSON.stringify(b),
        now(),
        id,
      );
    else
      run(
        "INSERT INTO business_applications VALUES(?,?,?,?,?,?,?,?)",
        id,
        u.id,
        "pending",
        JSON.stringify(b),
        "",
        "",
        now(),
        now(),
      );
    audit(u.id, "business.submitted", id);
    sendPush(
      adminIds(),
      "New business application",
      `${u.name} applied to list vehicles as a business.`,
      { type: "business", path: "/workspace?tab=businesses" },
    ).catch(() => {});
    return {
      application: businessApplication(
        read("SELECT * FROM business_applications WHERE id=?", id)!,
      ),
    };
  });
  app.get("/api/admin/businesses", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT * FROM business_applications ORDER BY updated_at DESC LIMIT 1000",
      ).map(businessApplication),
    };
  });
  app.patch("/api/admin/businesses/:id", async (req) => {
    const u = admin(req);
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        status: z.enum(["contacted", "active", "rejected", "suspended"]),
        note: z.string().trim().min(5).max(1500),
        agreementReference: z.string().trim().max(500).default(""),
        termsConfirmed: z.boolean().default(false),
      })
      .parse(req.body);
    const r = read("SELECT * FROM business_applications WHERE id=?", id);
    if (!r) fail(404, "Business application not found.");
    if (b.status === "active" && (!b.termsConfirmed || !b.agreementReference))
      fail(
        400,
        "Record the agreed commercial terms reference and confirm that the agreement has been concluded before activation.",
      );
    db.exec("BEGIN");
    try {
      run(
        "UPDATE business_applications SET status=?,review_note=?,agreement_reference=?,updated_at=? WHERE id=?",
        b.status,
        b.note,
        b.status === "active" ? b.agreementReference : r.agreement_reference,
        now(),
        id,
      );
      if (b.status !== "active")
        run(
          "UPDATE listings SET status='pending',featured=0,updated_at=? WHERE owner_id=? AND status='published'",
          now(),
          r.user_id,
        );
      audit(u.id, "business." + b.status, id, {
        note: b.note,
        agreementReference:
          b.status === "active" ? b.agreementReference : r.agreement_reference,
        termsConfirmed: b.termsConfirmed,
      });
      sendPush(
        [r.user_id],
        `Business account ${b.status}`,
        `Your AutoCars business application is now ${b.status}.`,
        { type: "business", path: "/workspace?tab=business" },
      ).catch(() => {});
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return {
      application: businessApplication(
        read("SELECT * FROM business_applications WHERE id=?", id)!,
      ),
    };
  });
  app.get("/api/admin/overview", async (req) => {
    admin(req);
    return {
      users: read("SELECT COUNT(*) AS n FROM users")!.n,
      businessPending: read(
        "SELECT COUNT(*) AS n FROM business_applications WHERE status IN ('pending','contacted')",
      )!.n,
      listings: read("SELECT COUNT(*) AS n FROM listings")!.n,
      pending: read(
        "SELECT COUNT(*) AS n FROM listings WHERE status='pending'",
      )!.n,
      published: read(
        "SELECT COUNT(*) AS n FROM listings WHERE status='published'",
      )!.n,
      leads: read("SELECT COUNT(*) AS n FROM leads")!.n,
    };
  });
  app.get("/api/admin/listings", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT * FROM listings ORDER BY created_at DESC LIMIT 1000",
      ).map(mapListing),
    };
  });
  app.patch("/api/admin/listings/:id", async (req) => {
    const u = admin(req);
    const { id } = req.params as { id: string };
    const b = z
      .object({
        status: z.enum(["published", "rejected", "pending", "sold"]),
        featured: z.boolean().default(false),
        reason: z.string().max(500).default(""),
      })
      .parse(req.body);
    if (b.status === "rejected" && !b.reason.trim())
      fail(400, "Give the seller a reason for rejection.");
    const r = read("SELECT * FROM listings WHERE id=?", id);
    if (!r) fail(404, "Vehicle not found.");
    if (b.status === "published")
      requireSeller(read("SELECT * FROM users WHERE id=?", r.owner_id)!);
    const listingData = JSON.parse(r.data);
    if (
      b.status === "published" &&
      requiresAdFee(
        publicUser(read("SELECT * FROM users WHERE id=?", r.owner_id)!),
      )
    ) {
      const paid = read(
        "SELECT id FROM payment_orders WHERE id=? AND user_id=? AND listing_id=? AND status='paid'",
        listingData.paymentOrderId || "",
        r.owner_id,
        id,
      );
      if (!paid) fail(402, "A verified advertisement payment is required.");
      if (!listingData.paidUntil) listingData.paidUntil = adExpiry();
      else if (listingData.paidUntil <= now())
        fail(402, "This advertisement must be renewed before publication.");
    }
    run(
      "UPDATE listings SET status=?,featured=?,data=?,updated_at=? WHERE id=?",
      b.status,
      b.status === "published" && b.featured ? 1 : 0,
      JSON.stringify({ ...listingData, rejectionReason: b.reason }),
      now(),
      id,
    );
    audit(u.id, "listing.moderated", id, b);
    return { ok: true };
  });
  app.get("/api/admin/users", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT id,name,email,role,verified,created_at FROM users ORDER BY created_at DESC LIMIT 1000",
      ),
    };
  });
  app.get("/api/admin/audit", async (req) => {
    admin(req);
    return {
      items: all(
        "SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON a.actor_id=u.id ORDER BY a.created_at DESC LIMIT 200",
      ),
    };
  });
  app.get("/api/me/export", async (req) => {
    const u = requireUser(req);
    const business = read(
      "SELECT * FROM business_applications WHERE user_id=?",
      u.id,
    );
    return {
      user: publicUser(u),
      businessApplication: business ? businessApplication(business) : null,
      payments: all(
        "SELECT id,amount,status,listing_id,created_at,updated_at,error FROM payment_orders WHERE user_id=?",
        u.id,
      ),
      notifications: all(
        "SELECT title,body,path,created_at,read_at FROM notifications WHERE user_id=?",
        u.id,
      ),
      listings: all("SELECT * FROM listings WHERE owner_id=?", u.id).map(
        mapListing,
      ),
      searches: all(
        "SELECT name,filters,created_at FROM searches WHERE user_id=?",
        u.id,
      ),
      enquiries: all("SELECT * FROM leads WHERE buyer_id=?", u.id),
      favourites: all(
        "SELECT listing_id FROM favourites WHERE user_id=?",
        u.id,
      ),
    };
  });
  app.delete("/api/me", async (req, reply) => {
    const u = requireUser(req);
    if (u.role === "admin")
      fail(
        400,
        "Administrator accounts must be removed by the server operator.",
      );
    const b = z.object({ password: z.string().max(128) }).parse(req.body);
    if (!(await verifyPassword(b.password, u.password)))
      fail(401, "Password is incorrect.");
    const photos = all("SELECT id FROM uploads WHERE owner_id=?", u.id);
    run("DELETE FROM users WHERE id=?", u.id);
    await Promise.all(
      photos.map((r) =>
        unlink(resolve(uploadDir, `${r.id}.webp`)).catch(() => {}),
      ),
    );
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  if (options.webRoot && existsSync(options.webRoot)) {
    const html = await readFile(resolve(options.webRoot, "index.html"), "utf8");
    const escape = (v: unknown) =>
      String(v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    app.get("/robots.txt", async (_req, reply) =>
      reply
        .type("text/plain")
        .send(
          `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /workspace\nDisallow: /garage\nSitemap: ${origins[0]}/sitemap.xml`,
        ),
    );
    app.get("/sitemap.xml", async (_req, reply) => {
      const paths = [
        "/",
        "/cars",
        "/finance",
        ...all("SELECT id FROM listings WHERE status='published'").map(
          (r) => `/cars/${r.id}`,
        ),
      ];
      return reply
        .type("application/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escape(origins[0] + p)}</loc></url>`).join("")}</urlset>`,
        );
    });
    app.get("/cars/:id", async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const row = read("SELECT * FROM listings WHERE id=?", id);
      if (!row || row.status !== "published")
        return reply.type("text/html").send(html);
      const car = mapListing(row);
      const title = `${car.year} ${car.make} ${car.model} for sale | ${brand.name}`;
      const description = `${car.variant}. ${car.mileage.toLocaleString()} km. ${car.transmission}. ${car.city}, ${car.province}. ${brand.name}.`;
      const url = origins[0] + `/cars/${id}`;
      const structured = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Car",
        name: title,
        brand: { "@type": "Brand", name: car.make },
        model: car.model,
        vehicleModelDate: String(car.year),
        image: car.images.map((p) => origins[0] + p),
        mileageFromOdometer: {
          "@type": "QuantitativeValue",
          value: car.mileage,
          unitCode: "KMT",
        },
        offers: {
          "@type": "Offer",
          price: car.price,
          priceCurrency: brand.currency,
          availability: "https://schema.org/InStock",
          url,
        },
      }).replace(/</g, "\\u003c");
      return reply
        .type("text/html")
        .send(
          html
            .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
            .replace(
              "</head>",
              `<link rel="canonical" href="${escape(url)}"/><meta property="og:title" content="${escape(title)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:image" content="${escape(origins[0] + car.images[0])}"/><script type="application/ld+json">${structured}</script></head>`,
            ),
        );
    });

    await app.register(staticFiles, {
      root: options.webRoot,
      prefix: "/",
      decorateReply: true,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/uploads/"))
        return reply.code(404).send({ message: "Not found." });
      return reply.sendFile("index.html");
    });
  }
  app.addHook("onClose", async () => {
    await notifications.stop();
    db.close();
  });
  return { app, db, live, notifications };
}
