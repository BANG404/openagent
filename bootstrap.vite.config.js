import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/bootstrap",
  resolve: { alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) } },
  plugins: [svelte(), tailwindcss()],
  build: { outDir: "../../.cache/bootstrap-dist", emptyOutDir: true },
});
