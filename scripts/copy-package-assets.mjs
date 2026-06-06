import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packagePath = process.argv[2];

if (!packagePath) {
  globalThis.console.error('Usage: node scripts/copy-package-assets.mjs <package-path>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packageDir = path.resolve(repoRoot, packagePath);
const sourceDir = path.join(packageDir, 'src');
const distDir = path.join(packageDir, 'dist');
const assets = ['styles.css'];

mkdirSync(distDir, { recursive: true });

for (const assetName of assets) {
  const sourcePath = path.join(sourceDir, assetName);
  if (!existsSync(sourcePath)) continue;

  cpSync(sourcePath, path.join(distDir, assetName));
}
