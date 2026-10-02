import type { Settings, ThemeSetting } from './settings.ts';

/** Browser UI colors per theme; they mirror --color-bg in ui/theme/tokens.css. */
export const THEME_COLORS = { light: '#f5f0e6', dark: '#0c0a08' } as const;

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

/**
 * Applies the personalisation of AGENTS.md §32.3 as attributes on <html>; the defaults (green
 * felt, red backs, gold accent) need no attribute.
 */
export function applyAppearance(
  { felt, cardBack, accent }: Pick<Settings, 'felt' | 'cardBack' | 'accent'>,
  doc: Document = document,
): void {
  const root = doc.documentElement;
  const set = (attribute: string, value: string, fallback: string) => {
    if (value === fallback) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
  };
  set('data-felt', felt, 'green');
  set('data-cardback', cardBack, 'red');
  set('data-accent', accent, 'gold');
}
