import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { readFile, unlink } from "node:fs/promises";

import {
  FRONTEND_BUILD_DEFINE,
  frontendBuildIdentity,
} from "./scripts/frontend-build-identity.mjs";
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
          const revision = pendingRuntimeRevision;
          await writeRuntimeServerReloadStamp(undefined, {
            revision,
          });
          // The pending stamp is a one-shot handoff. Leaving it behind makes
          // a fresh Vite process observe the old signal and request another
          // reload after every restart. Do not remove a newer pending build
          // that may have arrived while this handoff was completing.
          try {
            const pending = JSON.parse(await readFile(pendingRuntimeStamp, "utf8"));
            if (Number(pending.revision) <= revision) {
              await unlink(pendingRuntimeStamp);
            }
          } catch (error) {
            const code =
              error && typeof error === "object" && "code" in error ? error.code : undefined;
            if (code !== "ENOENT") throw error;
          }
          if (pendingRuntimeRevision === revision) pendingRuntimeRevision = 0;
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

  // Stamp the bundle with the frontend's own build identity so About reports
  // the frontend that is running rather than the shell version it shipped with.
  define: {
    [FRONTEND_BUILD_DEFINE]: JSON.stringify(frontendBuildIdentity().label),
  },

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
  // The main route has an explicit transitive budget in check-bundle-size.mjs;
  // keep Vite's generic warning aligned with that enforced limit.
  build: {
    chunkSizeWarningLimit: 1400,
  },
}));
