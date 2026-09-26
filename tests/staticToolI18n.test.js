import { describe, expect, test } from "bun:test";
import {
  STATIC_TOOL_COMPONENTS,
  staticToolI18nErrors,
  staticToolI18nViolations,
  translationCatalogs,
  translationKeys,
} from "../scripts/check-static-tool-i18n.mjs";

describe("static agent-tool i18n contract", () => {
  test("all static tool surfaces use complete bilingual translations", () => {
    expect(staticToolI18nErrors()).toEqual([]);
    expect(STATIC_TOOL_COMPONENTS.length).toBeGreaterThan(0);
  });

  test("rejects hardcoded tool labels and missing translation keys", () => {
    const keys = translationKeys('  known: "已知"\n  known: "Known"\n');
    const errors = staticToolI18nViolations(
      `
        <script>import { t } from "$lib/i18n";</script>
        <span>Thinking</span>
        <span>{$t("missing")}</span>
        <section aria-label="Tool preview"></section>
        <img alt="Tool result image" />
      `,
      "Fixture.svelte",
      keys,
    );

    expect(errors).toEqual([
      "Fixture.svelte: translation key missing is missing from zh/en catalogs.",
      'Fixture.svelte: hardcoded tool UI text "Thinking" must use $t(...).',
      'Fixture.svelte: hardcoded tool UI attribute "Tool preview" must use $t(...).',
      'Fixture.svelte: hardcoded tool UI attribute "Tool result image" must use $t(...).',
    ]);
  });

  test("requires every used key in both locale catalogs", () => {
    const catalogs = translationCatalogs(
      'const zh = {\n  shared: "共享",\n} as const;\nconst en: Translations = {\n};',
    );
    const keys = new Set([...catalogs.zh].filter((key) => catalogs.en.has(key)));
    expect(staticToolI18nViolations('<span>{$t("shared")}</span>', "Fixture.svelte", keys)).toEqual(
      [
        "Fixture.svelte: static tool UI must import its labels from $lib/i18n.",
        "Fixture.svelte: translation key shared is missing from zh/en catalogs.",
      ],
    );
  });
});
