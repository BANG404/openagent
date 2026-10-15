import { expect, test } from "bun:test";
import { assertPublicSdkEntries } from "./public-sdk-boundary.mjs";

const allowed = new Set(["sdk/typescript/src/client.ts"]);
/** @param {string} mode @param {string} file */
const entry = (mode, file) => `${mode} ${"a".repeat(40)} 0\t${file}`;

test("allows reviewed public SDK blobs and only a private Runtime gitlink", () => {
  expect(() =>
    assertPublicSdkEntries(
      [entry("100644", "sdk/typescript/src/client.ts"), entry("160000", "runtime")],
      allowed,
    ),
  ).not.toThrow();
});

test.each([
  ["100644", "sdk/rust/openagent-runtime/src/lib.rs"],
  ["100644", "runtime/rust/openagent-runtime/src/lib.rs"],
  ["120000", "sdk/typescript/src/client.ts"],
  ["160000", "sdk"],
])("rejects private source or indirect public source: %s %s", (mode, file) => {
  expect(() => assertPublicSdkEntries([entry(mode, file)], allowed)).toThrow(
    "Private source boundary rejected",
  );
});
