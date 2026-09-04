// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { retainUndurableFileChanges } from "../src/lib/fileChangeReconciliation";

const change = (id: string, checkpointId = `${id}-checkpoint`) => ({
  id,
  checkpoint_id: checkpointId,
});

describe("file change reconciliation", () => {
  test("keeps live changes until the durable query returns the same records", () => {
    const live = [change("first"), change("second")];

    expect(retainUndurableFileChanges(live, [], new Set(["first"]), new Set())).toEqual(live);
    expect(
      retainUndurableFileChanges(
        live,
        [change("first")],
        new Set(["first"]),
        new Set(["first-checkpoint"]),
      ),
    ).toEqual([change("second")]);
  });

  test("keeps live changes while their durable checkpoint is not projected yet", () => {
    const live = [change("first", "temporary-checkpoint")];
    const durable = [change("first", "terminal-checkpoint")];

    expect(
      retainUndurableFileChanges(
        live,
        durable,
        new Set(["first"]),
        new Set(["previous-checkpoint"]),
      ),
    ).toEqual(live);
    expect(
      retainUndurableFileChanges(
        live,
        durable,
        new Set(["first"]),
        new Set(["terminal-checkpoint"]),
      ),
    ).toEqual([]);
  });

  test("does not clear file changes created by a later queued turn", () => {
    const live = [change("finished"), change("later")];
    expect(
      retainUndurableFileChanges(
        live,
        [change("finished"), change("later")],
        new Set(["finished"]),
        new Set(["finished-checkpoint", "later-checkpoint"]),
      ),
    ).toEqual([change("later")]);
  });
});
