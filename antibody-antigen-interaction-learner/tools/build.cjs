// Bundles everything into one file, index.html, that opens with a double-click.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodePaths = (process.env.NODE_PATH || '').split(':').filter(Boolean);
const moduleDir = [...nodePaths, path.join(root, 'node_modules')].find(d => fs.existsSync(path.join(d, 'three')));

const font = (family, weight, file) => {
  const b64 = fs.readFileSync(path.join(moduleDir, '@fontsource', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
};
const fonts = [
  font('Bagel Fat One', 400, 'bagel-fat-one/files/bagel-fat-one-latin-400-normal.woff2'),
  font('Atkinson Hyperlegible', 400, 'atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2'),
  font('Atkinson Hyperlegible', 700, 'atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2'),
].join('');

const js = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', minify: true, target: 'es2022', write: false, nodePaths,
}).outputFiles[0].text;
const css = esbuild.transformSync(fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'), {loader: 'css', minify: true}).code;

let html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => fonts + css).replace('/*__JS__*/', () => js.replace(/<\/script/g, '<\\/script'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
