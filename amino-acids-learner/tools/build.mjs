// Bundles src/ into one self-contained index.html.
// Run tools/build.sh, which keeps node_modules outside Google Drive.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const three = join(process.env.AMINO_DEPS, 'node_modules/three/build/three.module.js');

const js = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true, minify: true, write: false, format: 'iife', target: ['es2020', 'safari15'],
  alias: { three }, legalComments: 'eof',
});
const css = await build({
  entryPoints: [join(root, 'src/style.css')],
  bundle: true, minify: true, write: false, loader: { '.woff2': 'dataurl' }, target: ['safari15'],
});

const page = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*__CSS__*/', () => css.outputFiles[0].text)
  .replace('/*__JS__*/', () => js.outputFiles[0].text.replaceAll('</script', '<\\/script'));
writeFileSync(join(root, 'index.html'), page);
console.log(`index.html ${(page.length / 1024).toFixed(0)} KB`);
