import net from "node:net";

/**
 * Reserves an ephemeral loopback port long enough to learn its number, then releases it for Vite.
 *
 * @returns {Promise<number>}
 */
export function findAvailableLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to determine the selected development port.")));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

/**
 * Adds a runtime dev URL to the Tauri config merge object.
 *
 * @param {string | undefined} existingConfig
 * @param {number} port
 * @returns {string}
 */
export function mergeDevUrlConfig(existingConfig, port) {
  /** @type {Record<string, unknown>} */
  let config = {};
  if (existingConfig) {
    try {
      config = JSON.parse(existingConfig);
    } catch {
      throw new Error("TAURI_CONFIG must be valid JSON when starting Tauri development.");
    }
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("TAURI_CONFIG must be a JSON object when starting Tauri development.");
  }

  /** @type {Record<string, unknown>} */
  const build =
    config.build && typeof config.build === "object" && !Array.isArray(config.build)
      ? /** @type {Record<string, unknown>} */ (config.build)
      : {};
  return JSON.stringify({ ...config, build: { ...build, devUrl: `http://localhost:${port}` } });
}
