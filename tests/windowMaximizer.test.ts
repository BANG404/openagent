import { describe, expect, test } from "bun:test";
import {
  createWindowMaximizer,
  type WindowGeometry,
  type WindowMaximizerTarget,
} from "$lib/windowMaximizer";

function createTarget(initial: WindowGeometry) {
  let maximized = false;
  let geometry = initial;
  const calls: string[] = [];
  const target: WindowMaximizerTarget = {
    isMaximized: async () => maximized,
    maximize: async () => {
      maximized = true;
      calls.push("maximize");
    },
    unmaximize: async () => {
      maximized = false;
      calls.push("unmaximize");
    },
    innerSize: async () => geometry.size,
    outerPosition: async () => geometry.position,
    setSize: async (size) => {
      geometry = { ...geometry, size: { width: size.width, height: size.height } };
      calls.push(`size:${size.width}x${size.height}`);
    },
    setPosition: async (position) => {
      geometry = { ...geometry, position: { x: position.x, y: position.y } };
      calls.push(`position:${position.x},${position.y}`);
    },
  };
  return {
    target,
    calls,
    getGeometry: () => geometry,
    setMaximized: (value: boolean) => (maximized = value),
  };
}

describe("window maximizer", () => {
  test("restores the captured normal geometry after maximizing", async () => {
    const fixture = createTarget({
      position: { x: 120, y: 80 },
      size: { width: 1180, height: 720 },
    });
    const maximizer = createWindowMaximizer(fixture.target);

    await maximizer.toggle();
    fixture.setMaximized(true);
    await maximizer.toggle();

    expect(fixture.getGeometry()).toEqual({
      position: { x: 120, y: 80 },
      size: { width: 1180, height: 720 },
    });
    expect(fixture.calls).toEqual(["maximize", "unmaximize", "size:1180x720", "position:120,80"]);
  });

  test("does not replace the normal geometry with maximized dimensions", async () => {
    const fixture = createTarget({
      position: { x: 20, y: 30 },
      size: { width: 1040, height: 600 },
    });
    const maximizer = createWindowMaximizer(fixture.target);

    await maximizer.toggle();
    await maximizer.toggle();

    expect(fixture.calls).toEqual(["maximize", "unmaximize", "size:1040x600", "position:20,30"]);
  });

  test("serializes repeated toggle requests", async () => {
    const fixture = createTarget({
      position: { x: 0, y: 0 },
      size: { width: 1040, height: 600 },
    });
    const maximizer = createWindowMaximizer(fixture.target);

    await Promise.all([maximizer.toggle(), maximizer.toggle()]);

    expect(fixture.calls).toEqual(["maximize"]);
  });
});
