// Odczytane skany -> wiersze tabeli -> sformatowany plik Excel (ExcelJS).
// Moduł bez zależności od przeglądarki - testowany w Node.
import { ZRODLO } from './tabela-materialowa.js';

// --- liczby ----------------------------------------------------------------------
const LICZBA = String.raw`\d+(?:[.,]\d+)?`;
const tylkoLiczba = new RegExp(`^${LICZBA}$`);
const suma = new RegExp(`^${LICZBA}(?:\\s*\\+\\s*${LICZBA})+$`);
const zJednostka = new RegExp(`^(${LICZBA})\\s*(?:szt|sztuk|st|mb|m|op|kpl|kg)\\.?$`, 'i');
const naLiczbe = s => Number(s.replace(',', '.'));

/**
 * Wpis z kartki -> liczba do Excela. "31" -> 31; "1+1" -> 2 (z notatką, co było na kartce);
 * "1 st" -> 1 (z notatką). Wpis, który nie jest liczbą, zostaje tekstem.
 * @returns {{wartosc: number|string|null, notatka: string}}
 */
export function liczba(tekst) {
  const s = String(tekst ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { wartosc: null, notatka: '' };
  if (tylkoLiczba.test(s)) return { wartosc: naLiczbe(s), notatka: '' };
  if (suma.test(s)) {
    const w = s.split('+').reduce((a, x) => a + naLiczbe(x.trim()), 0);
    return { wartosc: Math.round(w * 1000) / 1000, notatka: `na kartce: ${s}` };
  }
  const j = s.match(zJednostka);
  if (j) return { wartosc: naLiczbe(j[1]), notatka: `na kartce: ${s}` };
  return { wartosc: s, notatka: '' };
}

// --- nazwa z zakreślonym wariantem --------------------------------------------------
const norm = s => s.toLowerCase().replace(/[\s.]/g, '');

/**
 * "UCHWYT ZAMYK. CZARNY / U-25 / U-32 /" + zakreślone "U-25" -> "UCHWYT ZAMYK. CZARNY U-25".
 * Dopiski w nawiasie, np. "(1 SZT.=3 MB)", zostają.
 */
export function nazwaZWariantem(nazwa, zaznaczenie) {
  const nazwaT = String(nazwa ?? '').trim();
  const wybrane = String(zaznaczenie ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!wybrane.length) return nazwaT;

  const czesci = nazwaT.split('/').map(s => s.trim()).filter(Boolean);
  const warianty = czesci.slice(1).filter(c => !c.startsWith('('));
  const nawiasy = czesci.slice(1).filter(c => c.startsWith('('));
  const trafione = new Set();
  for (const w of wybrane) {
    const n = norm(w);
    const pasuje = warianty.find(c => norm(c) === n) ?? warianty.find(c => norm(c).endsWith(n)) ?? warianty.find(c => norm(c).includes(n));
    if (pasuje) trafione.add(pasuje);
  }
  if (trafione.size) {
    return [czesci[0], warianty.filter(c => trafione.has(c)).join(' / '), ...nawiasy].join(' ');
  }
  // Brak listy wariantów - dopisz zaznaczenie, chyba że już jest w nazwie.
  const brakujace = wybrane.filter(w => !norm(nazwaT).includes(norm(w)));
  return brakujace.length ? `${nazwaT} ${brakujace.join(', ')}` : nazwaT;
}

/** Po odczycie: nazwa pozycji z zakreślonym wariantem (wydruk zostaje w nazwaNaDruku). */
export function uporzadkuj(wynik) {
  for (const p of wynik.pozycje) {
    p.nazwaNaDruku ??= p.pozycja;
    p.pozycja = nazwaZWariantem(p.pozycja, p.zaznaczenie);
  }
  return wynik;
}

// --- wiersze ----------------------------------------------------------------------
/** Jeden wiersz na pozycję; każdy wiersz niesie adres i resztę nagłówka swojej listy. */
export function wiersze(skany) {
  const wynik = [];
  skany.forEach((skan, nrSkanu) => {
    if (!skan.wynik) return;
    const w = skan.wynik;
    for (const p of w.pozycje) {
      const il = liczba(p.ilosc);
      const dod = liczba(p.dodatkowo);
      const uwagi = [il.notatka, dod.notatka && `dodatkowo ${dod.notatka}`, p.uwagi].filter(Boolean).join('; ');
      wynik.push({
        nrSkanu, plik: skan.nazwa, adres: w.adres ?? '', moc: w.moc ?? '', data: w.data ?? '', ekipa: w.ekipa ?? '',
        sekcja: p.sekcja ?? '', pozycja: p.pozycja ?? '', jednostka: p.jednostka ?? '',
        ilosc: il.wartosc, dodatkowo: dod.wartosc, poprawka: p.poprawka ?? '', uwagi,
        sprawdzic: p.pewnosc !== 'wysoka'
      });
    }
  });
  return wynik;
}

// --- Excel ------------------------------------------------------------------------
// [klucz, nagłówek, szerokość, opcje]; "opcjonalna" = kolumna znika, gdy w całej tabeli jest pusta.
export const KOLUMNY = [
  ['adres', 'Adres', 40, { zawijaj: true }],
  ['moc', 'Moc', 9, { opcjonalna: true }],
  ['data', 'Data', 11, { opcjonalna: true }],
  ['ekipa', 'Ekipa', 14, { opcjonalna: true }],
  ['sekcja', 'Sekcja', 22, { zawijaj: true }],
  ['pozycja', 'Pozycja', 50, { zawijaj: true }],
  ['jednostka', 'Jedn.', 7, { srodek: true }],
  ['ilosc', 'Ilość', 9, { liczba: true }],
  ['dodatkowo', 'Dodatkowo', 11, { liczba: true, opcjonalna: true }],
  ['poprawka', 'Poprawka na kartce', 22, { zawijaj: true, opcjonalna: true }],
  ['uwagi', 'Uwagi', 34, { zawijaj: true }],
  ['sprawdzic', 'Do sprawdzenia', 12, { srodek: true }],
  ['plik', 'Plik skanu', 28, {}]
];

const KOLOR = {
  marka: 'FFCF171F', bialy: 'FFFFFFFF', pas: 'FFF5F6F8', uwaga: 'FFFEF4E6', uwagaTekst: 'FFB54708',
  linia: 'FFE3E5EA', granica: 'FF98A2B3', szary: 'FF667085'
};
const wypelnienie = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const pusta = v => v === null || v === undefined || v === '' || v === false;

function naglowek(arkusz) {
  const r = arkusz.getRow(1);
  r.height = 30;
  r.eachCell(c => {
    c.font = { bold: true, color: { argb: KOLOR.bialy } };
    c.fill = wypelnienie(KOLOR.marka);
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  arkusz.views = [{ state: 'frozen', ySplit: 1 }];
}

function arkuszPozycji(wb, dane) {
  const kolumny = KOLUMNY.filter(([k, , , o]) => !o.opcjonalna || dane.some(w => !pusta(w[k])));
  const ark = wb.addWorksheet('Pozycje');
  ark.columns = kolumny.map(([key, header, width]) => ({ key, header, width }));
  naglowek(ark);

  let poprzedni = null;
  let pas = false;
  for (const w of dane) {
    const nowaLista = poprzedni !== null && w.nrSkanu !== poprzedni;
    if (nowaLista) pas = !pas;
    const r = ark.addRow({ ...w, sprawdzic: w.sprawdzic ? 'tak' : '' });
    kolumny.forEach(([k, , , o], i) => {
      const c = r.getCell(i + 1);
      c.alignment = { vertical: 'top', wrapText: !!o.zawijaj, horizontal: o.srodek ? 'center' : o.liczba ? 'right' : 'left' };
      if (k === 'ilosc') c.font = { bold: true };
      if (k === 'plik' || k === 'uwagi') c.font = { color: { argb: KOLOR.szary } };
      if (w.sprawdzic) c.fill = wypelnienie(KOLOR.uwaga);
      else if (pas) c.fill = wypelnienie(KOLOR.pas);
      c.border = {
        bottom: { style: 'thin', color: { argb: KOLOR.linia } },
        ...(nowaLista ? { top: { style: 'medium', color: { argb: KOLOR.granica } } } : {})
      };
      if (k === 'sprawdzic' && w.sprawdzic) c.font = { bold: true, color: { argb: KOLOR.uwagaTekst } };
    });
    poprzedni = w.nrSkanu;
  }
  ark.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kolumny.length } };
}

/** Suma każdej pozycji ze wszystkich list (tylko wpisy liczbowe). */
export function razem(dane) {
  const mapa = new Map();
  for (const w of dane) {
    const klucz = `${w.pozycja.trim().toLowerCase()}|${w.jednostka.trim().toLowerCase()}`;
    const r = mapa.get(klucz) ?? { pozycja: w.pozycja, jednostka: w.jednostka, ilosc: 0, dodatkowo: 0, adresy: new Set(), tekstowe: 0 };
    for (const k of ['ilosc', 'dodatkowo']) {
      if (typeof w[k] === 'number') r[k] += w[k];
      else if (!pusta(w[k])) r.tekstowe++;
    }
    r.adresy.add(w.nrSkanu);
    mapa.set(klucz, r);
  }
  return [...mapa.values()].map(r => ({
    pozycja: r.pozycja, jednostka: r.jednostka, ilosc: Math.round(r.ilosc * 1000) / 1000,
    dodatkowo: Math.round(r.dodatkowo * 1000) / 1000, list: r.adresy.size,
    uwagi: r.tekstowe ? `${r.tekstowe} wpis(y) nieliczbowe - nie wliczone, zobacz arkusz Pozycje` : ''
  }));
}

function arkuszRazem(wb, dane) {
  const suma = razem(dane);
  const zDodatkowo = suma.some(r => r.dodatkowo);
  const kolumny = [
    { key: 'pozycja', header: 'Pozycja', width: 50 },
    { key: 'jednostka', header: 'Jedn.', width: 7 },
    { key: 'ilosc', header: 'Ilość razem', width: 12 },
    ...(zDodatkowo ? [{ key: 'dodatkowo', header: 'Dodatkowo razem', width: 14 }] : []),
    { key: 'list', header: 'Na ilu listach', width: 13 },
    { key: 'uwagi', header: 'Uwagi', width: 40 }
  ];
  const ark = wb.addWorksheet('Razem');
  ark.columns = kolumny;
  naglowek(ark);
  suma.forEach((w, i) => {
    const r = ark.addRow({ ...w, dodatkowo: w.dodatkowo || null });
    r.eachCell({ includeEmpty: true }, (c, nr) => {
      const k = kolumny[nr - 1]?.key;
      c.alignment = { vertical: 'top', wrapText: k === 'pozycja' || k === 'uwagi', horizontal: k === 'jednostka' || k === 'list' ? 'center' : undefined };
      if (k === 'ilosc') c.font = { bold: true };
      if (k === 'uwagi') c.font = { color: { argb: KOLOR.szary } };
      if (i % 2) c.fill = wypelnienie(KOLOR.pas);
      c.border = { bottom: { style: 'thin', color: { argb: KOLOR.linia } } };
    });
  });
  ark.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kolumny.length } };
}

/** Skoroszyt: "Pozycje" (wiersz na pozycję z adresem) i "Razem" (suma każdego materiału). */
export function skoroszyt(ExcelJS, skany) {
  const dane = wiersze(skany);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Listy materiałowe';
  wb.created = new Date();
  arkuszPozycji(wb, dane);
  arkuszRazem(wb, dane);
  return wb;
}

export function nazwaPliku(data = new Date()) {
  const d = n => String(n).padStart(2, '0');
  return `Listy materiałowe ${data.getFullYear()}-${d(data.getMonth() + 1)}-${d(data.getDate())} ` +
    `${d(data.getHours())}-${d(data.getMinutes())}.xlsx`;
}

// --- Tabela materiałowa inwestycji (Arkusz Google, wspólny z aplikacją Audyt) ---

const teraz = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Wiersze arkusza Pozycje tabeli materiałowej - te same dane co arkusz Pozycje w Excelu. */
export function pozycjeDoTabeli(skany, rodzaj, zapisano = teraz()) {
  return wiersze(skany).map(w => ({
    Adres: w.adres, Rodzaj: rodzaj, 'Źródło': ZRODLO.lista, Sekcja: w.sekcja, Pozycja: w.pozycja, 'Jedn.': w.jednostka,
    'Ilość': w.ilosc ?? '', Dodatkowo: w.dodatkowo ?? '', Uwagi: w.uwagi, Data: w.data, Ekipa: w.ekipa, Moc: w.moc,
    'Do sprawdzenia': w.sprawdzic ? 'tak' : '', Plik: w.plik, Zapisano: zapisano
  }));
}

/** Wiersze z poprzedniego zapisu tych samych skanów - do zastąpienia. */
export const czyStaryWiersz = nazwyPlikow => {
  const nazwy = new Set(nazwyPlikow);
  return w => w['Źródło'] === ZRODLO.lista && nazwy.has(w.Plik);
};
