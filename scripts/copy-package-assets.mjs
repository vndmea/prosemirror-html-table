import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const packagePath = process.argv[2];

if (!packagePath) {
  globalThis.console.error('Usage: node scripts/copy-package-assets.mjs <package-path>');
  process.exit(1);
}

const cwd = process.cwd();
const sourceDir = path.join(cwd, packagePath, 'src');
const distDir = path.join(cwd, packagePath, 'dist');
const assets = ['styles.css'];

mkdirSync(distDir, { recursive: true });

for (const assetName of assets) {
  const sourcePath = path.join(sourceDir, assetName);
  if (!existsSync(sourcePath)) continue;

  cpSync(sourcePath, path.join(distDir, assetName));
}
