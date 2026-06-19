import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('S1000D package release checks', () => {
  it('declares the expected package metadata and build entries', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      files?: string[];
      exports?: Record<string, unknown>;
      scripts?: Record<string, string>;
      publishConfig?: { access?: string; provenance?: boolean };
      sideEffects?: boolean;
    };
    const tsupConfigSource = readFileSync(new URL('../tsup.config.js', import.meta.url), 'utf8');

    expect(packageJson.sideEffects).toBe(false);
    expect(packageJson.files).toContain('dist');
    expect(packageJson.files).toContain('README.md');
    expect(packageJson.files).toContain('LICENSE');
    expect(packageJson.exports?.['.']).toBeDefined();
    expect(packageJson.exports?.['./clipboard.js']).toBeDefined();
    expect(packageJson.exports?.['./renderer.js']).toBeDefined();
    expect(packageJson.exports?.['./tiptap.js']).toBeDefined();
    expect(packageJson.scripts?.prepack).toBe('npm run build');
    expect(packageJson.publishConfig?.access).toBe('public');
    expect(packageJson.publishConfig?.provenance).toBe(true);

    expect(tsupConfigSource).toContain("'src/index.ts'");
    expect(tsupConfigSource).toContain("'src/clipboard.ts'");
    expect(tsupConfigSource).toContain("'src/renderer.ts'");
    expect(tsupConfigSource).toContain("'src/tiptap.ts'");
  });

  it('ships a package-local LICENSE for npm files coverage', () => {
    const licenseText = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');

    expect(licenseText).toContain('MIT License');
  });
});
