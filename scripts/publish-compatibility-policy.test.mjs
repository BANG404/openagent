import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { publishCompatibilityPolicy } from "./publish-compatibility-policy.mjs";

/** @param {(context: Awaited<ReturnType<typeof setup>>) => Promise<void>} run */
async function fixture(run) {
  const context = await setup();
  try {
    await run(context);
  } finally {
    await rm(context.directory, { recursive: true, force: true });
  }
}

async function setup() {
  const signer = signingFixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-policy-test-"));
  const candidate = path.join(directory, "openagent-compatibility-policy.json");
  const policy = Buffer.from(
    JSON.stringify({
      schema_version: 1,
      revision: 2,
      issued_at: 1,
      expires_at: 4102444800,
      rules: [],
    }),
  );
  await writeFile(candidate, policy);
  await writeFile(`${candidate}.sig`, signer.sign(policy));
  /** @type {{ command: string; args: string[]; files: Buffer[] }[]} */
  const mutations = [];
  /** @param {string} command @param {string[]} args */
  function execute(command, args) {
    mutations.push({
      command,
      args,
      files: args
        .filter((a) => a.endsWith(".json") || a.endsWith(".sig"))
        .map((a) => readFileSync(a)),
    });
    return "";
  }
  return { signer, directory, candidate, policy, mutations, execute };
}

test("publishes immutable signed revision before replacing the moving policy", () =>
  fixture(async (f) => {
    const result = await publishCompatibilityPolicy({
      directory: f.directory,
      publicKey: f.signer.publicKey,
      execute: f.execute,
      validate: () => {},
      fetchRequest: async () => new Response("", { status: 404 }),
    });
    expect(result.revision).toBe(2);
    expect(f.mutations.map((m) => m.args.slice(0, 2))).toEqual([
      ["release", "create"],
      ["release", "upload"],
      ["release", "upload"],
    ]);
    expect(f.mutations[1].args).not.toContain("--clobber");
    expect(f.mutations[1].files[0]).toEqual(f.policy);
    expect(f.mutations[2].args).toContain("--clobber");
    expect(f.mutations[2].files[0]).toEqual(f.policy);
  }));

test("signature or Runtime parser rejection prevents every remote mutation", () =>
  fixture(async (f) => {
    const options = {
      directory: f.directory,
      publicKey: f.signer.publicKey,
      execute: f.execute,
      validate: () => {
        throw new Error("Unsupported rule action");
      },
      fetchRequest: async () => {
        throw new Error("No remote requests expected");
      },
    };
    await expect(publishCompatibilityPolicy(options)).rejects.toThrow("Unsupported rule action");
    await writeFile(f.candidate, Buffer.from("modified"));
    await expect(publishCompatibilityPolicy(options)).rejects.toThrow(
      "signature verification failed",
    );
    expect(f.mutations).toHaveLength(0);
  }));

test("uses verified archive for monotonicity even when moving feed publication was interrupted", () =>
  fixture(async (f) => {
    const previous = Buffer.from(f.policy.toString().replace('"revision":2', '"revision":3'));
    const archive = "openagent-compatibility-policy-v3.json";
    const url = `https://example.test/${archive}`;
    await expect(
      publishCompatibilityPolicy({
        directory: f.directory,
        publicKey: f.signer.publicKey,
        execute: f.execute,
        validate: () => {},
        fetchRequest: async () =>
          Response.json({
            assets: [
              { name: archive, browser_download_url: url },
              { name: `${archive}.sig`, browser_download_url: `${url}.sig` },
            ],
          }),
      }),
    ).rejects.toThrow("revision must advance");
    expect(f.mutations).toHaveLength(0);
    expect(previous).not.toEqual(f.policy);
  }));

test("retries an interrupted first publication and verifies any existing archive bytes", () =>
  fixture(async (f) => {
    const archive = "openagent-compatibility-policy-v2.json";
    const url = `https://example.test/${archive}`;
    /** @type {typeof fetch} */
    const fetchRequest = async (input) => {
      if (String(input).startsWith("https://api.github.com/"))
        return Response.json({ assets: [{ name: archive, browser_download_url: url }] });
      return new Response(f.policy);
    };
    await publishCompatibilityPolicy({
      directory: f.directory,
      publicKey: f.signer.publicKey,
      execute: f.execute,
      validate: () => {},
      fetchRequest,
    });
    expect(f.mutations).toHaveLength(2);
    expect(f.mutations[0].files).toHaveLength(1);
    expect(f.mutations[0].args.some((a) => a.endsWith(`${archive}.sig`))).toBe(true);
    f.mutations.length = 0;
    await expect(
      publishCompatibilityPolicy({
        directory: f.directory,
        publicKey: f.signer.publicKey,
        execute: f.execute,
        validate: () => {},
        fetchRequest: async (input) =>
          String(input).startsWith("https://api.github.com/")
            ? Response.json({ assets: [{ name: archive, browser_download_url: url }] })
            : new Response("different"),
      }),
    ).rejects.toThrow("Archived policy revision differs");
    expect(f.mutations).toHaveLength(0);
  }));

test("refuses an equivocated signed revision and validates the previous signed document", () =>
  fixture(async (f) => {
    const archive = "openagent-compatibility-policy-v2.json";
    const url = `https://example.test/${archive}`;
    const previous = Buffer.from(
      f.policy.toString().replace('"rules":[]', '"rules":[{"id":"pause"}]'),
    );
    /** @type {string[]} */
    const validated = [];
    await expect(
      publishCompatibilityPolicy({
        directory: f.directory,
        publicKey: f.signer.publicKey,
        execute: f.execute,
        validate: (candidate, old) => {
          validated.push(old ?? candidate);
        },
        fetchRequest: async (input) => {
          if (String(input).startsWith("https://api.github.com/"))
            return Response.json({
              assets: [
                { name: archive, browser_download_url: url },
                { name: `${archive}.sig`, browser_download_url: `${url}.sig` },
              ],
            });
          return new Response(String(input).endsWith(".sig") ? f.signer.sign(previous) : previous);
        },
      }),
    ).rejects.toThrow("published revision is immutable");
    expect(validated).toHaveLength(2);
    expect(f.mutations).toHaveLength(0);
    expect(await readFile(f.candidate)).toEqual(f.policy);
  }));
