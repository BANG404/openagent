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
  settingsDestination: string | null = null,
): AppNavigationLocation => ({
  workspacePath: "C:\\workspace",
  surface,
  conversationId,
  roleKey: "openagent",
  settingsDestination,
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

  test("records each in-window management surface as its own destination", () => {
    let history = createNavigationHistory();
    history = recordNavigationLocation(history, location("chat", "one"));
    history = recordNavigationLocation(
      history,
      location("settings", "one", "models\u0000providers"),
    );
    history = recordNavigationLocation(
      history,
      location("settings", "one", "integrations\u0000channels"),
    );
    expect(history.entries).toHaveLength(3);

    const backward = moveNavigationHistory(history, -1);
    expect(backward?.location.settingsDestination).toBe("models\u0000providers");

    const forward = backward && moveNavigationHistory(backward.history, 1);
    expect(forward?.location.settingsDestination).toBe("integrations\u0000channels");
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
    history = recordNavigationLocation(backward!.history, location("chat", "three"));

    expect(history.entries).toEqual([
      location("chat", "one"),
      location("settings", "one"),
      location("chat", "three"),
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
