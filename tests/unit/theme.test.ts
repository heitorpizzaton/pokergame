import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_COLORS,
  CARD_BACK_COLORS,
  DEFAULT_SETTINGS,
  FELT_COLORS,
  loadSettings,
} from '../../src/app/settings.ts';
import { applyAppearance, applyTheme, THEME_COLORS } from '../../src/app/theme.ts';

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

const light = block(':root {');

describe('design tokens (AGENTS.md §30.2)', () => {
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

describe('casino look and personalisation (AGENTS.md §32)', () => {
  const sources = files('src/ui').filter((f) => /\.(css|tsx)$/.test(f));

  it('keeps colors in the tokens: no hardcoded colors in component styles', () => {
    for (const file of sources.filter((f) => !f.endsWith('tokens.css'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
    }
  });

  it('uses no backdrop blur, which is costly on phones (AGENTS.md §12)', () => {
    for (const file of sources)
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/backdrop-filter/);
  });

  it('defines every felt, card back and accent option, with a swatch for each', () => {
    const options = { felt: FELT_COLORS, cardback: CARD_BACK_COLORS, accent: ACCENT_COLORS };
    const defaults = { felt: 'green', cardback: 'red', accent: 'gold' };
    for (const [name, values] of Object.entries(options)) {
      for (const value of values) {
        expect(light.has(`--swatch-${name}-${value}`), `${name} ${value}`).toBe(true);
        if (value === defaults[name as keyof typeof defaults]) continue;
        expect(TOKENS, `${name} ${value}`).toContain(`:root[data-${name}='${value}'] {`);
      }
    }
    // Accents need dark values too, for the explicit choice and for the media query.
    for (const accent of ACCENT_COLORS.filter((a) => a !== 'gold')) {
      expect(TOKENS).toContain(`:root[data-theme='dark'][data-accent='${accent}'] {`);
      expect(TOKENS).toContain(`:root:not([data-theme='light'])[data-accent='${accent}'] {`);
    }
  });

  it('stores only valid choices and applies them as attributes on <html>', () => {
    const stored = (value: unknown) => ({ getItem: () => JSON.stringify(value) });
    expect(DEFAULT_SETTINGS).toMatchObject({ felt: 'green', cardBack: 'red', accent: 'gold' });
    expect(loadSettings(stored({ felt: 'blue', cardBack: 'black', accent: 'ruby' }))).toMatchObject(
      {
        felt: 'blue',
        cardBack: 'black',
        accent: 'ruby',
      },
    );
    expect(loadSettings(stored({ felt: 'pink', cardBack: 1, accent: null }))).toMatchObject({
      felt: 'green',
      cardBack: 'red',
      accent: 'gold',
    });

    const attributes = new Map<string, string>();
    const doc = {
      documentElement: {
        setAttribute: (k: string, v: string) => attributes.set(k, v),
        removeAttribute: (k: string) => attributes.delete(k),
      },
    } as unknown as Document;
    applyAppearance({ felt: 'blue', cardBack: 'black', accent: 'ruby' }, doc);
    expect(Object.fromEntries(attributes)).toEqual({
      'data-felt': 'blue',
      'data-cardback': 'black',
      'data-accent': 'ruby',
    });
    applyAppearance({ felt: 'green', cardBack: 'red', accent: 'gold' }, doc);
    expect(attributes.size).toBe(0);
    expect(readFileSync('index.html', 'utf8')).toContain('data.felt = saved.felt');
  });
});
