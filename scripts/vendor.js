// Przygotowuje biblioteki dla przeglądarki w public/vendor (bez CDN).
// Uruchom po `npm install`: npm run vendor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const katalog = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLIKI = [
  // ExcelJS - plik .xlsx z formatowaniem (kolory, zamrożony nagłówek, liczby).
  ['node_modules/exceljs/dist/exceljs.min.js', 'public/vendor/exceljs.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'public/vendor/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/vendor/pdf.worker.min.mjs'],
  // Czcionka interfejsu (licencja OFL), ta sama co w aplikacji audytowej.
  ['node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'public/vendor/inter-latin.woff2'],
  ['node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'public/vendor/inter-latin-ext.woff2']
];

fs.mkdirSync(path.join(katalog, 'public/vendor'), { recursive: true });
for (const [z, doCelu] of PLIKI) {
  fs.copyFileSync(path.join(katalog, z), path.join(katalog, doCelu));
  console.log(`skopiowano ${doCelu}`);
}

// SDK Claude jest pakietem npm - pakujemy go do jednego modułu ES.
await build({
  stdin: { contents: "export { default } from '@anthropic-ai/sdk';", resolveDir: katalog },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  outfile: path.join(katalog, 'public/vendor/anthropic.mjs'), logLevel: 'warning'
});
console.log('zbudowano public/vendor/anthropic.mjs');
