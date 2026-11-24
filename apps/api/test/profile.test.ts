import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildApp } from "../src/app";
import { hashPassword, hashToken, newToken } from "../src/auth";

test("profiles persist, enforce ownership, and safely replace, back up and delete avatars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autocars-profile-"));
  const backupParent = await mkdtemp(
    join(tmpdir(), "autocars-profile-backup-"),
  );
  let platform = await buildApp({ dataDir: dir, logger: false });
  const password = "A strong profile test password";
  const create = async (accountType: "customer" | "business") => {
    const id = randomUUID(),
      token = newToken();
    platform.db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)")
      .run(
        id,
        "Original name",
        `${id}@example.com`,
        await hashPassword(password),
        "user",
        1,
        new Date().toISOString(),
      );
    platform.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hashToken(token), id, Date.now() + 3600000);
    platform.db
      .prepare("INSERT INTO account_profiles VALUES(?,?)")
      .run(id, accountType);
    return { id, token };
  };
  const request = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    token?: string,
    payload?: unknown,
  ) =>
    platform.app.inject({
      method,
      url,
      headers: {
        origin: "http://localhost:5173",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: payload as any,
    });
  const photo = async (
    token: string | undefined,
    buffer: Buffer,
    mime = "image/jpeg",
  ) => {
    const boundary = `profile-${randomUUID()}`;
    return platform.app.inject({
      method: "POST",
      url: "/api/me/avatar",
      headers: {
        origin: "http://localhost:5173",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="profile.jpg"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
  };
  try {
    const owner = await create("customer"),
      other = await create("business");
    assert.equal(
      (await request("PATCH", "/api/me/profile", undefined, { name: "Nobody" }))
        .statusCode,
      401,
    );
    assert.equal(
      (await request("GET", "/api/auth/me", owner.token)).json().user.avatarUrl,
      "",
    );
    const changes: any[] = [];
    const publish = platform.live.publish.bind(platform.live);
    platform.live.publish = (change) => {
      changes.push(change);
      publish(change);
    };
    const patch = await request("PATCH", "/api/me/profile", owner.token, {
      name: "Updated owner",
      phone: "+27 82 123 4567",
      city: "Cape Town",
      province: "Western Cape",
    });
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal(patch.json().user.name, "Updated owner");
    assert.equal(patch.json().user.verified, true);
    assert.ok(
      changes.some(
        (change) =>
          change.users.includes(owner.id) &&
          !change.users.includes(other.id) &&
          change.admin,
      ),
    );
    assert.equal(
      (await request("GET", "/api/auth/me", other.token)).json().user.name,
      "Original name",
    );
    for (const payload of [
      { role: "admin" },
      { email: "changed@example.com" },
      { avatarUrl: "/avatars/foreign.webp" },
      { userId: other.id, name: "Wrong user" },
    ]) {
      assert.equal(
        (await request("PATCH", "/api/me/profile", owner.token, payload))
          .statusCode,
        400,
      );
    }
    const invalid = await request("PATCH", "/api/me/profile", owner.token, {
      name: "",
      phone: "abc",
    });
    assert.equal(invalid.statusCode, 400);
    assert.ok(invalid.json().fieldErrors.name);
    assert.ok(invalid.json().fieldErrors.phone);
    const image = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "#ddd" },
    })
      .jpeg()
      .toBuffer();
    assert.equal((await photo(undefined, image)).statusCode, 401);
    assert.equal(
      (await photo(owner.token, Buffer.from("invalid image"))).statusCode,
      400,
    );
    assert.equal(
      (await photo(owner.token, image, "image/svg+xml")).statusCode,
      400,
    );
    const first = await photo(owner.token, image);
    assert.equal(first.statusCode, 200, first.body);
    const firstUrl = first.json().user.avatarUrl;
    assert.match(firstUrl, /^\/avatars\/[a-f\d-]+\.webp$/);
    const publicPhoto = await request("GET", firstUrl);
    assert.equal(publicPhoto.statusCode, 200);
    const metadata = await sharp(publicPhoto.rawPayload).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    const otherPhoto = await photo(other.token, image);
    assert.equal(
      otherPhoto.statusCode,
      200,
      "Pending business accounts may also set a profile photo",
    );
    const replacement = await photo(owner.token, image);
    assert.equal(replacement.statusCode, 200);
    const avatarUrl = replacement.json().user.avatarUrl;
    assert.notEqual(avatarUrl, firstUrl);
    await assert.rejects(readFile(join(dir, firstUrl)), { code: "ENOENT" });
    assert.equal(
      (await request("GET", otherPhoto.json().user.avatarUrl)).statusCode,
      200,
    );
    assert.equal(
      (
        await request("PATCH", "/api/me/profile", owner.token, {
          city: "Stellenbosch",
        })
      ).json().user.avatarUrl,
      avatarUrl,
    );
    const backupDir = join(backupParent, "snapshot");
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("../src/backup.ts", import.meta.url)),
        backupDir,
      ],
      { env: { ...process.env, DATA_DIR: dir }, stdio: "pipe" },
    );
    assert.deepEqual(
      await readFile(join(backupDir, avatarUrl)),
      await readFile(join(dir, avatarUrl)),
    );
    await platform.app.close();
    platform = await buildApp({ dataDir: dir, logger: false });
    const persisted = (await request("GET", "/api/auth/me", owner.token)).json()
      .user;
    assert.equal(persisted.name, "Updated owner");
    assert.equal(persisted.phone, "+27 82 123 4567");
    assert.equal(persisted.city, "Stellenbosch");
    assert.equal(persisted.avatarUrl, avatarUrl);
    assert.equal(
      (await request("DELETE", "/api/me/avatar", other.token)).json().user
        .avatarUrl,
      "",
    );
    assert.equal(
      (await request("GET", avatarUrl)).statusCode,
      200,
      "Removing another account's photo must not affect the owner",
    );
    assert.equal(
      (await request("DELETE", "/api/me", owner.token, { password }))
        .statusCode,
      200,
    );
    await assert.rejects(readFile(join(dir, avatarUrl)), { code: "ENOENT" });
    assert.equal(
      platform.db
        .prepare("SELECT * FROM user_details WHERE user_id=?")
        .get(owner.id),
      undefined,
    );
    assert.equal(
      (await request("GET", "/api/auth/me", owner.token)).statusCode,
      401,
    );
  } finally {
    await platform.app.close();
    await rm(dir, { recursive: true, force: true });
    await rm(backupParent, { recursive: true, force: true });
  }
});
