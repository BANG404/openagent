export type AppTheme = "light" | "dark" | "system";

export type NativeAppTheme = Exclude<AppTheme, "system"> | null;

type NativeThemeSynchronizerOptions = {
  applyWebTheme: (theme: AppTheme) => boolean;
  setNativeTheme: (theme: NativeAppTheme) => Promise<void>;
  onResolvedTheme: (dark: boolean) => void;
  afterNativeThemeChange?: () => Promise<void>;
  onError?: (error: unknown) => void;
};

export function applyDocumentTheme(theme: string): boolean {
  document.documentElement.classList.remove("dark", "light");
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.add(dark ? "dark" : "light");
  return dark;
}

export function createNativeThemeSynchronizer({
  applyWebTheme,
  setNativeTheme,
  onResolvedTheme,
  afterNativeThemeChange = () => Promise.resolve(),
  onError = () => {},
}: NativeThemeSynchronizerOptions) {
  let revision = 0;
  let queue = Promise.resolve();

  return (theme: AppTheme): Promise<void> => {
    const requestRevision = ++revision;
    const explicitDark = theme === "system" ? null : applyWebTheme(theme);
    if (explicitDark !== null) onResolvedTheme(explicitDark);

    queue = queue.then(async () => {
      if (requestRevision !== revision) return;

      try {
        await setNativeTheme(theme === "system" ? null : explicitDark ? "dark" : "light");
        if (theme === "system") await afterNativeThemeChange();
      } catch (error) {
        onError(error);
        return;
      }

      if (requestRevision !== revision || theme !== "system") return;
      onResolvedTheme(applyWebTheme("system"));
    });

    return queue;
  };
}
