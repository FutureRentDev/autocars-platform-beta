import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveClient } from "@autocars/core";

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test("live client avoids discarded mounts and closes pending handshakes gracefully", async () => {
  const original = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    closes = 0;
    constructor(_url: string) {
      sockets.push(this);
    }
    send(_data: string) {}
    close() {
      assert.notEqual(this.readyState, 0, "must not abort a pending handshake");
      this.closes++;
      this.readyState = 3;
      this.onclose?.();
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const statuses: string[] = [];
  const changes: string[][] = [];
  const client = new LiveClient(
    "http://localhost:5173",
    () => null,
    (topics) => changes.push(topics),
    (status) => statuses.push(status),
  );
  try {
    client.start();
    client.stop();
    client.start();
    await tick();
    assert.equal(sockets.length, 1, "discarded mount must not open a socket");
    const pending = sockets[0];
    client.reconnect();
    assert.equal(pending.closes, 0);
    pending.open();
    assert.equal(pending.closes, 1);
    await tick();
    assert.equal(sockets.length, 2);
    const current = sockets[1];
    current.open();
    current.onmessage?.({ data: JSON.stringify({ type: "ready" }) });
    assert.equal(statuses.at(-1), "live");
    client.stop();
    assert.equal(current.closes, 1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.deepEqual(
      changes,
      [],
      "stopped clients must not issue delayed refreshes",
    );
    assert.equal(
      sockets.length,
      2,
      "stale socket must not schedule a reconnect",
    );
  } finally {
    client.stop();
    globalThis.WebSocket = original;
  }
});
