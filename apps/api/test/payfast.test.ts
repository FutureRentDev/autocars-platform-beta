import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutFields,
  payfastSignature,
  verifyPayfast,
} from "../src/payfast";
const config = {
  merchantId: "10000100",
  merchantKey: "merchant-key",
  passphrase: "secret phrase",
  origin: "https://autocars.test",
  sandbox: true,
};
test("hosted checkout signs the fixed server amount and does not send the passphrase to the client", () => {
  const c = checkoutFields(
    config,
    "order-id",
    { name: "Car Owner", email: "owner@example.com" },
    500,
    "Advertisement",
  );
  assert.equal(c.action, "https://sandbox.payfast.co.za/eng/process");
  assert.equal(c.fields.amount, "500.00");
  assert.equal(
    c.fields.notify_url,
    "https://autocars.test/api/payments/payfast/itn",
  );
  assert.equal(
    c.fields.signature,
    payfastSignature(Object.entries(c.fields), config.passphrase, false),
  );
  assert.equal(JSON.stringify(c).includes(config.passphrase), false);
});
test("payment notifications require valid signature, merchant and server confirmation; duplicate fields are rejected", async () => {
  const fields = {
    merchant_id: config.merchantId,
    m_payment_id: "order-id",
    pf_payment_id: "transaction-1",
    amount_gross: "500.00",
    payment_status: "COMPLETE",
  };
  const raw = new URLSearchParams({
    ...fields,
    signature: payfastSignature(Object.entries(fields), config.passphrase),
  }).toString();
  assert.equal(
    (await verifyPayfast(raw, "127.0.0.1", config, async () => true))
      .payment_status,
    "COMPLETE",
  );
  await assert.rejects(
    verifyPayfast(
      raw.replace("500.00", "5.00"),
      "127.0.0.1",
      config,
      async () => true,
    ),
    /signature/,
  );
  await assert.rejects(
    verifyPayfast(raw, "127.0.0.1", config, async () => false),
    /confirmation/,
  );
  await assert.rejects(
    verifyPayfast(
      raw + "&m_payment_id=other",
      "127.0.0.1",
      config,
      async () => true,
    ),
    /Duplicate/,
  );
  await assert.rejects(
    verifyPayfast(
      raw,
      "127.0.0.1",
      { ...config, merchantId: "other" },
      async () => true,
    ),
    /merchant/,
  );
});
