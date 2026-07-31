import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const revision = "751bff37182d3f1213fa05d7196b954e230abad9";
const repository = "Xenova/all-MiniLM-L6-v2";
const upstreamLicenseRevision = "826711e54e001c83835913827a843d8dd0a1def9";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "src-tauri", "resources", "models", "all-MiniLM-L6-v2-q");

const files = [
  {
    name: "model_quantized.onnx",
    source: "onnx/model_quantized.onnx",
    size: 22_972_370,
    sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
  },
  {
    name: "config.json",
    source: "config.json",
    size: 650,
    sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7",
  },
  {
    name: "tokenizer.json",
    source: "tokenizer.json",
    size: 711_661,
    sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
  },
  {
    name: "tokenizer_config.json",
    source: "tokenizer_config.json",
    size: 366,
    sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
  },
  {
    name: "special_tokens_map.json",
    source: "special_tokens_map.json",
    size: 125,
    sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
  },
  {
    name: "LICENSE",
    url: `https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/${upstreamLicenseRevision}/LICENSE?download=true`,
    size: 10_318,
    sha256: "1e66d43b04a3f2428303ad3316d1fbb996991541192892b22d21f0065a093b2b",
  },
];

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validate(file, bytes) {
  if (bytes.byteLength !== file.size) {
    throw new Error(`${file.name}: expected ${file.size} bytes, got ${bytes.byteLength}`);
  }
  const actualHash = hash(bytes);
  if (actualHash !== file.sha256) {
    throw new Error(`${file.name}: expected SHA-256 ${file.sha256}, got ${actualHash}`);
  }
}

async function checkExisting(file) {
  const bytes = await readFile(path.join(destination, file.name));
  validate(file, bytes);
}

async function download(file) {
  const url =
    file.url ??
    `https://huggingface.co/${repository}/resolve/${revision}/${file.source}?download=true`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${file.name}: download failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  validate(file, bytes);

  const target = path.join(destination, file.name);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

const checkOnly = process.argv.includes("--check");
await mkdir(destination, { recursive: true });

for (const file of files) {
  if (checkOnly) {
    await checkExisting(file);
  } else {
    await rm(path.join(destination, `${file.name}.tmp`), { force: true });
    await download(file);
  }
}

console.log(
  `${checkOnly ? "Verified" : "Fetched"} bundled embedding model ${repository}@${revision}`,
);
