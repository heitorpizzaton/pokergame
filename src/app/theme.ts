import type { ThemeSetting } from './settings.ts';

/** Browser UI colors per theme; they mirror --color-bg in ui/theme/tokens.css. */
export const THEME_COLORS = { light: '#f4f6f5', dark: '#0e1412' } as const;

/**
 * Applies the "Tema" setting (AGENTS.md §30.2). `Automático` removes the attribute so the CSS
 * media query follows the device; `Claro`/`Escuro` pin the theme with data-theme.
 */
export function applyTheme(theme: ThemeSetting, doc: Document = document): void {
  const root = doc.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = theme === 'auto' ? THEME_COLORS[scheme] : THEME_COLORS[theme];
  }
}
