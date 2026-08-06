import { copyFile, readFile } from "node:fs/promises";

/**
 * Copies a file only when the destination bytes differ.
 *
 * @param {string} source
 * @param {string} destination
 * @returns {Promise<boolean>} whether the destination changed
 */
export async function copyFileIfChanged(source, destination) {
  const sourceBytes = await readFile(source);
  try {
    const destinationBytes = await readFile(destination);
    if (sourceBytes.equals(destinationBytes)) return false;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await copyFile(source, destination);
  return true;
}
