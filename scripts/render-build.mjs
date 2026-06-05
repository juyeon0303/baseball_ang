/**
 * Render one-shot build. NODE_ENV=production on Render skips devDeps during npm ci;
 * this script forces dev tooling (nest, vite) to install and uses node paths (no PATH).
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const installEnv = {
  ...process.env,
  NPM_CONFIG_PRODUCTION: 'false',
};

function run(cmd, cwd = root, env = installEnv) {
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...installEnv, ...env } });
}

console.log('[render-build] installing dependencies...');
run('npm ci');

console.log('[render-build] API (nest)...');
run('node node_modules/@nestjs/cli/bin/nest.js build');

console.log('[render-build] Playball app (vite)...');
const appDir = join(root, 'app');
run('npm install', appDir);
run('node node_modules/vite/bin/vite.js build', appDir);

console.log('[render-build] Baseball stock web (vite, /stock/)...');
const webDir = join(root, 'web');
run('npm install', webDir);
run('node node_modules/vite/bin/vite.js build', webDir, {
  STOCK_BASE: 'stock',
});

console.log('[render-build] done.');
