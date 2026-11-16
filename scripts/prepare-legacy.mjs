import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const source = "https://api.autocars.co.za/vehicles";
const response = await fetch(source);
if (!response.ok) throw new Error(`Inventory fetch failed: ${response.status}`);
const result = await response.json();
if (!Array.isArray(result.data))
  throw new Error("Unexpected inventory response.");
const report = {
  source,
  fetchedAt: new Date().toISOString(),
  note: "Read-only staging report. No records have been imported or published. Fill missing fields, resolve warnings and verify availability before importing.",
  vehicles: result.data
    .filter((v) => !v.is_deleted)
    .map((v) => {
      const titleYear = Number(/^\d{4}/.exec(v.title)?.[0]);
      const warnings = [
        "Seller details, province, city, body type and description are absent from the public source.",
      ];
      if (titleYear !== v.year)
        warnings.push(
          `Title year ${titleYear} conflicts with year field ${v.year}.`,
        );
      if (!(v.images || []).length) warnings.push("No source photos.");
      return {
        sourceId: v.id,
        title: v.title,
        sourceYear: v.year,
        titleYear,
        variant: v.variant,
        price: v.price,
        mileage: v.mileage,
        fuel: v.fuel,
        transmission: v.transmission,
        imageUrls: (v.images || []).map((i) => i.image_url),
        warnings,
        required: {
          make: null,
          model: null,
          year: null,
          bodyType: null,
          province: null,
          city: null,
          description: null,
          sellerName: null,
          phone: null,
        },
      };
    }),
};
const destination = resolve(import.meta.dirname, "../migration");
await mkdir(destination, { recursive: true });
await writeFile(
  resolve(destination, "legacy-inventory.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `Staged ${report.vehicles.length} public records in migration/legacy-inventory.json. No database changes.`,
);
