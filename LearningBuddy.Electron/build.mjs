// Bundles the main process, the sandboxed preload and the renderers into dist/.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const assets = path.resolve(root, '..', 'assets');
export const renderers = ['main', 'companion', 'bubble', 'invitation', 'image'];

export async function buildApp() {
  await rm(dist, { recursive: true, force: true });

  const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2023', jsx: 'automatic' };

  await Promise.all([
    build({
      ...common,
      entryPoints: [path.join(root, 'src/main/main.ts')],
      outfile: path.join(dist, 'main/main.js'),
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
    }),
    // Sandboxed preloads must be a single CommonJS file that only requires "electron".
    build({
      ...common,
      entryPoints: [path.join(root, 'src/preload/preload.ts')],
      outfile: path.join(dist, 'preload/preload.js'),
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
    }),
    ...renderers.map((name) =>
      build({
        ...common,
        entryPoints: [path.join(root, `src/renderer/${name}/${name}.ts`)],
        outfile: path.join(dist, `renderer/${name}/${name}.js`),
        platform: 'browser',
        format: 'iife',
      })),
  ]);

  for (const name of renderers) {
    for (const file of ['index.html', 'styles.css']) {
      await cp(path.join(root, `src/renderer/${name}/${file}`), path.join(dist, `renderer/${name}/${file}`));
    }
  }

  await cp(path.join(root, 'src/renderer/styles'), path.join(dist, 'renderer/styles'), { recursive: true });
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await cp(path.join(assets, 'app.ico'), path.join(dist, 'assets/app.ico'));
  await cp(path.join(assets, 'fonts'), path.join(dist, 'assets/fonts'), { recursive: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildApp();
}
