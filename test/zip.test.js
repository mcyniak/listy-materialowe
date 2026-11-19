import test from 'node:test';
import assert from 'node:assert/strict';
import { rozpakujZip, nazwaZBajtow, czyZip } from '../public/src/zip.js';

// Minimalny zapis ZIP (bez CRC - czytnik go nie sprawdza), żeby nie dokładać biblioteki do testów.
async function zrobZip(pliki) {
  const czesci = [], spis = [];
  let offset = 0;
  for (const { nazwa, dane, deflate = true, utf8 = true } of pliki) {
    const n = typeof nazwa === 'string' ? new TextEncoder().encode(nazwa) : nazwa;
    const surowe = typeof dane === 'string' ? new TextEncoder().encode(dane) : dane;
    const spak = deflate ? new Uint8Array(await new Response(new Blob([surowe]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : surowe;
    const naglowek = (podpis, dl) => { const v = new DataView(new ArrayBuffer(dl)); v.setUint32(0, podpis, true); return v; };
    const lh = naglowek(0x04034b50, 30);
    lh.setUint16(6, utf8 ? 0x800 : 0, true); lh.setUint16(8, deflate ? 8 : 0, true);
    lh.setUint32(18, spak.length, true); lh.setUint32(22, surowe.length, true); lh.setUint16(26, n.length, true);
    const ch = naglowek(0x02014b50, 46);
    ch.setUint16(8, utf8 ? 0x800 : 0, true); ch.setUint16(10, deflate ? 8 : 0, true);
    ch.setUint32(20, spak.length, true); ch.setUint32(24, surowe.length, true); ch.setUint16(28, n.length, true);
    ch.setUint32(42, offset, true);
    czesci.push(lh, n, spak); spis.push(ch, n);
    offset += 30 + n.length + spak.length;
  }
  const rozmiarSpisu = spis.reduce((a, c) => a + c.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, pliki.length, true); e.setUint16(10, pliki.length, true);
  e.setUint32(12, rozmiarSpisu, true); e.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...czesci, ...spis, e]).arrayBuffer());
}

test('rozpoznaje paczkę ZIP po nazwie albo typie', () => {
  assert.ok(czyZip({ name: 'Skany.ZIP', type: '' }));
  assert.ok(czyZip({ name: 'x', type: 'application/x-zip-compressed' }));
  assert.ok(!czyZip({ name: 'a.pdf', type: 'application/pdf' }));
});

test('nazwy: UTF-8 oraz polska strona kodowa 852 z Windows', () => {
  assert.equal(nazwaZBajtow(new TextEncoder().encode('Śrem łąka.pdf'), false), 'Śrem łąka.pdf');
  assert.equal(nazwaZBajtow(Uint8Array.from([0x97, 0x72, 0x65, 0x6d, 0x20, 0x88, 0xa5, 0x6b, 0x61, 0xbe]), false), 'Śrem łąkaż');
});

test('wyciąga skany (też z folderów i paczki w paczce), pomija inne pliki', async () => {
  const wewnetrzna = await zrobZip([{ nazwa: 'c.png', dane: 'PNG' }]);
  const zip = await zrobZip([
    { nazwa: 'a.pdf', dane: '%PDF-1.4 aaaa' },
    { nazwa: 'folder/', dane: '', deflate: false },
    { nazwa: 'folder/b.JPG', dane: 'JPEG', deflate: false },
    { nazwa: Uint8Array.from([0x9d, 0x6f, 0x64, 0x7a, 0x2e, 0x70, 0x64, 0x66]), dane: '%PDF', utf8: false },
    { nazwa: 'opis.txt', dane: 'nie skan' },
    { nazwa: '__MACOSX/._a.pdf', dane: 'x' },
    { nazwa: 'wiecej.zip', dane: wewnetrzna, deflate: false }
  ]);
  const { pliki, pominiete } = await rozpakujZip(new File([zip], 'paczka.zip'));
  assert.deepEqual(pliki.map(p => [p.name, p.type]), [
    ['a.pdf', 'application/pdf'], ['b.JPG', 'image/jpeg'], ['Łodz.pdf', 'application/pdf'], ['c.png', 'image/png']
  ]);
  assert.equal(await pliki[0].text(), '%PDF-1.4 aaaa');
  assert.deepEqual(pominiete, []);
});

test('plik, który nie jest ZIP-em, daje czytelny błąd', async () => {
  await assert.rejects(rozpakujZip(new File(['to nie zip'], 'x.zip')), /nie jest poprawny plik ZIP/);
});
