#!/usr/bin/env node
// Build once; generated portals never load a CSS compiler or font CDN.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const repo = path.resolve(__dirname, '..');
const marker = '// BEGIN GENERATED PORTAL UTILITIES';
const endMarker = '// END GENERATED PORTAL UTILITIES';
const generatorPath = path.join(repo, 'js/generator.js');
const original = fs.readFileSync(generatorPath, 'utf8');
const source = original.replace(new RegExp('\\n?' + marker + '[\\s\\S]*?' + endMarker + '\\n?'), '\n');
const palette = ['slate','gray','zinc','neutral','stone','red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'];
const shades = [50,100,200,300,400,500,600,700,800,900,950];
const safelist = palette.flatMap(color => shades.flatMap(shade => ['from-' + color + '-' + shade, 'to-' + color + '-' + shade]));
const themeColors = Object.fromEntries(['primary','primary-light','secondary','accent','accent-dark','menu','menu-light','dark','light','success','warning','danger','muted','border','card','page-bg'].map(name => [name, 'rgb(var(--portal-' + name + '-rgb) / <alpha-value>)']));
const content = [source, ...['defaults.js','program-runtime.js','portal-templates.js'].map(name => fs.readFileSync(path.join(repo,'js',name),'utf8'))].map(raw => ({ raw, extension:'html' }));
const config = { content, safelist, theme: { extend: { colors: themeColors, fontWeight: Object.fromEntries([100,200,300,400,500,600,700,800,900].map(weight => [weight, String(weight)])), spacing: { '4.5':'1.125rem' } } }, corePlugins: { preflight: true } };
(async () => {
  const result = await postcss([tailwind(config)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: undefined });
  // Preserve CSS tokens/quoted content; only discard compiler comments.
  const css = result.css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n').trim();
  const block = '\n' + marker + '\n// Rebuild with npm run build:portal-css. Do not edit this string manually.\nconst LPG_PORTAL_UTILITIES_CSS = ' + JSON.stringify(css) + ';\n' + endMarker + '\n';
  const next = source.trimEnd() + '\n' + block;
  if (process.argv.includes('--check')) {
    if (next !== original) { console.error('Portal CSS is stale. Run npm run build:portal-css.'); process.exitCode=1; }
    else console.log('Portal CSS is current (' + Buffer.byteLength(css) + ' bytes).');
  } else { fs.writeFileSync(generatorPath,next); console.log('Embedded ' + Buffer.byteLength(css) + ' bytes of portal CSS.'); }
})().catch(error => { console.error(error); process.exitCode=1; });
