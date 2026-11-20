import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nativeTextViolations } from "../native-text.mjs";

test("native screens contain no raw text nodes outside text containers, including fragments", () => {
  const source = readFileSync(
    new URL("../../apps/mobile/App.tsx", import.meta.url),
    "utf8",
  );
  assert.deepEqual(nativeTextViolations(source), []);
});
test("native text check catches stray fragment spaces without rejecting Text and text wrappers", () => {
  assert.equal(nativeTextViolations('<View><>{" "}</></View>').length, 1);
  assert.equal(nativeTextViolations("<View>Unexpected text</View>").length, 1);
  assert.deepEqual(
    nativeTextViolations(
      '<View><Text><>{" "}Label</></Text><Button>Save</Button></View>',
    ),
    [],
  );
  assert.deepEqual(
    nativeTextViolations("<View><TextInput maxLength={2000} /></View>"),
    [],
  );
});
