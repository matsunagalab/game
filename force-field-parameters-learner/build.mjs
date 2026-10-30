// Bundles src/ into one self-contained index.html.
// node_modules is kept out of Google Drive: set DEPS to a folder with three, esbuild and the @fontsource packages.
//   DEPS=/some/local/folder node build.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const deps = process.env.DEPS || here;
const require = createRequire(join(deps, 'package.json'));
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [join(here, 'src/main.js')],
  bundle: true, minify: true, format: 'iife', target: ['es2022'], write: false,
  nodePaths: [join(deps, 'node_modules')], legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');

const fp = (pkg, f) => join(deps, 'node_modules/@fontsource', pkg, 'files', f);
const face = (family, file, style = 'normal', weight = 400, range = '') => {
  const b = readFileSync(file).toString('base64');
  return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;${range ? `unicode-range:${range};` : ''}src:url(data:font/woff2;base64,${b}) format("woff2")}`;
};
const fonts = [
  face('Old Standard TT', fp('old-standard-tt', 'old-standard-tt-latin-400-normal.woff2')),
  face('Old Standard TT', fp('old-standard-tt', 'old-standard-tt-latin-400-italic.woff2'), 'italic'),
  face('Old Standard TT', fp('old-standard-tt', 'old-standard-tt-latin-700-normal.woff2'), 'normal', 700),
  face('STIX Greek', fp('stix-two-text', 'stix-two-text-greek-400-normal.woff2')),
  face('STIX Greek', fp('stix-two-text', 'stix-two-text-greek-400-italic.woff2'), 'italic'),
  face('Caveat', fp('caveat', 'caveat-latin-400-normal.woff2')),
  face('Courier Prime', fp('courier-prime', 'courier-prime-latin-400-normal.woff2')),
].join('');

const html = readFileSync(join(here, 'src/index.html'), 'utf8')
  .replace('/*FONTS*/', () => fonts)
  .replace('/*CSS*/', () => readFileSync(join(here, 'src/style.css'), 'utf8'))
  .replace('/*JS*/', () => js);
writeFileSync(join(here, 'index.html'), html);
console.log(`index.html ${(html.length / 1024 / 1024).toFixed(2)} MB`);
