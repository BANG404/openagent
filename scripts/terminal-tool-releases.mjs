// Reviewed upstream GitHub Release asset SHA-256 digests. Updating a pin requires
// reviewing its licenses and qualifying every supported shell target.
export const TERMINAL_TOOLS = {
  rg: {
    repository: "BurntSushi/ripgrep",
    tag: "15.2.0",
    prefix: "ripgrep-15.2.0",
    licenses: ["COPYING", "LICENSE-MIT", "UNLICENSE"],
    hashes: {
      "x86_64-pc-windows-msvc": "71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5",
      "x86_64-unknown-linux-musl":
        "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c",
      "x86_64-apple-darwin": "af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1",
      "aarch64-apple-darwin": "3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4",
    },
  },
  fd: {
    repository: "sharkdp/fd",
    tag: "v10.5.0",
    prefix: "fd-v10.5.0",
    licenses: ["LICENSE-APACHE", "LICENSE-MIT"],
    hashes: {
      "x86_64-pc-windows-msvc": "a227701b8551c35a9931d9f6da75503cf86d88e182d71fb849a70864c5d57cd7",
      "x86_64-unknown-linux-musl":
        "761c72dc8e120d85b22292063be8a796e2eeb20eb3e4f38b8fa2343ccf3514a7",
      "x86_64-apple-darwin": "7e31028c62c6955877735d0406807aa484c2a5e6f86235a59e26c29c301da590",
      "aarch64-apple-darwin": "b67e1836c468e42e411984b56e52fa7abec08c2bd22c867398e7cc134aac5e12",
    },
  },
  bat: {
    repository: "sharkdp/bat",
    tag: "v0.26.1",
    prefix: "bat-v0.26.1",
    licenses: ["LICENSE-APACHE", "LICENSE-MIT"],
    hashes: {
      "x86_64-pc-windows-msvc": "0f729b4b6f5f28d395c641eacc2e9ff68d0096b85aa0eec344aa62425144b69b",
      "x86_64-unknown-linux-musl":
        "0dcd8ac79732c0d5b136f11f4ee00e581440e16a44eab5b3105b611bbf2cf191",
      "x86_64-apple-darwin": "830d63b0bba1fa040542ec569e3cf77f60d3356b9de75116a344b061e0894245",
      "aarch64-apple-darwin": "e30beff26779c9bf60bb541e1d79046250cb74378f2757f8eb250afddb19e114",
    },
  },
  sd: {
    repository: "chmln/sd",
    tag: "v1.1.0",
    prefix: "sd-v1.1.0",
    licenses: ["LICENSE"],
    hashes: {
      "x86_64-pc-windows-msvc": "59837c2e7c911099aca1cc46b663bcdc5a949fd3e9fbbaf34fc73e5d5d71007c",
      "x86_64-unknown-linux-musl":
        "02f00f4777d43e8e95b7b8d49e1a0d6e502fed4b8e79c1c8b8063857a30caa2e",
      "x86_64-apple-darwin": "1fca1e9c91813a8aac6821063c923107ba0f66a83309e095edcd3b202f67f97e",
      "aarch64-apple-darwin": "4bd3c09226376ca0a1d69589c91e86276fae36c5fbaaee669afce583f6682030",
    },
  },
};

const hostTargets = {
  "win32/x64": "x86_64-pc-windows-msvc",
  "linux/x64": "x86_64-unknown-linux-gnu",
  "darwin/x64": "x86_64-apple-darwin",
  "darwin/arm64": "aarch64-apple-darwin",
};

export function terminalToolTarget() {
  return (
    process.env.OPENAGENT_TERMINAL_TOOLS_TARGET ??
    process.env.TAURI_ENV_TARGET_TRIPLE ??
    hostTargets[/** @type {keyof typeof hostTargets} */ (`${process.platform}/${process.arch}`)]
  );
}

/** @param {string} name @param {string} target */
export function terminalToolRelease(name, target) {
  const pin = TERMINAL_TOOLS[/** @type {keyof typeof TERMINAL_TOOLS} */ (name)];
  const artifactTarget =
    target === "x86_64-unknown-linux-gnu" ? "x86_64-unknown-linux-musl" : target;
  const sha256 = pin?.hashes[/** @type {keyof typeof pin.hashes} */ (artifactTarget)];
  if (!sha256) throw new Error(`No bundled terminal tool ${name} for target ${target}`);
  const windows = artifactTarget.endsWith("windows-msvc");
  const directory = `${pin.prefix}-${artifactTarget}`;
  const archive = `${directory}.${windows ? "zip" : "tar.gz"}`;
  return {
    name,
    version: pin.tag.replace(/^v/, ""),
    sha256,
    directory,
    archive,
    executable: `${name}${windows ? ".exe" : ""}`,
    licenses: pin.licenses,
    url: `https://github.com/${pin.repository}/releases/download/${pin.tag}/${archive}`,
  };
}
