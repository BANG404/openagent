import names from "./platformLocales.json";
export const PLATFORM_LOCALES = Object.keys(names) as Array<keyof typeof names>;
