// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { LatestRequest } from "../src/lib/latestRequest";

describe("LatestRequest", () => {
  test("ignores an older request that resolves after a newer request", async () => {
    let resolveOlder!: (value: string) => void;
    const older = new Promise<string>((resolve) => (resolveOlder = resolve));
    const requests = new LatestRequest();

    const olderResult = requests.resolve(() => older);
    const newerResult = requests.resolve(async () => "newer");

    expect(await newerResult).toBe("newer");
    resolveOlder("older");
    expect(await olderResult).toBeUndefined();
  });

  test("invalidates an in-flight request when an authoritative value is applied", async () => {
    let resolvePending!: (value: string) => void;
    const pending = new Promise<string>((resolve) => (resolvePending = resolve));
    const requests = new LatestRequest();

    const result = requests.resolve(() => pending);
    requests.invalidate();
    resolvePending("stale");

    expect(await result).toBeUndefined();
  });

  test("suppresses stale failures without hiding the latest failure", async () => {
    let rejectOlder!: (error: Error) => void;
    const older = new Promise<string>((_, reject) => (rejectOlder = reject));
    const requests = new LatestRequest();

    const olderResult = requests.resolve(() => older);
    expect(await requests.resolve(async () => "newer")).toBe("newer");
    rejectOlder(new Error("stale"));
    expect(await olderResult).toBeUndefined();

    await expect(requests.resolve(async () => Promise.reject(new Error("latest")))).rejects.toThrow(
      "latest",
    );
  });
});
