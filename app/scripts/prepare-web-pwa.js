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