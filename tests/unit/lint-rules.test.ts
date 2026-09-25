import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * Guards the architectural lint rules from AGENTS.md §2.1, §4 and §8.1. If one of these rules is
 * removed or weakened, this test fails.
 */
// The probed files do not exist on disk, so type-aware parsing is switched off. The architectural
// rules checked here are syntactic and unaffected.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: tseslint.configs.disableTypeChecked,
});

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error('ESLint returned no result');
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(`ESLint could not parse ${filePath}: ${fatal.message}`);
  return result.messages.map((m) => m.ruleId ?? '');
}

describe('Math.random ban (§2.1)', () => {
  const cases = [
    'export const x = Math.random();',
    "export const x = Math['random']();",
    'const { random } = Math;\nexport const x = random();',
  ];

  for (const file of ['src/core/rng/sample.ts', 'src/ai/sample.ts', 'tests/unit/sample.test.ts']) {
    it.each(cases)(`rejects %j in ${file}`, async (code) => {
      expect(await ruleIds(code, file)).toContain('no-restricted-properties');
    });
  }
});

describe('src/ai import boundary (§8.1)', () => {
  const forbidden = [
    "import { x } from '../core/engine';",
    "import { x } from '../core/engine/state.ts';",
    "import { x } from '../../core/engine/deck.ts';",
    "export * from '../core/engine/index.ts';",
    "import type { X } from '../core/engine/types.ts';",
    "import { x } from '../ui/table/Seat.tsx';",
    "import { x } from '../workers/ai.worker.ts';",
    "import { useState } from 'react';",
  ];

  it.each(forbidden)('rejects %j', async (code) => {
    expect(await ruleIds(`${code}\nexport {};`, 'src/ai/postflop/sample.ts')).toContain(
      'no-restricted-imports',
    );
  });

  const allowed = [
    "import { x } from '../../core/cards/index.ts';",
    "import { x } from '../../core/eval/index.ts';",
    "import { x } from '../../core/equity/index.ts';",
    "import { x } from '../model/index.ts';",
    "import type { PlayerView } from '../../core/view/index.ts';",
  ];

  it.each(allowed)('allows %j', async (code) => {
    expect(await ruleIds(`${code}\nexport {};`, 'src/ai/postflop/sample.ts')).not.toContain(
      'no-restricted-imports',
    );
  });
});

describe('src/core purity (§4)', () => {
  const forbidden = [
    "import { useState } from 'react';",
    "import { x } from '../../ai/styles/index.ts';",
    "import { x } from '../../ui/table/Seat.tsx';",
    "import { x } from '../../i18n/index.ts';",
  ];

  it.each(forbidden)('rejects %j', async (code) => {
    expect(await ruleIds(`${code}\nexport {};`, 'src/core/engine/sample.ts')).toContain(
      'no-restricted-imports',
    );
  });
});

describe('seeded RNG is unreachable from production code (§4.1)', () => {
  const imports = [
    "import { SeededRng } from './seeded-rng.ts';",
    "import { SeededRng } from '../rng/seeded-rng.ts';",
    "import { SeededRng } from '../../core/rng/seeded-rng';",
  ];
  const files = [
    'src/core/rng/index.ts',
    'src/core/engine/sample.ts',
    'src/ai/model/sample.ts',
    'src/ui/table/Sample.tsx',
    'src/app/sample.ts',
    'src/app/debug/other.ts',
    'src/app/load-rng-factory.ts',
    'src/workers/sample.ts',
  ];

  for (const file of files) {
    it.each(imports)(`rejects %j in ${file}`, async (code) => {
      expect(await ruleIds(`${code}\nexport {};`, file)).toContain('no-restricted-imports');
    });
  }

  it('exempts only the e2e debug factory (ADR-022)', async () => {
    const code = "import { SeededRng } from '../../core/rng/seeded-rng.ts';\nexport {};";
    expect(await ruleIds(code, 'src/app/debug/seeded-factory.ts')).not.toContain(
      'no-restricted-imports',
    );
  });

  it('allows it in tests', async () => {
    const code = "import { SeededRng } from '../../src/core/rng/seeded-rng.ts';\nexport {};";
    expect(await ruleIds(code, 'tests/unit/sample.test.ts')).not.toContain('no-restricted-imports');
  });
});

describe('i18n literal ban (§2.7)', () => {
  it('rejects hardcoded text in UI components', async () => {
    const code = 'export function A() {\n  return <p>Desistir</p>;\n}\n';
    expect(await ruleIds(code, 'src/ui/table/Sample.tsx')).toContain('no-restricted-syntax');
  });

  it('allows text rendered from expressions', async () => {
    const code = 'export function A({ label }: { label: string }) {\n  return <p>{label}</p>;\n}\n';
    expect(await ruleIds(code, 'src/ui/table/Sample.tsx')).not.toContain('no-restricted-syntax');
  });
});
