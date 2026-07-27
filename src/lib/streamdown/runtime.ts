import type { Value } from "./parser";

/**
 * Evaluate a Value AST to a plain JS value.
 *
 * In P1 there is no reactive state — variable refs ($name) evaluate to undefined.
 * P2 will swap `state` in for the reactive store.
 */
export function evalValue(v: Value, state: Record<string, unknown> = {}): unknown {
  switch (v.kind) {
    case "string":
      return v.value;
    case "number":
      return v.value;
    case "bool":
      return v.value;
    case "null":
      return null;
    case "var":
      return state[v.name];
    case "array":
      return v.items.map((x) => evalValue(x, state));
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, val] of v.entries) out[k] = evalValue(val, state);
      return out;
    }
    case "component":
      // Returned as-is so the renderer can dispatch nested components.
      return v;
    case "binary": {
      const l = evalValue(v.left, state);
      const r = evalValue(v.right, state);
      // Mimic JS '+' semantics: string concat if either side is a string.
      if (typeof l === "string" || typeof r === "string") {
        return String(l ?? "") + String(r ?? "");
      }
      return (l as number) + (r as number);
    }
  }
}

/** Convenience: evaluate all args into a plain `{ name: value }` map. */
export function evalArgs(
  args: Array<[string, Value]>,
  state: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of args) out[k] = evalValue(v, state);
  return out;
}

/** A value is a nested component AST node — used by renderers to dispatch recursively. */
export function isComponentValue(v: unknown): v is Extract<Value, { kind: "component" }> {
  return typeof v === "object" && v !== null && (v as { kind?: string }).kind === "component";
}
