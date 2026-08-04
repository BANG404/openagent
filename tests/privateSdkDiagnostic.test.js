// @ts-nocheck -- Bun provides the test module at runtime.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPrivateCheckOutput,
  collectPrivateDiagnostic,
  redactSensitiveEnvironmentValues,
  reportPrivateSdkDiagnostic,
} from "../scripts/report-private-sdk-diagnostic.mjs";

const temporaryDirectories = [];

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-diagnostic-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("private SDK diagnostic reporting", () => {
  test("returns a generic diagnostic when no command log was recorded", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(collectPrivateDiagnostic(directory, {})).resolves.toEqual({
      diagnostic: "",
      truncated: false,
    });
  });

  test("collects only SDK logs and redacts sensitive environment values", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "sdk-rust-test.log"), "failure ghp_private");
    await writeFile(join(directory, "unrelated.log"), "must not appear");
    await writeFile(join(directory, "sdk-private-diagnostic-name"), "sdk-rust-test.log");

    const result = await collectPrivateDiagnostic(directory, {
      GH_TOKEN: "ghp_private",
    });

    expect(result).toEqual({
      diagnostic: "===== sdk-rust-test.log =====\nfailure [REDACTED]",
      truncated: false,
    });
  });

  test("keeps the tail when a diagnostic exceeds the private check limit", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "sdk-rust-test.log"), "first-middle-last");
    await writeFile(join(directory, "sdk-private-diagnostic-name"), "sdk-rust-test.log");

    const result = await collectPrivateDiagnostic(directory, {}, 4);

    expect(result).toEqual({ diagnostic: "last", truncated: true });
  });

  test("rejects a diagnostic pointer outside the runner temporary directory", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "sdk-private-diagnostic-name"), "../sdk-secret.log");

    await expect(collectPrivateDiagnostic(directory, {})).rejects.toThrow(
      "Private diagnostic log name is invalid.",
    );
  });

  test("escapes nested Markdown fences in private output", () => {
    const output = buildPrivateCheckOutput({
      diagnosticName: "Rust tests",
      diagnostic: "```private source```",
      truncated: false,
    });

    expect(output.title).toBe("Rust tests failed");
    expect(output.text).toContain("` ` `private source` ` `");
  });

  test("posts a failed check run on the private SDK commit", async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, "sdk-rust-clippy.log"), "clippy detail");
    await writeFile(join(directory, "sdk-private-diagnostic-name"), "sdk-rust-clippy.log");
    let request;

    await reportPrivateSdkDiagnostic({
      env: {
        GH_TOKEN: "private-token",
        RUNNER_TEMP: directory,
        SDK_DIAGNOSTIC_NAME: "Rust lint",
        SDK_REPOSITORY: "BANG404/openagent-sdk",
        SDK_SHA: "a".repeat(40),
        CI_RUN_URL: "https://github.com/BANG404/openagent/actions/runs/123",
      },
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, status: 201 };
      },
    });

    expect(request.url).toBe("https://api.github.com/repos/BANG404/openagent-sdk/check-runs");
    expect(request.options.headers.Authorization).toBe("Bearer private-token");
    expect(JSON.parse(request.options.body)).toMatchObject({
      name: "Public SDK diagnostics / Rust lint",
      head_sha: "a".repeat(40),
      conclusion: "failure",
      details_url: "https://github.com/BANG404/openagent/actions/runs/123",
      output: {
        title: "Rust lint failed",
        text: expect.stringContaining("clippy detail"),
      },
    });
  });

  test("reports a safe GitHub API reason when private delivery fails", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(
      reportPrivateSdkDiagnostic({
        env: {
          GH_TOKEN: "private-token",
          RUNNER_TEMP: directory,
          SDK_DIAGNOSTIC_NAME: "Rust tests",
          SDK_REPOSITORY: "BANG404/openagent-sdk",
          SDK_SHA: "a".repeat(40),
        },
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          json: async () => ({ message: "Resource not accessible by integration\n::error::" }),
        }),
      }),
    ).rejects.toThrow(
      "GitHub Checks API returned HTTP 403: Resource not accessible by integration : :error: :.",
    );
  });

  test("does not include sensitive values in the private payload", () => {
    expect(
      redactSensitiveEnvironmentValues("token=private-token", {
        GH_TOKEN: "private-token",
      }),
    ).toBe("token=[REDACTED]");
  });
});
