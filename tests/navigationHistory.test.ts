// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  createNavigationHistory,
  moveNavigationHistory,
  recordNavigationLocation,
  removeNavigationLocations,
  type AppNavigationLocation,
} from "../src/lib/navigationHistory";

const location = (
  surface: AppNavigationLocation["surface"],
  conversationId: string | null,
): AppNavigationLocation => ({
  workspacePath: "C:\\workspace",
  surface,
  conversationId,
  roleKey: "openagent",
});

describe("application navigation history", () => {
  test("moves backward and forward through recorded destinations", () => {
    let history = createNavigationHistory();
    history = recordNavigationLocation(history, location("chat", "one"));
    history = recordNavigationLocation(history, location("settings", "one"));
    history = recordNavigationLocation(history, location("chat", "two"));

    const backward = moveNavigationHistory(history, -1);
    expect(backward?.location).toEqual(location("settings", "one"));

    const forward = backward && moveNavigationHistory(backward.history, 1);
    expect(forward?.location).toEqual(location("chat", "two"));
  });

  test("does not record the same destination twice", () => {
    const first = recordNavigationLocation(createNavigationHistory(), location("chat", "one"));
    expect(recordNavigationLocation(first, location("chat", "one"))).toBe(first);
  });

  test("drops the forward branch after a new navigation", () => {
    let history = createNavigationHistory();
    history = recordNavigationLocation(history, location("chat", "one"));
    history = recordNavigationLocation(history, location("settings", "one"));
    history = recordNavigationLocation(history, location("chat", "two"));

    const backward = moveNavigationHistory(history, -1);
    expect(backward).not.toBeNull();
    history = recordNavigationLocation(backward!.history, location("memory", "one"));

    expect(history.entries).toEqual([
      location("chat", "one"),
      location("settings", "one"),
      location("memory", "one"),
    ]);
    expect(moveNavigationHistory(history, 1)).toBeNull();
  });

  test("removes destinations whose conversations no longer exist", () => {
    let history = createNavigationHistory();
    history = recordNavigationLocation(history, location("chat", "one"));
    history = recordNavigationLocation(history, location("settings", "one"));
    history = recordNavigationLocation(history, location("chat", "two"));

    history = removeNavigationLocations(history, (entry) => entry.conversationId === "one");

    expect(history).toEqual({ entries: [location("chat", "two")], index: 0 });
  });
});
