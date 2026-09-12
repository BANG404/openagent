import { isTauri } from "@tauri-apps/api/core";
import { invoke } from "./tauriClient";

/**
 * Desktop bridge for the product-managed Cua Driver daemon.
 *
 * The endpoint is host-owned product policy: on Windows it is a named pipe and
 * on macOS/Linux a private filesystem path. The reserved MCP entry persists it,
 * so the daemon the host starts and the client the Runtime spawns always agree
 * on one endpoint. Nothing else in the frontend may guess this value.
 */
let endpoint = "";

/** The endpoint reported by the desktop host, or "" outside the desktop app. */
export function cuaDriverEndpoint(): string {
  return endpoint;
}

/** Read the host endpoint once, before any reserved entry is created. */
export async function hydrateCuaDriverEndpoint(): Promise<string> {
  if (endpoint || !isTauri()) return endpoint;
  try {
    endpoint = await invoke<string>("cua_driver_endpoint");
  } catch (error) {
    console.error("Failed to read the Cua Driver endpoint:", error);
  }
  return endpoint;
}

/**
 * Start the product-managed daemon and wait until it accepts connections.
 *
 * `cua-driver mcp --socket` refuses to run without a listening daemon, so this
 * has to succeed before the reserved entry is connected or probed. Returns
 * whether this call spawned the daemon, which tells a caller that a Runtime
 * which already connected its persisted MCP list has to reconnect.
 */
export async function startCuaDriverDaemon(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("start_cua_driver_serve");
  } catch (error) {
    console.error("Failed to start the Cua Driver daemon:", error);
    return false;
  }
}
