import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationRoute } from "@autocars/core";

test("push routes identify exact conversations, listings, payments and workspace sections", () => {
  assert.deepEqual(notificationRoute("/chat/lead-123"), {
    kind: "chat",
    id: "lead-123",
  });
  assert.deepEqual(notificationRoute("/cars/car-456"), {
    kind: "listing",
    id: "car-456",
  });
  assert.deepEqual(notificationRoute("/payment?id=order-789"), {
    kind: "payment",
    id: "order-789",
  });
  assert.deepEqual(notificationRoute("/workspace?tab=business"), {
    kind: "workspace",
    tab: "business",
  });
  assert.deepEqual(notificationRoute("/workspace?tab=payments"), {
    kind: "workspace",
    tab: "payments",
  });
  assert.deepEqual(notificationRoute("/workspace"), {
    kind: "workspace",
    tab: "inventory",
  });
  assert.deepEqual(notificationRoute("/account"), { kind: "account" });
  assert.deepEqual(notificationRoute("/"), { kind: "home" });
});

test("push routes reject external, malformed and unknown destinations", () => {
  for (const path of [
    null,
    {},
    "https://evil.example/chat/123",
    "//evil.example",
    "/\\evil.example",
    "/chat/lead%2F123",
    "/chat/%00",
    "/chat/",
    "/chat/%",
    "/payment?id=",
    "/workspace?tab=invalid",
    "/does-not-exist",
  ]) {
    assert.equal(notificationRoute(path), null, String(path));
  }
});
