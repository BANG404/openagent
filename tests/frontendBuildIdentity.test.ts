import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import {
  FRONTEND_BUILD_DEFINE,
  frontendBuildIdentity,
  frontendBuildLabel,
  frontendProductVersion,
  frontendRevision,
} from "../scripts/frontend-build-identity.mjs";

const buildModule = readFileSync("src/lib/frontendBuild.ts", "utf8");
const viteConfig = readFileSync("vite.config.js", "utf8");

describe("frontend build identity", () => {
  test("labels a build with its product version and abbreviated revision", () => {
    expect(frontendBuildLabel({ version: "1.2.3", revision: "0123456789ab" })).toBe(
      "1.2.3+0123456789ab",
    );
    expect(frontendBuildLabel({ version: "1.2.3", revision: null })).toBe("1.2.3");
  });

  test("stamps the product version and revision of this checkout", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const identity = frontendBuildIdentity();
    expect(frontendProductVersion()).toBe(manifest.version);
    expect(identity.revision).toMatch(/^[0-9a-f]{12}$/);
    expect(identity.label).toBe(`${manifest.version}+${identity.revision}`);
  });

  test("still stamps a product version without a repository", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "openagent-frontend-build-"));
    try {
      expect(frontendRevision(directory)).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("stamps the running bundle through the Vite define", () => {
    expect(viteConfig).toContain("FRONTEND_BUILD_DEFINE");
    expect(viteConfig).toContain("frontendBuildIdentity().label");
    expect(buildModule).toContain(FRONTEND_BUILD_DEFINE);
    expect(FRONTEND_BUILD_DEFINE).toBe("__OPENAGENT_FRONTEND_BUILD__");
  });
});
