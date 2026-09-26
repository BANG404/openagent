import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

import openagent from "./scripts/eslint-plugin-openagent.mjs";

export default tseslint.config(
  {
    ignores: [
      ".svelte-kit/**",
      "build/**",
      "dist/**",
      "dist-pages/**",
      "node_modules/**",
      "sdk/**",
      "src-tauri/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "no-control-regex": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
      "no-undef": "off",
      "openagent/component-usage": "error",
      "svelte/no-navigation-without-resolve": "off",
      "svelte/prefer-svelte-reactivity": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
    plugins: {
      openagent,
    },
  },
  {
    files: [
      "src/**/*.{js,ts,svelte,mjs,cjs}",
      "tests/**/*.{js,ts,svelte,mjs,cjs}",
      "scripts/**/*.{js,ts,svelte,mjs,cjs}",
      "*.{js,ts,mjs,cjs}",
    ],
    rules: {
      // One file-size ceiling keeps new responsibilities moving into focused
      // modules instead of growing another composition root.
      "max-lines": ["error", { max: 2000, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: [
      "src/lib/components/**/*.svelte",
      "src/lib/streamdown/components/**/*.svelte",
      "src/lib/openagent/**/*.ts",
    ],
    ignores: ["src/lib/components/SettingsView.svelte"],
    rules: {
      "max-lines-per-function": ["error", { max: 700, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 50],
    },
  },
  {
    files: ["src/routes/**/*.svelte"],
    ignores: ["src/routes/+page.svelte"],
    rules: {
      "max-lines-per-function": ["error", { max: 700, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 50],
    },
  },
  {
    files: ["src/routes/+page.svelte"],
    rules: {
      "max-lines-per-function": ["error", { max: 700, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 50],
    },
  },
  {
    files: ["src/lib/components/SettingsView.svelte"],
    rules: {
      "max-lines-per-function": ["error", { max: 700, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 50],
    },
  },
  {
    files: [
      "src/lib/components/ui/**/*.{svelte,ts}",
      "src/lib/streamdown/components/**/*.{svelte,ts}",
      "src/lib/openagent/**/*.ts",
    ],
    rules: {
      "max-lines-per-function": ["error", { max: 160, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 20],
      "max-depth": ["error", 5],
      "max-params": ["error", 6],
    },
  },
  {
    files: ["tests/**/*.{js,ts}", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.builtin,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
);
