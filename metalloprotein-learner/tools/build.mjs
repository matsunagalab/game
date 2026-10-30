// Builds one self-contained HTML file: index.html.
// Run tools/build.sh, which keeps node_modules outside Google Drive.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.GAME_ROOT;
const deps = process.env.GAME_DEPS;

const js = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true, minify: true, write: false, format: 'iife', target: ['es2021', 'safari15'],
  alias: {
    three: join(deps, 'node_modules/three/build/three.module.js'),
    'three/addons': join(deps, 'node_modules/three/examples/jsm'),
  },
  loader: { '.json': 'json' }, legalComments: 'none', logLevel: 'warning',
});
const css = await build({
  entryPoints: [join(root, 'src/style.css')],
  bundle: true, minify: true, write: false, loader: { '.woff2': 'dataurl' }, target: ['safari15'], logLevel: 'warning',
});

const page = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('<!--STYLE-->', () => `<style>${css.outputFiles[0].text}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${js.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
writeFileSync(join(root, 'index.html'), page);
console.log(`index.html ${(page.length / 1024 / 1024).toFixed(2)} MB`);
