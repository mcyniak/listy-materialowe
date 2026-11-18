import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { wiersze, skoroszyt, nazwaPliku, KOLUMNY } from '../public/src/tabela.js';
import { SCHEMAT } from '../public/src/odczyt.js';

const poz = (nadpisz) => ({
  strona: 1, sekcja: 'FALOWNIKI', pozycja: 'P3-10.0-SH', jednostka: 'szt', ilosc: '1+1', dodatkowo: '',
  zaznaczenie: '', poprawka: '', dopisane: false, pewnosc: 'wysoka', uwagi: '', ...nadpisz
});

// Dane fikcyjne - repo może być publiczne.
const skany = [
  { nazwa: 'a.pdf', stan: 'gotowe', wynik: { wzor: 'LISTA MATERIAŁOWA', adres: 'Testowa 1 / Próbna 2', moc: '10KW', data: '', ekipa: '', pozycje: [
    poz(),
    poz({ pozycja: 'Klips do kabla', sekcja: 'Dopisane', ilosc: '300', dopisane: true, pewnosc: 'srednia' }),
    poz({ pozycja: 'Rozłącznik', ilosc: '1-2', zaznaczenie: '25A' })
  ] } },
  { nazwa: 'b.pdf', stan: 'czeka' },
  { nazwa: 'c.pdf', stan: 'gotowe', wynik: { wzor: 'ŚLESIN PV', adres: 'Inna 5', moc: '', data: '', ekipa: '', pozycje: [poz({ ilosc: '31' })] } }
];

test('każdy wiersz ma adres swojej listy, pominięte skany bez wyniku', () => {
  const w = wiersze(skany);
  assert.equal(w.length, 4);
  assert.deepEqual(w.map(x => x.adres), ['Testowa 1 / Próbna 2', 'Testowa 1 / Próbna 2', 'Testowa 1 / Próbna 2', 'Inna 5']);
  assert.equal(w[1].dopisane, 'tak');
  assert.equal(w[0].dopisane, '');
});

test('xlsx zapisuje ilości dosłownie jako tekst', () => {
  const wb = skoroszyt(XLSX, skany);
  const bufor = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const ark = XLSX.read(bufor, { type: 'buffer' }).Sheets.Pozycje;
  const dane = XLSX.utils.sheet_to_json(ark, { header: 1, raw: true });
  assert.deepEqual(dane[0], KOLUMNY.map(k => k[1]));
  const ilosc = KOLUMNY.findIndex(k => k[0] === 'ilosc');
  assert.deepEqual(dane.slice(1).map(r => r[ilosc]), ['1+1', '300', '1-2', '31']);
  assert.equal(ark[XLSX.utils.encode_cell({ r: 3, c: ilosc })].t, 's');
  assert.equal(dane.length, 5);
});

test('nazwa pliku z datą i godziną', () => {
  assert.equal(nazwaPliku(new Date(2026, 10, 18, 9, 5)), 'Listy materiałowe 2026-11-18 09-05.xlsx');
});

test('schemat: każde pole wymagane, bez dodatkowych pól (wymóg structured outputs)', () => {
  const sprawdz = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(sprawdz);
    }
    if (s.type === 'array') sprawdz(s.items);
  };
  sprawdz(SCHEMAT);
});


test('tryby jak w OZC: Haiku domyślnie, Opus dokładnie; koszt z progiem 100 tys. tokenów', async () => {
  const { TRYBY } = await import('../public/src/odczyt.js');
  assert.equal(TRYBY.szybki.model, 'claude-haiku-5-5');
  assert.equal(TRYBY.szybki.fallbacks, false);
  assert.equal(TRYBY.dokladny.model, 'claude-opus-5-5');
  assert.ok(Math.abs(TRYBY.szybki.cena({ input_tokens: 70000, output_tokens: 4000 }) - 0.009) < 1e-9);
  assert.ok(Math.abs(TRYBY.szybki.cena({ input_tokens: 120000, output_tokens: 4000 }) - 0.07) < 1e-9);
  assert.ok(Math.abs(TRYBY.dokladny.cena({ input_tokens: 70000, output_tokens: 4000 }) - 0.36) < 1e-9);
});
