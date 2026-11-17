const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const tags = [
  ['rel="apple-touch-icon"', '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />'],
  ['rel="manifest"', '<link rel="manifest" href="/manifest.webmanifest" />'],
  ['rel="icon" type="image/png"', '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />'],
  ['apple-mobile-web-app-title', '<meta name="apple-mobile-web-app-title" content="LPT Coach" />'],
];

for (const [marker, tag] of tags) {
  if (html.includes(marker)) continue;
  const updated = html.replace('</head>', `  ${tag}\n</head>`);
  if (updated === html) throw new Error('Could not find </head> in the exported web HTML.');
  html = updated;
}

fs.writeFileSync(htmlPath, html);

// Identificativo univoco di questa build: finisce in sw.js, version.json e nel <meta> di index.html.
// L'app confronta il proprio con quello pubblicato e, se diverso, propone l'aggiornamento.
const BUILD_ID = process.env.CF_PAGES_COMMIT_SHA
  ? `${process.env.CF_PAGES_COMMIT_SHA.slice(0, 10)}-${Date.now().toString(36)}`
  : Date.now().toString(36);

const swSrc = path.join(__dirname, '..', 'public', 'sw.js');
const swDest = path.join(__dirname, '..', 'dist', 'sw.js');
if (fs.existsSync(swSrc)) {
  fs.writeFileSync(swDest, fs.readFileSync(swSrc, 'utf8').split('__BUILD_ID__').join(BUILD_ID));
}
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'version.json'), JSON.stringify({ version: BUILD_ID, builtAt: new Date().toISOString() }));
let indexHtml = fs.readFileSync(htmlPath, 'utf8');
indexHtml = indexHtml.replace(/<meta name="app-version"[^>]*>\s*/g, '').replace('</head>', `  <meta name="app-version" content="${BUILD_ID}" />\n</head>`);
fs.writeFileSync(htmlPath, indexHtml);

// Cloudflare Pages: niente cache per i file che decidono l'aggiornamento
const headersPath = path.join(__dirname, '..', 'dist', '_headers');
const headerRules = `/sw.js\n  Cache-Control: no-cache\n/version.json\n  Cache-Control: no-store\n/index.html\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n`;
fs.writeFileSync(headersPath, `${fs.existsSync(headersPath) ? `${fs.readFileSync(headersPath, 'utf8')}\n` : ''}${headerRules}`);
console.log(`Build PWA ${BUILD_ID}`);
// Pagina di ritorno OAuth Strava: inserisce l'URL del Worker usato dalla build.
const callbackPath = path.join(__dirname, '..', 'dist', 'strava-callback.html');
if (fs.existsSync(callbackPath)) {
  const apiBase = process.env.EXPO_PUBLIC_API_BASE || 'https://lpt-worker.gc-jack1997.workers.dev';
  fs.writeFileSync(callbackPath, fs.readFileSync(callbackPath, 'utf8').replace('__API_BASE__', apiBase));
}

// Cloudflare Pages non pubblica le cartelle chiamate "node_modules": Expo esporta li' i font delle icone
// (dist/assets/node_modules/@expo/vector-icons/...), quindi in produzione le icone diventavano rettangoli
// con la X. Sposta gli asset in "assets/vendor" e aggiorna i riferimenti nei file generati.
const distDir = path.join(__dirname, '..', 'dist');
const fromAssets = path.join(distDir, 'assets', 'node_modules');
const toAssets = path.join(distDir, 'assets', 'vendor');
if (fs.existsSync(fromAssets)) {
  fs.cpSync(fromAssets, toAssets, { recursive: true });
  fs.rmSync(fromAssets, { recursive: true, force: true });
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  let rewritten = 0;
  for (const file of walk(distDir)) {
    if (!/\.(js|html|json|css|map)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('/assets/node_modules/')) continue;
    fs.writeFileSync(file, text.split('/assets/node_modules/').join('/assets/vendor/'));
    rewritten += 1;
  }
  console.log(`Asset spostati in assets/vendor (${rewritten} file aggiornati)`);
}
