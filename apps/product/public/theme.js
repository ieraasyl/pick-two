// Keep the storage key and default in sync with ThemeProvider.
(() => {
  let theme = "system";
  try {
    const storedTheme = localStorage.getItem("theme");
    if (["light", "dark", "system"].includes(storedTheme)) {
      theme = storedTheme;
    }
  } catch {
    // Storage can be unavailable; fall back to the system preference.
  }
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
})();
