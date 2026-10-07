import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

/** Ephemeral test keys only; exercises Tauri's wrapped, prehashed Minisign format. */
export function signingFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const rawKey = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const minisignKey = Buffer.concat([Buffer.from("Ed"), keyId, rawKey]).toString("base64");
  return {
    publicKey: `untrusted comment: fixture public key\n${minisignKey}\n`,
    /** @param {Uint8Array} bytes */
    sign(bytes) {
      const signature = sign(null, createHash("blake2b512").update(bytes).digest(), privateKey);
      const packet = Buffer.concat([Buffer.from("ED"), keyId, signature]).toString("base64");
      const comment = "timestamp:0\tfile:fixture\tprehashed";
      const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
      return Buffer.from(
        `untrusted comment: fixture signature\n${packet}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`,
      ).toString("base64");
    },
  };
}
