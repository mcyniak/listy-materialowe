// Rozpakowywanie paczek .zip ze skanami - w przeglądarce, bez bibliotek.
// Czyta spis plików z końca archiwum i rozpakowuje tylko skany (PDF, JPG, PNG),
// każdy osobno strumieniem, więc nawet duża paczka nie zapycha pamięci.

const TYPY = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const czyZip = plik => /\.zip$/i.test(plik.name) || /zip/.test(plik.type);
const rozszerzenie = nazwa => (nazwa.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

// Polski Windows zapisuje nazwy w ZIP-ach stroną kodową 852, jeśli nie oznaczy ich jako UTF-8.
const CP852 = 'ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´­˝˛ˇ˘§÷¸°¨˙űŘř■ ';

export function nazwaZBajtow(bajty, utf8) {
  if (utf8) return new TextDecoder().decode(bajty);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bajty); } catch { /* nie UTF-8 */ }
  return Array.from(bajty, b => b < 128 ? String.fromCharCode(b) : CP852[b - 128]).join('');
}

/** Spis plików w archiwum: [{nazwa, metoda, szyfrowany, rozmiar, offset}] */
async function spis(plik) {
  const ogon = Math.min(plik.size, 65557);
  const koniec = new DataView(await plik.slice(plik.size - ogon).arrayBuffer());
  let eocd = -1;
  for (let i = koniec.byteLength - 22; i >= 0; i--) if (koniec.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('To nie jest poprawny plik ZIP.');
  let ile = koniec.getUint16(eocd + 10, true);
  let rozmiarSpisu = koniec.getUint32(eocd + 12, true);
  let poczatekSpisu = koniec.getUint32(eocd + 16, true);
  if (poczatekSpisu === 0xffffffff || ile === 0xffff) { // ZIP64
    const lok = eocd - 20;
    if (lok < 0 || koniec.getUint32(lok, true) !== 0x07064b50) throw new Error('Nieobsługiwany rodzaj pliku ZIP.');
    const z64 = new DataView(await plik.slice(Number(koniec.getBigUint64(lok + 8, true)), plik.size).arrayBuffer());
    ile = Number(z64.getBigUint64(32, true));
    rozmiarSpisu = Number(z64.getBigUint64(40, true));
    poczatekSpisu = Number(z64.getBigUint64(48, true));
  }
  const s = new DataView(await plik.slice(poczatekSpisu, poczatekSpisu + rozmiarSpisu).arrayBuffer());
  const wpisy = [];
  for (let p = 0, n = 0; n < ile && p + 46 <= s.byteLength; n++) {
    if (s.getUint32(p, true) !== 0x02014b50) throw new Error('Uszkodzony plik ZIP.');
    const flagi = s.getUint16(p + 8, true);
    const dlNazwy = s.getUint16(p + 28, true), dlExtra = s.getUint16(p + 30, true), dlKom = s.getUint16(p + 32, true);
    let rozmiar = s.getUint32(p + 24, true), spakowany = s.getUint32(p + 20, true), offset = s.getUint32(p + 42, true);
    // Pole ZIP64 w "extra": kolejno rozmiar, rozmiar spakowany, offset - tylko te, które w nagłówku mają 0xFFFFFFFF.
    for (let e = p + 46 + dlNazwy; e + 4 <= p + 46 + dlNazwy + dlExtra;) {
      const id = s.getUint16(e, true), dl = s.getUint16(e + 2, true);
      if (id === 1) {
        let q = e + 4;
        if (rozmiar === 0xffffffff) { rozmiar = Number(s.getBigUint64(q, true)); q += 8; }
        if (spakowany === 0xffffffff) { spakowany = Number(s.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) offset = Number(s.getBigUint64(q, true));
      }
      e += 4 + dl;
    }
    const nazwa = nazwaZBajtow(new Uint8Array(s.buffer, s.byteOffset + p + 46, dlNazwy), flagi & 0x800);
    wpisy.push({ nazwa, metoda: s.getUint16(p + 10, true), szyfrowany: !!(flagi & 1), rozmiar, spakowany, offset });
    p += 46 + dlNazwy + dlExtra + dlKom;
  }
  return wpisy;
}

async function rozpakujWpis(plik, w) {
  const lh = new DataView(await plik.slice(w.offset, w.offset + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('Uszkodzony plik ZIP.');
  const start = w.offset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  // Rozmiar spakowany z nagłówka lokalnego bywa zerem (zapis strumieniowy), więc bierzemy go ze spisu.
  let dane = plik.slice(start, start + w.spakowany);
  if (w.metoda === 8) dane = await new Response(dane.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  else if (w.metoda !== 0) throw new Error('Nieobsługiwany sposób kompresji.');
  return dane;
}

/**
 * Wyciąga skany z paczki ZIP (także z paczek w paczce).
 * @returns {Promise<{pliki: File[], pominiete: string[]}>} pominiete - pliki, których nie dało się odczytać
 */
export async function rozpakujZip(plik) {
  const pliki = [], pominiete = [];
  for (const w of await spis(plik)) {
    // Windows (Compress-Archive) bywa, że oddziela foldery znakiem "\" zamiast "/".
    const nazwa = w.nazwa.split(/[\\/]/).pop();
    if (!nazwa || w.nazwa.startsWith('__MACOSX') || nazwa.startsWith('.')) continue;
    const roz = rozszerzenie(nazwa);
    if (!TYPY[roz] && roz !== 'zip') continue;
    if (w.szyfrowany) { pominiete.push(nazwa); continue; }
    try {
      const dane = await rozpakujWpis(plik, w);
      if (roz === 'zip') {
        const wewn = await rozpakujZip(new File([dane], nazwa, { type: 'application/zip' }));
        pliki.push(...wewn.pliki); pominiete.push(...wewn.pominiete);
      } else pliki.push(new File([dane], nazwa, { type: TYPY[roz] }));
    } catch { pominiete.push(nazwa); }
  }
  return { pliki, pominiete };
}
