import { payfastSignature } from "../src/payfast";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildApp } from "../src/app";
import { hashPassword, hashToken, newToken } from "../src/auth";
import { payment } from "@autocars/core";
const origin = "http://localhost:5173";
test("complete marketplace lifecycle, authorisation, uploads, moderation, enquiries, privacy and persistence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autocars-test-"));
  const paymentConfig = {
    merchantId: "10000100",
    merchantKey: "test-key",
    passphrase: "test-passphrase",
    origin: "https://autocars.test",
    sandbox: true,
  };
  let { app, db } = await buildApp({
    dataDir: dir,
    logger: false,
    paymentConfig,
    confirmPayment: async () => true,
  });
  const request = async (
    method: string,
    url: string,
    payload?: any,
    token?: string,
  ) =>
    app.inject({
      method: method as any,
      url,
      payload,
      headers: {
        origin,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  try {
    assert.deepEqual((await request("GET", "/api/listings")).json().items, []);
    const register = async (name: string, email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin, "x-client": "mobile" },
        payload: {
          name,
          email,
          password: "A secure test password 2026",
          consent: true,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json();
    };
    const seller = await register("Seller", "seller@example.com"),
      buyer = await register("Buyer", "buyer@example.com"),
      other = await register("Other seller", "other@example.com");
    assert.ok(seller.token);
    assert.equal(seller.user.role, "user");
    assert.equal(
      String(db.prepare("SELECT hash FROM sessions").get()?.hash).length,
      64,
    );
    assert.equal(
      (await request("GET", "/api/admin/users", undefined, seller.token))
        .statusCode,
      403,
    );
    assert.equal((await request("GET", "/api/me/listings")).statusCode, 401);
    assert.equal(
      (
        await request("POST", "/api/auth/login", {
          email: "seller@example.com",
          password: "wrong",
        })
      ).statusCode,
      401,
    );
    const csrf = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "https://evil.example",
        authorization: `Bearer ${seller.token}`,
      },
    });
    assert.equal(csrf.statusCode, 403);
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#eee" },
    })
      .jpeg()
      .toBuffer();
    const boundary = "TESTBOUNDARY";
    const uploadBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="car.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        origin,
        authorization: `Bearer ${seller.token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: uploadBody,
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const url = upload.json().url;
    assert.match(url, /\.webp$/);
    const b = {
      make: "Toyota",
      model: "Corolla Cross",
      variant: "1.8 XR",
      year: 2023,
      price: 350000,
      mileage: 45000,
      bodyType: "SUV",
      fuel: "Petrol",
      transmission: "Automatic",
      province: "Gauteng",
      city: "Johannesburg",
      description:
        "A well maintained car with a full service history and a clean interior.",
      images: [url],
      sellerName: "Seller Motors",
      phone: "0821234567",
      greatValue: true,
    };
    assert.equal(
      (await request("POST", "/api/listings", b, other.token)).statusCode,
      400,
      "Cannot claim someone else’s uploaded photo",
    );
    assert.equal(
      (await request("POST", "/api/listings", b, seller.token)).statusCode,
      402,
      "Personal sellers must pay the advertisement fee",
    );
    async function payFor(purpose: unknown) {
      const checkout = await request(
        "POST",
        "/api/payments/checkout",
        purpose,
        seller.token,
      );
      assert.equal(checkout.statusCode, 200, checkout.body);
      const fields = {
        merchant_id: paymentConfig.merchantId,
        m_payment_id: checkout.json().id,
        pf_payment_id: randomUUID(),
        payment_status: "COMPLETE",
        amount_gross: "500.00",
      };
      const signature = payfastSignature(
        Object.entries(fields),
        paymentConfig.passphrase,
      );
      const result = await app.inject({
        method: "POST",
        url: "/api/payments/payfast/itn",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({ ...fields, signature }).toString(),
      });
      assert.equal(result.statusCode, 200, result.body);
      const count = db.prepare("SELECT COUNT(*) AS n FROM listings").get()!.n;
      const duplicate = await app.inject({
        method: "POST",
        url: "/api/payments/payfast/itn",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({ ...fields, signature }).toString(),
      });
      assert.equal(duplicate.statusCode, 200, duplicate.body);
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM listings").get()!.n,
        count,
        "A webhook replay cannot create or charge for a second listing.",
      );
      return (
        await request(
          "GET",
          `/api/payments/${checkout.json().id}`,
          undefined,
          seller.token,
        )
      ).json().payment;
    }
    const paid = await payFor({ listing: b });
    const id = paid.listingId;
    assert.ok(id);
    const created = (
      await request("GET", `/api/listings/${id}`, undefined, seller.token)
    ).json().listing;
    assert.equal(created.status, "pending");
    assert.equal(created.greatValue, true);
    assert.equal(
      created.paidUntil,
      undefined,
      "Thirty days start at first approval, not checkout.",
    );
    assert.equal((await request("GET", "/api/listings")).json().total, 0);
    assert.equal((await request("GET", `/api/listings/${id}`)).statusCode, 404);
    assert.equal(
      (await request("GET", `/api/listings/${id}`, undefined, seller.token))
        .statusCode,
      200,
    );
    assert.equal(
      (await request("PATCH", `/api/listings/${id}`, b, other.token))
        .statusCode,
      403,
    );
    const adminId = randomUUID();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
      adminId,
      "Admin",
      "admin@example.com",
      await hashPassword("A secure admin password 2026"),
      "admin",
      1,
      new Date().toISOString(),
    );
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin, "x-client": "mobile" },
      payload: {
        email: "admin@example.com",
        password: "A secure admin password 2026",
      },
    });
    const admin = adminLogin.json().token;
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/admin/listings/${id}`,
          { status: "rejected" },
          admin,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/admin/listings/${id}`,
          { status: "published", featured: true },
          admin,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/listings?q=corolla&maxPrice=400000")).json()
        .total,
      1,
    );
    assert.equal(
      (await request("GET", "/api/listings?maxPrice=300000")).json().total,
      0,
    );
    assert.equal(
      (await request("GET", "/api/listings?minYear=2024")).json().total,
      0,
    );
    assert.equal(
      (await request("GET", "/api/listings?greatValue=true")).json().total,
      1,
    );
    assert.equal(
      (
        await request("GET", "/api/listings?greatValue=true&maxPrice=300000")
      ).json().total,
      0,
    );
    db.prepare(
      "UPDATE listings SET data=json_set(data,'$.paidUntil','2000-01-01T00:00:00.000Z') WHERE id=?",
    ).run(id);
    assert.equal(
      (await request("GET", "/api/listings")).json().total,
      0,
      "Expired advertisements leave the public catalogue",
    );
    assert.equal((await request("GET", `/api/listings/${id}`)).statusCode, 404);
    const renewed = await payFor({ renewId: id });
    assert.equal(renewed.listingId, id);
    assert.equal((await request("GET", "/api/listings")).json().total, 1);
    assert.equal(
      (await request("GET", "/api/listings?sort=invalid")).statusCode,
      400,
    );
    assert.equal(
      (await request("GET", "/api/listings?q=%27%20OR%201%3D1")).json().total,
      0,
    );
    assert.equal(
      (await request("POST", `/api/me/favourites/${id}`, {}, buyer.token))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await request("GET", "/api/me/favourites", undefined, buyer.token)
      ).json().items.length,
      1,
    );
    const ss = await request(
      "POST",
      "/api/me/searches",
      { name: "SUV budget", filters: { bodyType: "SUV", maxPrice: "400000" } },
      buyer.token,
    );
    assert.equal(ss.statusCode, 200);
    assert.equal(
      (await request("GET", "/api/me/searches", undefined, buyer.token)).json()
        .items.length,
      1,
    );
    const enquiry = await request(
      "POST",
      `/api/listings/${id}/enquire`,
      {
        name: "Buyer",
        email: "buyer@example.com",
        phone: "0821112222",
        message: "Can I view the car this weekend?",
        consent: true,
      },
      buyer.token,
    );
    assert.equal(enquiry.statusCode, 200, enquiry.body);
    const lead = enquiry.json().id;
    // Chat: participants only, both directions
    assert.equal(
      (
        await request(
          "GET",
          `/api/leads/${lead}/messages`,
          undefined,
          other.token,
        )
      ).statusCode,
      403,
    );
    const msg1 = await request(
      "POST",
      `/api/leads/${lead}/messages`,
      { body: "Hi, is the car still available?" },
      buyer.token,
    );
    assert.equal(msg1.statusCode, 200, msg1.body);
    await request(
      "POST",
      `/api/leads/${lead}/messages`,
      { body: "Yes — come by anytime." },
      seller.token,
    );
    const thread = (
      await request(
        "GET",
        `/api/leads/${lead}/messages`,
        undefined,
        buyer.token,
      )
    ).json().items;
    assert.equal(thread.length, 3);
    assert.equal(thread[0].body, "Can I view the car this weekend?");
    assert.equal(thread[0].senderId, buyer.user.id);
    assert.equal(thread[2].senderName, "Seller");
    // Buyer-side enquiry list + push token registration
    assert.equal(
      (await request("GET", "/api/me/enquiries", undefined, buyer.token)).json()
        .items.length,
      1,
    );
    assert.equal(
      (
        await request(
          "POST",
          "/api/me/push",
          { token: "ExponentPushToken[test]", platform: "expo" },
          buyer.token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/me/leads", undefined, other.token)).json()
        .items.length,
      0,
    );
    assert.equal(
      (await request("GET", "/api/me/leads", undefined, seller.token)).json()
        .items.length,
      1,
    );
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/me/leads/${lead}`,
          { status: "contacted" },
          other.token,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/me/leads/${lead}`,
          { status: "contacted" },
          seller.token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/admin/overview", undefined, admin)).json()
        .leads,
      1,
    );
    assert.ok(
      (await request("GET", "/api/admin/audit", undefined, admin)).json().items
        .length >= 2,
    );
    assert.equal(
      (await request("GET", "/api/me/export", undefined, buyer.token)).json()
        .enquiries.length,
      1,
    );
    assert.equal(
      (
        await request(
          "DELETE",
          `/api/uploads/${url.split("/").pop()!.replace(".webp", "")}`,
          undefined,
          seller.token,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await request("PATCH", `/api/listings/${id}`, b, seller.token))
        .statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/listings")).json().total,
      0,
      "Edits require moderation again",
    );
    await request(
      "PATCH",
      `/api/admin/listings/${id}`,
      { status: "published" },
      admin,
    );
    await request("POST", `/api/listings/${id}/sold`, {}, seller.token);
    assert.equal((await request("GET", "/api/listings")).json().total, 0);
    assert.equal(
      (
        await request("GET", "/api/me/favourites", undefined, buyer.token)
      ).json().items.length,
      0,
    );
    await app.close();
    ({ app, db } = await buildApp({ dataDir: dir, logger: false }));
    assert.equal(
      (await request("GET", "/api/me/listings", undefined, seller.token)).json()
        .items[0].status,
      "sold",
      "Data and sessions survive restart",
    );
    assert.equal(
      (await request("DELETE", "/api/me", { password: "wrong" }, buyer.token))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await request(
          "DELETE",
          "/api/me",
          { password: "A secure test password 2026" },
          buyer.token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/auth/me", undefined, buyer.token)).statusCode,
      401,
    );
    assert.equal(
      db.prepare("SELECT buyer_id FROM leads WHERE id=?").get(lead)?.buyer_id,
      null,
    );
    assert.equal(
      (await request("POST", "/api/auth/logout", {}, seller.token)).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/auth/me", undefined, seller.token))
        .statusCode,
      401,
    );
    assert.equal(
      (await request("DELETE", `/api/listings/${id}`, undefined, admin))
        .statusCode,
      200,
    );
    assert.equal(
      (await request("GET", url)).statusCode,
      404,
      "Deleting the last listing releases its photos",
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("finance handles zero interest and balloon without negative payments", () => {
  assert.equal(payment(120000, 0, 0, 12), 10000);
  assert.equal(payment(120000, 120000, 12, 72), 0);
  assert.equal(payment(120000, 0, 0, 12, 20), 8000);
  assert.ok(Math.abs(payment(350000) - 6801) < 100);
});

test("verification, recovery, single-use tokens and browser session protections", async () => {
  const { app, db } = await buildApp({ dataDir: ":memory:", logger: false });
  try {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        name: "Account owner",
        email: "recovery@example.com",
        password: "Original password 2026",
        consent: true,
      },
    });
    assert.equal(register.statusCode, 201);
    assert.equal(
      register.json().token,
      undefined,
      "Browser sessions never return bearer tokens",
    );
    const cookie = String(register.headers["set-cookie"]).split(";")[0];
    assert.match(String(register.headers["set-cookie"]), /HttpOnly/);
    const id = register.json().user.id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { cookie },
        })
      ).statusCode,
      403,
      "Cookie writes need Origin",
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie },
        })
      ).statusCode,
      200,
    );
    const verify = newToken();
    db.prepare("INSERT INTO tokens VALUES(?,?,?,?)").run(
      hashToken(verify),
      id,
      "verify",
      Date.now() + 60000,
    );
    const post = (url: string, payload: any) =>
      app.inject({
        method: "POST",
        url: "/api" + url,
        headers: { origin },
        payload,
      });
    assert.equal(
      (await post("/auth/verify", { token: verify })).statusCode,
      200,
    );
    assert.equal(
      (await post("/auth/verify", { token: verify })).statusCode,
      400,
    );
    const reset = newToken();
    db.prepare("INSERT INTO tokens VALUES(?,?,?,?)").run(
      hashToken(reset),
      id,
      "reset",
      Date.now() + 60000,
    );
    const resets = await Promise.all([
      post("/auth/reset", {
        token: reset,
        password: "Replacement password one 2026",
      }),
      post("/auth/reset", {
        token: reset,
        password: "Replacement password two 2026",
      }),
    ]);
    assert.deepEqual(
      resets.map((r) => r.statusCode).sort(),
      [200, 400],
      "A reset token cannot be replayed concurrently",
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie },
        })
      ).statusCode,
      401,
      "Password reset revokes all sessions",
    );
    assert.equal(
      (
        await post("/auth/login", {
          email: "recovery@example.com",
          password: "Original password 2026",
        })
      ).statusCode,
      401,
    );
    const expired = newToken();
    db.prepare("INSERT INTO tokens VALUES(?,?,?,?)").run(
      hashToken(expired),
      id,
      "reset",
      Date.now() - 1,
    );
    assert.equal(
      (
        await post("/auth/reset", {
          token: expired,
          password: "Replacement password three 2026",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/listings?minPrice=" + "9".repeat(30),
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

test("production refuses an incomplete environment", async () => {
  const old = process.env.NODE_ENV,
    oldSmtp = process.env.SMTP_URL;
  process.env.NODE_ENV = "production";
  delete process.env.SMTP_URL;
  try {
    await assert.rejects(
      buildApp({ dataDir: ":memory:", logger: false }),
      /Production requires/,
    );
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
    if (oldSmtp === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = oldSmtp;
  }
});

test("built web serving emits safe vehicle metadata, sitemap and genuine API errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocars-web-test-"));
  await writeFile(
    join(root, "index.html"),
    '<html><head><title>AutoCars</title></head><body><div id="root"></div></body></html>',
  );
  const { app, db } = await buildApp({
    dataDir: ":memory:",
    logger: false,
    webRoot: root,
  });
  try {
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
      "seo-owner",
      "Owner",
      "owner@example.com",
      "unused",
      "user",
      1,
      new Date().toISOString(),
    );
    const car = {
      make: "Toyota <script>",
      model: "Cross",
      variant: "XR",
      year: 2023,
      price: 350000,
      mileage: 45000,
      transmission: "Automatic",
      city: "Cape Town",
      province: "Western Cape",
      images: ["/uploads/123.webp"],
    };
    db.prepare("INSERT INTO listings VALUES(?,?,?,?,?,?,?)").run(
      "seo-car",
      "seo-owner",
      "published",
      0,
      JSON.stringify(car),
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const html = await app.inject("/cars/seo-car");
    assert.equal(html.statusCode, 200);
    assert.match(html.body, /<title>2023 Toyota &lt;script&gt; Cross/);
    const structured = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/.exec(
        html.body,
      )![1],
    );
    assert.match(structured.name, /Toyota <script>/);
    assert.equal(structured.offers.price, 350000);
    assert.match((await app.inject("/sitemap.xml")).body, /cars\/seo-car/);
    assert.match((await app.inject("/robots.txt")).body, /Disallow: \/account/);
    const missing = await app.inject("/api/missing");
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().message, "Not found.");
    assert.match((await app.inject("/garage")).body, /<div id="root">/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("business accounts apply, stay gated until terms are agreed, then can sell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autocars-biz-"));
  const { app, db } = await buildApp({ dataDir: dir, logger: false });
  const request = async (
    method: string,
    url: string,
    payload?: any,
    token?: string,
  ) =>
    app.inject({
      method: method as any,
      url,
      payload,
      headers: {
        origin,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  try {
    const register = async (payload: any) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin, "x-client": "mobile" },
        payload,
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json();
    };
    const business = await register({
      name: "Dealer",
      email: "dealer@example.com",
      password: "A secure test password 2026",
      consent: true,
      accountType: "business",
      business: {
        businessName: "Dealer Motors",
        registrationNumber: "2020/123/07",
        contactName: "Sam Dealer",
        phone: "0115550100",
        province: "Gauteng",
        city: "Pretoria",
        website: "",
        message: "Family dealership",
        contactConsent: true,
      },
    });
    assert.equal(business.user.accountType, "business");
    assert.equal(business.user.businessStatus, "pending");
    const customer = await register({
      name: "Customer",
      email: "customer@example.com",
      password: "A secure test password 2026",
      consent: true,
    });
    assert.equal(customer.user.accountType, "customer");
    assert.equal(customer.user.businessStatus, null);
    const mine = await request(
      "GET",
      "/api/me/business",
      undefined,
      business.token,
    );
    assert.equal(mine.json().application.status, "pending");
    assert.equal(mine.json().application.businessName, "Dealer Motors");
    assert.equal(
      (
        await request(
          "POST",
          "/api/me/business",
          {
            businessName: "Dealer Motors",
            contactName: "Sam Dealer",
            phone: "0115550100",
            province: "Gauteng",
            city: "Pretoria",
            contactConsent: true,
          },
          customer.token,
        )
      ).statusCode,
      403,
      "Customer accounts cannot hold business applications",
    );
    const adminId = randomUUID();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
      adminId,
      "Admin",
      "biz-admin@example.com",
      await hashPassword("A secure admin password 2026"),
      "admin",
      1,
      new Date().toISOString(),
    );
    const admin = (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin, "x-client": "mobile" },
        payload: {
          email: "biz-admin@example.com",
          password: "A secure admin password 2026",
        },
      })
    ).json().token;
    const applications = await request(
      "GET",
      "/api/admin/businesses",
      undefined,
      admin,
    );
    assert.equal(applications.json().items.length, 1);
    const applicationId = applications.json().items[0].id;
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/admin/businesses/${applicationId}`,
          {
            status: "active",
            note: "Terms agreed offline.",
            agreementReference: "",
            termsConfirmed: true,
          },
          admin,
        )
      ).statusCode,
      400,
      "Activation requires a recorded agreement reference",
    );
    assert.equal(
      (
        await request(
          "PATCH",
          `/api/admin/businesses/${applicationId}`,
          { status: "active", note: "ok", agreementReference: "x" },
          admin,
        )
      ).statusCode,
      400,
      "Activation requires confirmed terms",
    );
    const image = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#abc" },
    })
      .jpeg()
      .toBuffer();
    const boundary = "BIZBOUNDARY";
    const uploadBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="car.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const pendingUpload = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        origin,
        authorization: `Bearer ${business.token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: uploadBody,
    });
    assert.equal(
      pendingUpload.statusCode,
      403,
      "Business uploads are gated until activation",
    );
    const activated = await request(
      "PATCH",
      `/api/admin/businesses/${applicationId}`,
      {
        status: "active",
        note: "Dealer agreement AC-2026-001 signed.",
        agreementReference: "AC-2026-001",
        termsConfirmed: true,
      },
      admin,
    );
    assert.equal(activated.statusCode, 200, activated.body);
    assert.equal(
      activated.json().application.agreementReference,
      "AC-2026-001",
    );
    assert.equal(
      (await request("GET", "/api/auth/me", undefined, business.token)).json()
        .user.businessStatus,
      "active",
    );
    const upload = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        origin,
        authorization: `Bearer ${business.token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: uploadBody,
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const suspended = await request(
      "PATCH",
      `/api/admin/businesses/${applicationId}`,
      {
        status: "suspended",
        note: "Agreement paused pending review.",
        agreementReference: "AC-2026-001",
      },
      admin,
    );
    assert.equal(suspended.statusCode, 200, suspended.body);
    assert.equal(
      (await request("GET", "/api/auth/me", undefined, business.token)).json()
        .user.businessStatus,
      "suspended",
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("live hub delivers public catalogue changes and private account topics", async () => {
  const { LiveHub } = await import("../src/live");
  const inboxes = new Map<any, any[]>();
  const socket = (key: string) => {
    const messages: any[] = [];
    inboxes.set(key, messages);
    return {
      readyState: 1,
      bufferedAmount: 0,
      send: (d: string) => messages.push(JSON.parse(d)),
      on: () => {},
      ping: () => {},
      close: () => {},
      terminate: () => {},
    } as any;
  };
  const hub = new LiveHub((session) =>
    session === "user-token"
      ? { id: "u1", role: "user" }
      : session === "admin-token"
        ? { id: "a1", role: "admin" }
        : undefined,
  );
  try {
    hub.add(socket("anon"));
    hub.add(socket("user"), "user-token");
    hub.add(socket("admin"), "admin-token");
    hub.publish({ public: true, users: ["u1"], admin: true });
    assert.deepEqual(
      inboxes.get("anon")!.filter((m) => m.type === "changed"),
      [{ type: "changed", topics: ["catalogue"] }],
    );
    const userChange = inboxes
      .get("user")!
      .filter((m) => m.type === "changed")
      .at(-1);
    assert.deepEqual(userChange.topics.sort(), [
      "account",
      "businesses",
      "catalogue",
      "enquiries",
      "garage",
      "inventory",
      "notifications",
    ]);
    const adminChange = inboxes
      .get("admin")!
      .filter((m) => m.type === "changed")
      .at(-1);
    assert.ok(adminChange.topics.includes("admin"));
    inboxes.get("user")!.length = 0;
    inboxes.get("admin")!.length = 0;
    inboxes.get("anon")!.length = 0;
    hub.publish({ users: ["u1"] });
    assert.deepEqual(
      inboxes.get("user")!.filter((m) => m.type === "changed"),
      [
        {
          type: "changed",
          topics: [
            "account",
            "inventory",
            "enquiries",
            "garage",
            "businesses",
            "notifications",
          ],
        },
      ],
    );
    assert.equal(
      inboxes.get("anon")!.filter((m) => m.type === "changed").length,
      0,
      "Private changes are not broadcast to anonymous clients",
    );
    assert.equal(
      inboxes.get("admin")!.filter((m) => m.type === "changed").length,
      0,
      "Other users' private changes are not broadcast to admins",
    );
  } finally {
    hub.close();
  }
});

test("native clients may write without an Origin header while browsers cannot", async () => {
  const { app } = await buildApp({ dataDir: ":memory:", logger: false });
  try {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        name: "Web User",
        email: "web@example.com",
        password: "A secure test password 2026",
        consent: true,
      },
    });
    assert.equal(register.statusCode, 201, register.body);
    const cookie = String(register.headers["set-cookie"]).split(";")[0];
    const browserStyle = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });
    assert.equal(browserStyle.statusCode, 403);
    assert.match(browserStyle.json().message, /Origin header/);
    const native = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie, "x-client": "mobile" },
    });
    assert.equal(native.statusCode, 200, native.body);
  } finally {
    await app.close();
  }
});
