import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";

import {
  runtimeServerPendingStampPath,
  writeRuntimeServerReloadStamp,
} from "./scripts/runtime-server-dev-signals.mjs";

const host = process.env.TAURI_DEV_HOST;
const devPort = Number.parseInt(process.env.OPENAGENT_DEV_PORT ?? "0", 10) || 0;

/** @returns {import("vite").Plugin} */
function tauriRuntimeUpdateBarrier() {
  const pendingRuntimeStamp = runtimeServerPendingStampPath();
  let pendingRuntimeRevision = 0;

  return {
    name: "openagent-tauri-runtime-update-barrier",
    configureServer(server) {
      server.watcher.add(pendingRuntimeStamp);
      server.ws.on("openagent:component-update-ready", async (payload) => {
        if (payload?.kind === "runtime" && pendingRuntimeRevision > 0) {
          await writeRuntimeServerReloadStamp(undefined, {
            revision: pendingRuntimeRevision,
          });
          pendingRuntimeRevision = 0;
          return;
        }
        if (payload?.kind === "frontend") {
          server.ws.send({ type: "full-reload" });
        }
      });
    },
    async handleHotUpdate(context) {
      if (context.file === pendingRuntimeStamp) {
        try {
          const pending = JSON.parse(await readFile(pendingRuntimeStamp, "utf8"));
          pendingRuntimeRevision = Number(pending.revision) || pendingRuntimeRevision + 1;
        } catch {
          pendingRuntimeRevision += 1;
        }
        context.server.ws.send({
          type: "custom",
          event: "openagent:component-update-pending",
          data: { kind: "runtime" },
        });
        return [];
      }
      context.server.ws.send({
        type: "custom",
        event: "openagent:component-update-pending",
        data: { kind: "frontend" },
      });
      return [];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), sveltekit(), ...(devPort !== 0 ? [tauriRuntimeUpdateBarrier()] : [])],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. Tauri supplies an available port for desktop development; standalone Vite selects one.
  server: {
    port: devPort,
    strictPort: devPort !== 0,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
