// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { decodeModelBinding, encodeModelBinding } from "../src/lib/modelBinding";

describe("model binding keys", () => {
  test("round-trips provider and model names without delimiter assumptions", () => {
    const encoded = encodeModelBinding("provider:local", "vendor/model:latest");
    expect(decodeModelBinding(encoded)).toEqual({
      providerId: "provider:local",
      model: "vendor/model:latest",
    });
  });

  test("rejects malformed or non-string tuples", () => {
    expect(decodeModelBinding("not-json")).toBeNull();
    expect(decodeModelBinding(JSON.stringify(["provider-only"]))).toBeNull();
    expect(decodeModelBinding(JSON.stringify([1, "model"]))).toBeNull();
  });
});
