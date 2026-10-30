// Builds one self-contained HTML file: index.html.
// Usage: node tools/build.mjs [entry.js] [out.html]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.argv[2] ?? 'src/main.js';
const out = process.argv[3] ?? 'index.html';
const work = join(tmpdir(), `psl-build-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(join(root, dirname(out)), { recursive: true });

const esbuild = (...args) => execFileSync('npx', ['--yes', 'esbuild@0.28.2', ...args], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
esbuild(entry, '--bundle', '--format=iife', '--minify', '--target=es2021', '--log-level=warning', `--outfile=${join(work, 'app.js')}`);
esbuild('src/style.css', '--bundle', '--minify', '--loader:.woff2=dataurl', '--log-level=warning', `--outfile=${join(work, 'app.css')}`);

const js = readFileSync(join(work, 'app.js'), 'utf8').replaceAll('</script', '<\\/script');
const css = readFileSync(join(work, 'app.css'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('<!--STYLE-->', () => `<style>${css}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
writeFileSync(join(root, out), html);
console.log(out, (html.length / 1024 / 1024).toFixed(2), 'MB');
