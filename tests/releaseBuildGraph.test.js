import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const frontend = readFileSync(
  new URL("../.github/workflows/build-frontend.yml", import.meta.url),
  "utf8",
);
/** @param {string} name */
function job(name) {
  return workflow.split(`\n  ${name}:\n`)[1]?.split(/\n {2}[a-z-]+:\n/)[0] ?? "";
}

test("cold helper builds start from the frozen Runtime source before SDK qualification finishes", () => {
  expect(job("distribution-helpers")).toContain("needs: [detect, sdk-plan, component-plan]");
  expect(job("distribution-helpers")).toContain("needs.sdk-plan.outputs.sdk_release_sha");
  expect(job("distribution-helpers")).not.toContain("needs.sdk-release");
  expect(job("sdk-release")).toContain("--plan-file sdk-release-plan.json");
});

test("shell compilation starts independently and packaging consumes its exact output", () => {
  const compile = job("shell-build");
  expect(compile).toContain("needs: [detect, frontend-build, component-plan]");
  expect(compile).not.toContain("sdk-release");
  expect(compile).not.toContain("distribution-resources");
  expect(compile).not.toContain("repository: BANG404/openagent-runtime");
  expect(compile).toContain("--no-bundle --config .github/tauri-prebuilt.conf.json");
  expect(compile).toContain("cache-targets: false");
  expect(job("build")).toContain("- shell-build");
  expect(job("build")).toContain("shell-restore");
  expect(job("build")).not.toContain("bun run tauri:build");
  expect(job("build")).not.toContain("tauri-apps/tauri-action");
});

test("one qualified frontend feeds signing and platforms and gates immutable tagging", () => {
  expect(frontend.match(/bun run build\n/g)).toHaveLength(1);
  expect(frontend).toContain("bun run build:bootstrap");
  expect(frontend).toContain("bun run check:bundle-size");
  expect(frontend).toContain("frontend-verify");
  expect(frontend).toContain("include-hidden-files: true");
  expect(frontend).toContain("actions/cache/restore@v4");
  expect(frontend).toContain("actions/cache/save@v4");
  expect(frontend).not.toContain("restore-keys: frontend");
  expect(job("frontend-components")).toContain("needs: [detect, frontend-build, component-plan]");
  expect(job("frontend-components")).not.toContain("bun run build");
  expect(job("tag")).toContain("needs.frontend-build.result == 'success'");
  expect(job("tag")).toContain("needs.qualify.result == 'success'");
  expect(job("tag")).toContain("needs.build.result == 'success'");
});

test("PR full coverage requires both test qualification and the separate production job", () => {
  const reporter = readFileSync(
    new URL("../.github/workflows/report-pr-head-ci.yml", import.meta.url),
    "utf8",
  );
  expect(reporter).toContain('job_succeeded "Frontend / Type and test"');
  expect(reporter).toContain(
    'job_succeeded "Frontend / Production assets / Build and qualify static assets"',
  );
  expect(reporter).not.toContain('step_succeeded "Frontend / Type and test" "Build frontend"');
});
