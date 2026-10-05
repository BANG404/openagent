// @ts-check
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-host-access-"));
for (const [theme, language] of [
  ["light", "en"],
  ["dark", "zh"],
]) {
  for (const deferred of [true, false]) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/test-plugin-lifecycle-blackbox.mjs",
        "--host-access-only",
        ...(deferred ? ["--installation-only", "--defer-host-access"] : []),
      ],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          BLACKBOX_THEME: theme,
          BLACKBOX_LANGUAGE: language,
          BLACKBOX_ARTIFACT_DIR: join(
            artifacts,
            `${theme}-${language}-${deferred ? "defer" : "grant"}`,
          ),
        },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Plugin host access ${theme}/${language} ${deferred ? "deferral" : "grant"} failed`,
      );
  }
}
process.stdout.write(`Plugin host access black-box passed. Artifacts: ${artifacts}\n`);
