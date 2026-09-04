// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { retainUndurableFileChanges } from "../src/lib/fileChangeReconciliation";

const change = (id: string) => ({ id });

describe("file change reconciliation", () => {
  test("keeps live changes until the durable query returns the same records", () => {
    const live = [change("first"), change("second")];

    expect(retainUndurableFileChanges(live, [], new Set(["first"]))).toEqual(live);
    expect(retainUndurableFileChanges(live, [change("first")], new Set(["first"]))).toEqual([
      change("second"),
    ]);
  });

  test("does not clear file changes created by a later queued turn", () => {
    const live = [change("finished"), change("later")];
    expect(
      retainUndurableFileChanges(
        live,
        [change("finished"), change("later")],
        new Set(["finished"]),
      ),
    ).toEqual([change("later")]);
  });
});
