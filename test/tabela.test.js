import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { wiersze, skoroszyt, nazwaPliku, liczba, nazwaZWariantem, uporzadkuj, razem } from '../public/src/tabela.js';
import { SCHEMAT } from '../public/src/odczyt.js';

const poz = (nadpisz) => ({
  strona: 1, sekcja: 'FALOWNIKI', pozycja: 'P3-10.0-SH', jednostka: 'szt', ilosc: '2', dodatkowo: '',
  zaznaczenie: '', poprawka: '', dopisane: false, pewnosc: 'wysoka', uwagi: '', ...nadpisz
});

// Dane fikcyjne - repo jest publiczne.
const skany = () => [
  { nazwa: 'a.pdf', stan: 'gotowe', wynik: { wzor: 'LISTA', adres: 'Testowa 1', moc: '10KW', data: '', ekipa: '', pozycje: [
    poz({ ilosc: '1+1' }),
    poz({ pozycja: 'Klips do kabla', sekcja: 'Dopisane', ilosc: '300', dopisane: true, pewnosc: 'srednia', uwagi: 'może 800' }),
    poz({ pozycja: 'UCHWYT ZAMYK. CZARNY / U-25 / U-32 /', zaznaczenie: 'U-25', ilosc: '200', dodatkowo: '200' })
  ] } },
  { nazwa: 'b.pdf', stan: 'czeka' },
  { nazwa: 'c.pdf', stan: 'gotowe', wynik: { wzor: 'ŚLESIN PV', adres: 'Inna 5', moc: '', data: '', ekipa: '', pozycje: [
    poz({ ilosc: '31' }), poz({ pozycja: 'Kabel', jednostka: 'mb', ilosc: 'ok. 50' })
  ] } }
];
const uporzadkowane = () => { const s = skany(); s.forEach(x => x.wynik && uporzadkuj(x.wynik)); return s; };

test('liczby: zwykłe, z przecinkiem, sumy, z jednostką; reszta zostaje tekstem', () => {
  assert.deepEqual(liczba('31'), { wartosc: 31, notatka: '' });
  assert.deepEqual(liczba(' 2,5 '), { wartosc: 2.5, notatka: '' });
  assert.deepEqual(liczba('1+1'), { wartosc: 2, notatka: 'na kartce: 1+1' });
  assert.deepEqual(liczba('25 + 22'), { wartosc: 47, notatka: 'na kartce: 25 + 22' });
  assert.deepEqual(liczba('1 st'), { wartosc: 1, notatka: 'na kartce: 1 st' });
  assert.deepEqual(liczba('ok. 50'), { wartosc: 'ok. 50', notatka: '' });
  assert.deepEqual(liczba(''), { wartosc: null, notatka: '' });
});

test('zakreślony wariant zastępuje listę wariantów w nazwie (przykłady ze skanów)', () => {
  assert.equal(nazwaZWariantem('UCHWYT ZAMYK. CZARNY / U-25 / U-32 /', 'U-25'), 'UCHWYT ZAMYK. CZARNY U-25');
  assert.equal(nazwaZWariantem('ROZŁĄCZNIK IZOLACYJNY / 16A / 25A / 40A /', '25A'), 'ROZŁĄCZNIK IZOLACYJNY 25A');
  assert.equal(nazwaZWariantem('SKRZYNKA MONTAŻOWA IP 65 / 8M / 12M / 18M /', '8M'), 'SKRZYNKA MONTAŻOWA IP 65 8M');
  assert.equal(nazwaZWariantem('RURA KARBOW CZARN UV+PILOT / FI 25 / FI 32 /', 'FI 25, 32'), 'RURA KARBOW CZARN UV+PILOT FI 25 / FI 32');
  assert.equal(nazwaZWariantem('RURA ELEK SZTYWNA BIAŁA / RL 22 / RL 32 /(1 SZT.=3 MB)', 'RL 32'), 'RURA ELEK SZTYWNA BIAŁA RL 32 (1 SZT.=3 MB)');
  assert.equal(nazwaZWariantem('ZŁĄCZE KRZYŻOWE 4 OTWOROWE / DUŻE / MAŁE /', 'DUŻE, MAŁE'), 'ZŁĄCZE KRZYŻOWE 4 OTWOROWE DUŻE / MAŁE');
  // bez zaznaczenia albo zaznaczenie już w nazwie - bez zmian
  assert.equal(nazwaZWariantem('UCHWYT ZAMYK. CZARNY / U-25 / U-32 /', ''), 'UCHWYT ZAMYK. CZARNY / U-25 / U-32 /');
  assert.equal(nazwaZWariantem('Falownik FoxESS 10kW, hybrydowy', '10kW'), 'Falownik FoxESS 10kW, hybrydowy');
});

test('uporzadkuj zachowuje nazwę z wydruku i działa tylko raz', () => {
  const w = { pozycje: [poz({ pozycja: 'UCHWYT / U-25 / U-32 /', zaznaczenie: 'U-32' })] };
  uporzadkuj(w); uporzadkuj(w);
  assert.equal(w.pozycje[0].pozycja, 'UCHWYT U-32');
  assert.equal(w.pozycje[0].nazwaNaDruku, 'UCHWYT / U-25 / U-32 /');
});

test('każdy wiersz ma adres; ilości jako liczby, notatka o sumie w uwagach', () => {
  const w = wiersze(uporzadkowane());
  assert.equal(w.length, 5);
  assert.deepEqual(w.map(x => x.adres), ['Testowa 1', 'Testowa 1', 'Testowa 1', 'Inna 5', 'Inna 5']);
  assert.deepEqual(w.map(x => x.ilosc), [2, 300, 200, 31, 'ok. 50']);
  assert.equal(w[0].uwagi, 'na kartce: 1+1');
  assert.equal(w[1].uwagi, 'może 800');
  assert.equal(w[1].sprawdzic, true);
  assert.equal(w[2].pozycja, 'UCHWYT ZAMYK. CZARNY U-25');
});

test('arkusz Razem sumuje tę samą pozycję z różnych list', () => {
  const r = razem(wiersze(uporzadkowane()));
  const p3 = r.find(x => x.pozycja === 'P3-10.0-SH');
  assert.equal(p3.ilosc, 33);
  assert.equal(p3.list, 2);
  assert.match(r.find(x => x.pozycja === 'Kabel').uwagi, /nieliczbowe/);
});

test('Excel: liczby jako liczby, nagłówek zamrożony i kolorowy, puste kolumny ukryte', async () => {
  const wb = skoroszyt(ExcelJS, uporzadkowane());
  const bufor = await wb.xlsx.writeBuffer();
  const wczytany = new ExcelJS.Workbook();
  await wczytany.xlsx.load(bufor);
  const ark = wczytany.getWorksheet('Pozycje');
  const naglowki = ark.getRow(1).values.slice(1);
  assert.ok(naglowki.includes('Moc') && naglowki.includes('Dodatkowo'));
  assert.ok(!naglowki.includes('Data') && !naglowki.includes('Ekipa') && !naglowki.includes('Poprawka na kartce'));
  const kIlosc = naglowki.indexOf('Ilość') + 1;
  assert.equal(ark.getCell(2, kIlosc).value, 2);
  assert.equal(typeof ark.getCell(5, kIlosc).value, 'number');
  assert.equal(ark.getCell(6, kIlosc).value, 'ok. 50');
  assert.equal(ark.getRow(1).getCell(1).font.bold, true);
  assert.equal(ark.views[0].state, 'frozen');
  assert.ok(wczytany.getWorksheet('Razem'));
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

test('Excel: liczby bez własnego formatu (w polskim Excelu "0.###" dawało "31,")', async () => {
  const wb = skoroszyt(ExcelJS, uporzadkowane());
  for (const ark of wb.worksheets) ark.eachRow(r => r.eachCell(c => assert.ok(!c.numFmt, `${ark.name}!${c.address}: ${c.numFmt}`)));
});
