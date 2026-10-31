// Bundles src/ into one self-contained index.html.
// node_modules stays out of Google Drive: set DEPS to a folder holding three and esbuild.
//   DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deps = process.env.DEPS || root;
const require = createRequire(join(deps, 'package.json'));
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false,
  nodePaths: [join(deps, 'node_modules')], legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const face = (family, file, weight, style) => {
  const b = readFileSync(join(root, 'assets/fonts', file)).toString('base64');
  return `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${b}) format("woff2")}`;
};
const fonts = face('IM Fell English', 'IMFellEnglish-400.woff2', 400, 'normal')
  + face('IM Fell English', 'IMFellEnglish-400i.woff2', 400, 'italic');
const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*__FONTS__*/', () => fonts)
  .replace('/*__CSS__*/', () => readFileSync(join(root, 'src/style.css'), 'utf8'))
  .replace('/*__JS__*/', () => js);
writeFileSync(join(root, 'index.html'), html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
