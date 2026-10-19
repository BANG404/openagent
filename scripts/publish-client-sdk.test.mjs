import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { publishClientRelease } from "./publish-client-sdk.mjs";

test("publication repairs interrupted drafts, publishes Runtime first and reuses immutable npm versions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-publish-"));
  const signer = signingFixture();
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    const runtime = join(directory, "runtime");
    await mkdir(runtime);
    const binary = Buffer.from("qualified executable");
    const bytes = Buffer.from(
      JSON.stringify({
        schema_version: 1,
        version: "4.1.1",
        sdk_sha: "a".repeat(40),
        protocol: { min: 3, max: 3 },
        artifacts: {
          "windows-x64": { file: "server.exe", size: binary.length, sha256: hash(binary) },
        },
        helpers: {},
      }),
    );
    const assets = new Map([
      ["openagent-sdk-manifest.json", bytes],
      ["openagent-sdk-manifest.json.sig", Buffer.from(signer.sign(bytes))],
      ["server.exe", binary],
    ]);
    for (const [name, content] of assets) await writeFile(join(runtime, name), content);
    const tarball = Buffer.from("qualified tarball");
    await writeFile(join(directory, "openagent-sdk.tgz"), tarball);
    const runtimeTag = `runtime-v4.1.1-${hash(bytes).slice(0, 16)}`;
    const plan = {
      schema_version: 1,
      name: "@bang404/openagent-sdk",
      version: "0.3.0-beta.1",
      channel: "beta",
      fingerprint: "qualified",
      runtimeTag,
      tarballSha256: hash(tarball),
      runtime: {
        version: "4.1.1",
        sdkSha: "a".repeat(40),
        protocol: 3,
        manifestSha256: hash(bytes),
        manifestUrl: `https://github.com/BANG404/openagent/releases/download/${runtimeTag}/openagent-sdk-manifest.json`,
      },
    };
    await writeFile(join(directory, "release.json"), JSON.stringify(plan));
    let exists = false,
      isDraft = true,
      failUpload = true,
      published = false;
    const remote = new Map();
    const calls = [];
    const runGh = (args) => {
      calls.push(args[1]);
      if (args[1] === "view") {
        if (!exists) throw Object.assign(new Error("missing"), { stderr: "release not found" });
        return JSON.stringify({
          isDraft,
          isPrerelease: true,
          assets: [...remote.keys()].map((name) => ({ name })),
        });
      }
      if (args[1] === "create") exists = true;
      if (args[1] === "upload") {
        for (const file of args.slice(3, args.indexOf("--repo"))) {
          expect(remote.has(basename(file))).toBe(false);
          remote.set(basename(file), readFileSync(file));
          if (failUpload) {
            failUpload = false;
            throw new Error("upload interrupted");
          }
        }
      }
      if (args[1] === "download") {
        const output = args[args.indexOf("--dir") + 1];
        mkdirSync(output, { recursive: true });
        const selected = args.includes("--pattern")
          ? [args[args.indexOf("--pattern") + 1]]
          : [...remote.keys()];
        for (const name of selected) writeFileSync(join(output, name), remote.get(name));
      }
      if (args[1] === "edit") isDraft = false;
      return "";
    };
    const options = {
      repository: "BANG404/openagent",
      publicKey: signer.publicKey,
      runGh,
      registry: async () => ({
        versions: published
          ? {
              [plan.version]: {
                openagent: { fingerprint: plan.fingerprint, runtime: plan.runtime },
              },
            }
          : {},
      }),
      publishNpm: () => {
        expect(isDraft).toBe(false);
        expect(remote.size).toBe(3);
        published = true;
        calls.push("npm");
      },
    };
    await expect(publishClientRelease(directory, options)).rejects.toThrow("upload interrupted");
    expect(isDraft).toBe(true);
    expect(published).toBe(false);
    await publishClientRelease(directory, options);
    expect(calls.indexOf("npm")).toBeGreaterThan(calls.indexOf("edit"));
    calls.length = 0;
    await publishClientRelease(directory, options);
    expect(calls).not.toContain("upload");
    expect(calls).not.toContain("npm");
    remote.set("server.exe", Buffer.from("changed"));
    await expect(publishClientRelease(directory, options)).rejects.toThrow("asset differs");
    remote.delete("server.exe");
    await expect(publishClientRelease(directory, options)).rejects.toThrow("incomplete");
    expect(calls).not.toContain("upload");
    expect(await readFile(join(directory, "openagent-sdk.tgz"))).toEqual(tarball);
    await writeFile(join(directory, "openagent-sdk.tgz"), "tampered");
    calls.length = 0;
    await expect(publishClientRelease(directory, options)).rejects.toThrow("identity mismatch");
    expect(calls).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
