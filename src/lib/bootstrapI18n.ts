import { en } from "./i18n.en";
import { zh } from "./i18n.zh";

/** The embedded shell can render translations before the SDK client exists. */
export function bootstrapText(language: "en" | "zh", key: keyof typeof zh): string {
  return (language === "en" ? en : zh)[key];
}
