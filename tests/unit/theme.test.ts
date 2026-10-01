import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/app/settings.ts';
import { applyTheme, THEME_COLORS } from '../../src/app/theme.ts';

const TOKENS = readFileSync('src/ui/theme/tokens.css', 'utf8');

/** Declarations (`--name: value`) inside the first `{ … }` block that follows `selector`. */
function block(selector: string): Map<string, string> {
  const start = TOKENS.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = TOKENS.indexOf('{', start);
  const close = TOKENS.indexOf('}', open);
  const body = TOKENS.slice(open + 1, close);
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** A minimal stand-in for `document`, enough for applyTheme. */
function fakeDocument() {
  const metas = [
    { media: '(prefers-color-scheme: light)', content: '' },
    { media: '(prefers-color-scheme: dark)', content: '' },
  ];
  const dataset: Record<string, string | undefined> = {};
  const doc = {
    documentElement: { dataset },
    querySelectorAll: () => metas,
  } as unknown as Document;
  return { doc, dataset, metas };
}

describe('Tema setting (AGENTS.md §30.2)', () => {
  it('defaults to Automático and keeps only valid values', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('auto');
    const stored = (theme: unknown) => ({ getItem: () => JSON.stringify({ theme }) });
    expect(loadSettings(stored('dark')).theme).toBe('dark');
    expect(loadSettings(stored('light')).theme).toBe('light');
    expect(loadSettings(stored('sepia')).theme).toBe('auto');
  });

  it('pins a theme with data-theme and clears it for Automático', () => {
    const { doc, dataset, metas } = fakeDocument();
    applyTheme('dark', doc);
    expect(dataset.theme).toBe('dark');
    expect(metas.map((m) => m.content)).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
    applyTheme('auto', doc);
    expect(dataset.theme).toBeUndefined();
    expect(metas.map((m) => m.content)).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });

  it('applies a pinned theme before the first paint (index.html)', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("localStorage.getItem('mesa-viva:settings')");
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
  });
});

describe('design tokens (AGENTS.md §30.2)', () => {
  const light = block(':root {');
  const dark = block(":root[data-theme='dark'] {");
  const media = block(":root:not([data-theme='light']) {");

  it('keeps the two dark blocks identical', () => {
    expect([...media.entries()]).toEqual([...dark.entries()]);
  });

  it('only overrides tokens that the light theme defines', () => {
    for (const name of dark.keys()) expect(light.has(name), name).toBe(true);
  });

  it('defines every color the UI reads', () => {
    const used = new Set<string>();
    for (const file of files('src/ui').filter((f) => /\.(css|tsx)$/.test(f))) {
      for (const m of readFileSync(file, 'utf8').matchAll(
        /var\((--(?:color|chip|shadow)[\w-]*)/g,
      )) {
        used.add(m[1] ?? '');
      }
    }
    for (const name of used) expect(light.has(name), name).toBe(true);
  });

  it('mirrors the background colors used for the browser UI', () => {
    expect(light.get('--color-bg')).toBe(THEME_COLORS.light);
    expect(dark.get('--color-bg')).toBe(THEME_COLORS.dark);
  });
});

describe('no casino styling left (AGENTS.md §30.1)', () => {
  const sources = files('src/ui').filter((f) => /\.(css|tsx)$/.test(f));

  it('uses no blur, glass, gold, felt, rail or noise textures', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/backdrop-filter|--blur|--color-glass|--color-gold/);
      expect(text, file).not.toMatch(/--texture-noise|--color-felt|--color-rail|--color-room/);
    }
  });

  it('keeps colors in the tokens: no hardcoded colors in component styles', () => {
    for (const file of sources.filter((f) => !f.endsWith('tokens.css'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
    }
  });
});
