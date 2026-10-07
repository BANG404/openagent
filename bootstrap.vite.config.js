import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/bootstrap",
  plugins: [svelte(), tailwindcss()],
  build: { outDir: "../../.cache/bootstrap-dist", emptyOutDir: true },
});
