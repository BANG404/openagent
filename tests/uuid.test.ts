// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { randomUuid } from "../src/lib/uuid";

describe("randomUuid", () => {
  test("uses the native implementation when available", () => {
    const expected = "123e4567-e89b-42d3-a456-426614174000";
    const cryptoApi = {
      randomUUID: () => expected,
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => array,
    };

    expect(randomUuid(cryptoApi)).toBe(expected);
  });

  test("generates an RFC 4122 UUID v4 when randomUUID is unavailable", () => {
    const cryptoApi = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        if (array instanceof Uint8Array) {
          array.set([0, 1, 2, 3, 4, 5, 0xff, 7, 0xff, 9, 10, 11, 12, 13, 14, 15]);
        }
        return array;
      },
    };

    expect(randomUuid(cryptoApi)).toBe("00010203-0405-4f07-bf09-0a0b0c0d0e0f");
  });
});
