import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
// Imports corrected staging records through the real API. Credentials never go in a file.
const file = resolve(process.argv[2] || "migration/legacy-inventory.json");
const input = JSON.parse(await readFile(file, "utf8"));
const base = process.env.IMPORT_API_URL || "http://localhost:4000";
if (!/^https?:\/\//.test(base))
  throw new Error("IMPORT_API_URL must be HTTP(S).");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = await rl.question("Owner account email: ");
console.log("Password input is visible in this terminal.");
const password = await rl.question("Owner account password: ");
rl.close();
async function request(path, method = "GET", body, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : { "X-Client": "mobile" };
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(base + "/api" + path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message);
  return data;
}
const { token } = await request("/auth/login", "POST", { email, password });
const receiptFile = resolve(file + ".receipts.json");
let receipts = [];
try {
  receipts = JSON.parse(await readFile(receiptFile, "utf8"));
} catch {}
try {
  for (const v of input.vehicles) {
    if (receipts.some((r) => r.sourceId === v.sourceId)) {
      console.log(`Skipping previously imported ${v.sourceId}`);
      continue;
    }
    if (
      !v.required ||
      Object.values(v.required).some((value) => value === null || value === "")
    ) {
      console.log(
        `Skipping ${v.sourceId}: fill all required fields and resolve source warnings first.`,
      );
      continue;
    }
    if (!v.imageUrls?.length) {
      console.log(`Skipping ${v.sourceId}: no photos.`);
      continue;
    }
    const images = [];
    try {
      for (const url of v.imageUrls.slice(0, 12)) {
        const parsed = new URL(url);
        if (
          parsed.protocol !== "https:" ||
          parsed.hostname !== "storage-autocars.ams1.vultrobjects.com"
        )
          throw new Error(
            "Only the known AutoCars source photo host is accepted.",
          );
        const r = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw new Error(`Photo download failed: ${r.status}`);
        if (Number(r.headers.get("content-length")) > 8 * 1024 * 1024)
          throw new Error("Source photo exceeds 8 MB.");
        const blob = await r.blob();
        if (blob.size > 8 * 1024 * 1024)
          throw new Error("Source photo exceeds 8 MB.");
        const fd = new FormData();
        fd.append("file", blob, "car.jpg");
        images.push((await request("/uploads", "POST", fd, token)).url);
      }
      const b = {
        ...v.required,
        year: Number(v.required.year),
        variant: v.variant || "",
        price: Number(v.price),
        mileage: Number(v.mileage),
        fuel: v.fuel,
        transmission: v.transmission,
        images,
      };
      const created = await request("/listings", "POST", b, token);
      receipts.push({
        sourceId: v.sourceId,
        listingId: created.listing.id,
        importedAt: new Date().toISOString(),
      });
      await writeFile(receiptFile, JSON.stringify(receipts, null, 2) + "\n");
      console.log(
        `Imported ${v.sourceId} as ${created.listing.id} (pending review; ${images.length} photos).`,
      );
    } catch (e) {
      for (const image of images)
        await request(
          "/uploads/" + image.split("/").pop().replace(".webp", ""),
          "DELETE",
          undefined,
          token,
        ).catch(() => {});
      console.error(`Could not import ${v.sourceId}: ${e.message}`);
    }
  }
} finally {
  await request("/auth/logout", "POST", {}, token);
}
