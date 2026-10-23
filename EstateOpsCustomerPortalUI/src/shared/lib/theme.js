/**
 * Applies a tenant theme (colours as "r g b" strings, font stack) to CSS variables at runtime.
 * @param {{ colors?: Record<string, string>, fontSans?: string }} theme
 */
export function applyTheme(theme, root = document.documentElement) {
  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    root.style.setProperty(`--color-${name}`, value);
  }
  if (theme.fontSans) root.style.setProperty('--font-sans', theme.fontSans);
}
