export type AppTheme = "light" | "dark" | "system";

export function applyDocumentTheme(theme: string): boolean {
  document.documentElement.classList.remove("dark", "light");
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.add(dark ? "dark" : "light");
  return dark;
}
