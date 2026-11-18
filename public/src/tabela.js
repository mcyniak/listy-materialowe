// Zamiana odczytanych skanów na wiersze tabeli i plik .xlsx.
// Moduł bez zależności od przeglądarki - testowany w Node.

export const KOLUMNY = [
  ['plik', 'Plik', 28],
  ['adres', 'Adres', 36],
  ['moc', 'Moc', 8],
  ['data', 'Data', 11],
  ['ekipa', 'Ekipa', 14],
  ['wzor', 'Wzór', 24],
  ['strona', 'Strona', 7],
  ['sekcja', 'Sekcja', 22],
  ['pozycja', 'Pozycja', 50],
  ['jednostka', 'Jedn.', 6],
  ['ilosc', 'Ilość', 10],
  ['dodatkowo', 'Dodatkowo', 10],
  ['zaznaczenie', 'Zaznaczenie', 14],
  ['poprawka', 'Poprawka', 22],
  ['dopisane', 'Dopisane ręcznie', 9],
  ['pewnosc', 'Pewność odczytu', 10],
  ['uwagi', 'Uwagi', 30]
];

const NAGLOWEK = ['adres', 'moc', 'data', 'ekipa', 'wzor'];

/** Jeden wiersz na pozycję; każdy wiersz niesie adres i resztę nagłówka swojej listy. */
export function wiersze(skany) {
  const wynik = [];
  for (const skan of skany) {
    if (!skan.wynik) continue;
    const wspolne = { plik: skan.nazwa };
    for (const k of NAGLOWEK) wspolne[k] = skan.wynik[k] ?? '';
    for (const p of skan.wynik.pozycje) {
      wynik.push({ ...wspolne, ...p, dopisane: p.dopisane ? 'tak' : '' });
    }
  }
  return wynik;
}

/** Skoroszyt z jednym arkuszem "Pozycje". Wszystko jako tekst - "1+1" czy "1-2" mają zostać dosłownie. */
export function skoroszyt(XLSX, skany) {
  const dane = [KOLUMNY.map(k => k[1])];
  for (const w of wiersze(skany)) {
    dane.push(KOLUMNY.map(([klucz]) => (klucz === 'strona' ? w.strona : String(w[klucz] ?? ''))));
  }
  const ark = XLSX.utils.aoa_to_sheet(dane);
  ark['!cols'] = KOLUMNY.map(k => ({ wch: k[2] }));
  ark['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dane.length - 1, c: KOLUMNY.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ark, 'Pozycje');
  return wb;
}

export function nazwaPliku(data = new Date()) {
  const d = n => String(n).padStart(2, '0');
  return `Listy materiałowe ${data.getFullYear()}-${d(data.getMonth() + 1)}-${d(data.getDate())} ` +
    `${d(data.getHours())}-${d(data.getMinutes())}.xlsx`;
}
