import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { BlockList } from "node:net";
import { resolve4 } from "node:dns/promises";
export type PayfastConfig = {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  origin: string;
  sandbox: boolean;
};
export function payfastConfig(): PayfastConfig | null {
  const {
    PAYFAST_MERCHANT_ID: id,
    PAYFAST_MERCHANT_KEY: key,
    PAYFAST_PASSPHRASE: phrase,
    PAYFAST_PUBLIC_ORIGIN: origin,
  } = process.env;
  if (!id || !key || !phrase || !origin) return null;
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("PAYFAST_PUBLIC_ORIGIN must be your public HTTPS origin.");
  return {
    merchantId: id,
    merchantKey: key,
    passphrase: phrase,
    origin: url.origin,
    sandbox: process.env.PAYFAST_SANDBOX === "true",
  };
}
const encode = (v: string) =>
  encodeURIComponent(v.trim())
    .replace(
      /[!'()*~]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    )
    .replace(/%20/g, "+");
export function payfastSignature(
  entries: [string, string][],
  passphrase: string,
  includeEmpty = true,
) {
  const query = entries
    .filter(([key, v]) => key !== "signature" && (includeEmpty || v !== ""))
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
  return createHash("md5")
    .update(query + `&passphrase=${encode(passphrase)}`)
    .digest("hex");
}
export function checkoutFields(
  config: PayfastConfig,
  id: string,
  user: { name: string; email: string },
  amount: number,
  item: string,
) {
  const fields: Record<string, string> = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: `${config.origin}/payment?id=${id}`,
    cancel_url: `${config.origin}/payment?id=${id}&cancelled=1`,
    notify_url: `${config.origin}/api/payments/payfast/itn`,
    name_first: user.name.slice(0, 100),
    email_address: user.email,
    m_payment_id: id,
    amount: amount.toFixed(2),
    item_name: item.slice(0, 100),
  };
  fields.signature = payfastSignature(
    Object.entries(fields),
    config.passphrase,
    false,
  );
  return {
    action: `https://${config.sandbox ? "sandbox" : "www"}.payfast.co.za/eng/process`,
    fields,
  };
}
const ips = new BlockList();
for (const [address, prefix] of [
  ["197.97.145.144", 28],
  ["41.74.179.192", 27],
  ["102.216.36.0", 28],
  ["102.216.36.128", 28],
] as const)
  ips.addSubnet(address, prefix, "ipv4");
for (const address of [
  "144.126.193.139",
  "13.245.74.88",
  ...Array.from({ length: 21 }, (_, i) => `3.163.${232 + i}.237`),
])
  ips.addAddress(address, "ipv4");
export async function allowedPayfastIp(ip: string, sandbox: boolean) {
  if (sandbox) return true;
  const address = ip.replace(/^::ffff:/, "");
  if (ips.check(address, "ipv4")) return true;
  const resolved = await Promise.all(
    ["www.payfast.co.za", "api.payfast.co.za", "payment.payfast.io"].map(
      (host) => resolve4(host).catch(() => []),
    ),
  );
  return resolved.flat().includes(address);
}
export async function verifyPayfast(
  raw: string,
  sourceIp: string,
  config: PayfastConfig,
  confirm: (body: string, url: string) => Promise<boolean> = async (
    body,
    url,
  ) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
    });
    return r.ok && (await r.text()).trim() === "VALID";
  },
) {
  const entries = [...new URLSearchParams(raw)];
  const fields = Object.fromEntries(entries);
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error("Duplicate payment notification fields.");
  const signature = fields.signature || "";
  const expected = payfastSignature(entries, config.passphrase);
  if (
    !/^[a-f0-9]{32}$/i.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected),
    )
  )
    throw new Error("Invalid payment signature.");
  if (fields.merchant_id !== config.merchantId)
    throw new Error("Payment merchant mismatch.");
  if (!(await allowedPayfastIp(sourceIp, config.sandbox)))
    throw new Error("Payment source is not permitted.");
  const body = entries
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
  if (
    !(await confirm(
      body,
      `https://${config.sandbox ? "sandbox" : "www"}.payfast.co.za/eng/query/validate`,
    ))
  )
    throw new Error("Payment confirmation failed.");
  return fields;
}
