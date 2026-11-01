// Bundles src/ into one self-contained index.html.
//   DEPS=/path/to/deps node tools/build.mjs
// DEPS is a folder with three, esbuild and the @fontsource packages in node_modules.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const deps = process.env.DEPS || root;
const require = createRequire(join(deps, 'package.json'));
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2021'], write: false,
  nodePaths: [join(deps, 'node_modules')], legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');

const fp = (pkg, f) => join(deps, 'node_modules/@fontsource', pkg, 'files', f);
const face = (family, file, style = 'normal', weight = 400, range = '') => `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format("woff2")${range ? `;unicode-range:${range}` : ''}}`;
const GREEK = 'U+0370-03FF';
const fonts = [
  face('Instrument Serif', fp('instrument-serif', 'instrument-serif-latin-400-normal.woff2')),
  face('Instrument Serif', fp('instrument-serif', 'instrument-serif-latin-400-italic.woff2'), 'italic'),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-latin-400-normal.woff2')),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-latin-400-italic.woff2'), 'italic'),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-latin-500-normal.woff2'), 'normal', 500),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-latin-700-normal.woff2'), 'normal', 700),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-greek-400-normal.woff2'), 'normal', 400, GREEK),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-greek-400-italic.woff2'), 'italic', 400, GREEK),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-greek-500-normal.woff2'), 'normal', 500, GREEK),
  face('Ysabeau Office', fp('ysabeau-office', 'ysabeau-office-greek-700-normal.woff2'), 'normal', 700, GREEK),
].join('');

const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*FONTS*/', () => fonts)
  .replace('/*CSS*/', () => readFileSync(join(root, 'src/style.css'), 'utf8'))
  .replace('/*JS*/', () => js);
writeFileSync(join(root, 'index.html'), html);
console.log(`index.html ${(html.length / 1024 / 1024).toFixed(2)} MB`);
