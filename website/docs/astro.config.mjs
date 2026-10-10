import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://bang404.github.io",
  base: "/openagent/docs",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: { en: "OpenAgent · Plugin development", "zh-CN": "OpenAgent · 插件开发" },
      description: "Build, validate, and publish Agent Plugins for OpenAgent.",
      favicon: "https://bang404.github.io/openagent/assets/openagent_logo.png",
      customCss: ["./src/styles/custom.css"],
      locales: {
        root: { label: "English", lang: "en" },
        "zh-cn": { label: "简体中文", lang: "zh-CN" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/BANG404/openagent" }],
      editLink: {
        baseUrl: "https://github.com/BANG404/openagent/edit/main/website/docs/",
      },
      sidebar: [
        { slug: "index" },
        {
          label: "Plugin development",
          translations: { "zh-CN": "插件开发教程" },
          items: [
            { slug: "plugins/first-plugin" },
            { slug: "plugins/package" },
            { slug: "plugins/mcp" },
            { slug: "plugins/sidebar" },
            { slug: "plugins/publishing" },
          ],
        },
      ],
    }),
  ],
});
