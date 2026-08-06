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
 * Adds the selected development URL as the final Tauri CLI configuration layer.
 * The option must precede the runner argument delimiter so the CLI can use it
 * while deciding whether to serve frontendDist or wait for Vite.
 *
 * @param {string[]} arguments_
 * @param {number} port
 * @returns {string[]}
 */
export function addDevUrlConfigArgument(arguments_, port) {
  const configArguments = [
    "--config",
    JSON.stringify({ build: { devUrl: `http://localhost:${port}` } }),
  ];
  const delimiterIndex = arguments_.indexOf("--");
  if (delimiterIndex === -1) return [...arguments_, ...configArguments];
  return [
    ...arguments_.slice(0, delimiterIndex),
    ...configArguments,
    ...arguments_.slice(delimiterIndex),
  ];
}
