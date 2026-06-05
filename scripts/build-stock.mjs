import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.STOCK_BASE = 'stock';
execSync('npm install --include=dev', { cwd: join(root, 'web'), stdio: 'inherit' });
execSync('npm run build', {
  cwd: join(root, 'web'),
  stdio: 'inherit',
  env: { ...process.env, STOCK_BASE: 'stock' },
});
