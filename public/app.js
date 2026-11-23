import { otworzSkan } from './src/strony.js';
import { czyZip, rozpakujZip } from './src/zip.js';
import { odczytajSkan } from './src/odczyt.js';
import { skoroszyt, nazwaPliku, uporzadkuj, pozycjeDoTabeli, czyStaryWiersz } from './src/tabela.js';
import * as google from './src/google.js';
import * as tabelaMat from './src/tabela-materialowa.js';
import { DYSK } from './config.js';

const KLUCZ_LS = 'listy-materialowe:klucz';
const ROWNOLEGLE = 4;

const $ = id => document.getElementById(id);
/** @type {{id:number, nazwa:string, plik:File, stan:'czeka'|'czyta'|'gotowe'|'blad', blad?:string,
 *   zrodlo?:any, wynik?:any, kosztUSD?:number, tryb?:string, sekund?:number}[]} */
const skany = [];
let wybrany = null;
let licznik = 0;
let pobranoPoZmianach = true;

// Ikony (stałe teksty SVG - bezpieczne do innerHTML).
const IKONA = {
  plik: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  kosz: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  uwaga: '<svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  lupa: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
};

function el(tag, wlasciwosci = {}, ...dzieci) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(wlasciwosci)) {
    if (k === 'ikona') e.insertAdjacentHTML('afterbegin', IKONA[v]);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e[k] = v;
  }
  for (const d of dzieci) if (d != null) e.append(d);
  return e;
}

function pokazKomunikat(tekst) {
  const k = $('komunikat');
  k.textContent = tekst;
  k.classList.add('widoczny');
  clearTimeout(pokazKomunikat.t);
  pokazKomunikat.t = setTimeout(() => k.classList.remove('widoczny'), 4000);
}

const niepewne = skan => skan.wynik ? skan.wynik.pozycje.filter(p => p.pewnosc !== 'wysoka').length : 0;
const pozycji = n => `${n} ${n === 1 ? 'pozycja' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'pozycje' : 'pozycji'}`;
const zmieniono = () => { pobranoPoZmianach = false; };

// --- ustawienia (klucz dostępu) ----------------------------------------------
function czytajKlucz() { try { return localStorage.getItem(KLUCZ_LS) || ''; } catch { return ''; } }

function otworzUstawienia() {
  $('klucz').value = czytajKlucz();
  const koszt = skany.reduce((a, s) => a + (s.kosztUSD || 0), 0);
  $('koszt-sesji').textContent = koszt ? `Koszt odczytów w tej sesji: ok. ${koszt.toFixed(2).replace('.', ',')} USD.` : '';
  $('ustawienia').showModal();
}
$('otworz-ustawienia').addEventListener('click', otworzUstawienia);
$('ustawienia').addEventListener('close', () => {
  if ($('ustawienia').returnValue !== 'zapisz') return;
  try { localStorage.setItem(KLUCZ_LS, $('klucz').value.trim()); } catch { /* tryb prywatny */ }
  pokazKomunikat($('klucz').value.trim() ? 'Zapisano ustawienia.' : 'Usunięto klucz dostępu.');
  rysowanyPodglad = null;
  odswiez();
});

// --- dodawanie plików ----------------------------------------------------------
async function dodajPliki(pliki) {
  pliki = [...pliki];
  const zDysku = [], problemy = [];
  let zipow = 0;
  for (const plik of pliki) {
    if (!czyZip(plik)) { zDysku.push(plik); continue; }
    zipow++;
    pokazKomunikat(`Rozpakowuję ${plik.name}…`);
    try {
      const { pliki: wyjete, pominiete } = await rozpakujZip(plik);
      zDysku.push(...wyjete);
      problemy.push(...pominiete);
      if (!wyjete.length) problemy.push(`${plik.name} (brak skanów w środku)`);
    } catch { problemy.push(plik.name); }
  }
  let dodane = 0;
  for (const plik of zDysku) {
    if (!(plik.type === 'application/pdf' || plik.type.startsWith('image/'))) continue;
    if (skany.some(s => s.nazwa === plik.name && s.plik.size === plik.size)) continue;
    skany.push({ id: ++licznik, nazwa: plik.name, plik, stan: 'czeka' });
    dodane++;
  }
  if (problemy.length) pokazKomunikat(`Nie udało się otworzyć: ${problemy.join(', ')}.`);
  else if (!dodane && pliki.length) pokazKomunikat('Te pliki są już na liście albo to nie są skany (PDF, JPG, PNG, ZIP).');
  else if (zipow) pokazKomunikat(`Dodano ${dodane} ${dodane === 1 ? 'skan' : dodane % 10 >= 2 && dodane % 10 <= 4 && (dodane % 100 < 10 || dodane % 100 >= 20) ? 'skany' : 'skanów'}.`);
  if (!wybrany && skany.length) wybrany = skany[0].id;
  odswiez();
}
$('pliki').addEventListener('change', e => { dodajPliki(e.target.files); e.target.value = ''; });
const strefa = $('upuszczanie');
strefa.addEventListener('dragover', e => { e.preventDefault(); strefa.classList.add('nad'); });
strefa.addEventListener('dragleave', () => strefa.classList.remove('nad'));
strefa.addEventListener('drop', e => { e.preventDefault(); strefa.classList.remove('nad'); dodajPliki(e.dataTransfer.files); });
// Upuszczenie pliku obok strefy nie powinno otwierać go w przeglądarce.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files?.length) dodajPliki(e.dataTransfer.files); });

// --- odczyt --------------------------------------------------------------------
let wPartii = { razem: 0, gotowe: 0 };

async function odczytaj(skan, tryb = 'szybki') {
  skan.stan = 'czyta'; skan.blad = undefined; skan.tryb = tryb;
  const start = performance.now();
  odswiez();
  try {
    skan.zrodlo ??= await otworzSkan(skan.plik);
    rysowanyPodglad = null;
    if (wybrany === skan.id) rysujPodglad();
    const { wynik, kosztUSD } = await odczytajSkan({ klucz: czytajKlucz(), skan: skan.zrodlo, nazwaPliku: skan.nazwa, tryb });
    skan.sekund = Math.round((performance.now() - start) / 1000);
    // Koszt sumuje się, gdy skan czytano najpierw zwykle, a potem dokładnie.
    Object.assign(skan, { wynik: uporzadkuj(wynik), kosztUSD: (skan.kosztUSD || 0) + kosztUSD, stan: 'gotowe' });
    zmieniono();
  } catch (e) {
    console.error(e);
    skan.stan = 'blad';
    skan.blad = opisBledu(e);
  } finally {
    await skan.zrodlo?.zamknij();
  }
  odswiez();
}

function opisBledu(e) {
  const tekst = String(e?.message || e);
  if (e?.status === 401 || e?.status === 403) return 'Brak dostępu do usługi odczytu. Sprawdź klucz w Ustawieniach albo poproś administratora.';
  if (e?.status === 429 || e?.status === 529 || e?.status >= 500) return 'Usługa odczytu jest chwilowo zajęta. Spróbuj ponownie za chwilę.';
  if (/credit|billing|balance/i.test(tekst)) return 'Skończyły się środki na odczyt skanów. Powiedz administratorowi.';
  if (/fetch|network|connection/i.test(tekst) || e?.name === 'APIConnectionError') return 'Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.';
  if (/PDF|Obsługiwane/i.test(tekst)) return 'Nie udało się otworzyć pliku. Sprawdź, czy to poprawny skan PDF albo zdjęcie.';
  return 'Nie udało się odczytać tego skanu. Spróbuj ponownie.';
}

$('odczytaj').addEventListener('click', async () => {
  const kolejka = skany.filter(s => s.stan === 'czeka' || s.stan === 'blad');
  wPartii = { razem: kolejka.length, gotowe: 0 };
  const pracownik = async () => {
    while (kolejka.length) { await odczytaj(kolejka.shift()); wPartii.gotowe++; odswiezPrzyciski(); }
  };
  odswiezPrzyciski();
  await Promise.all(Array.from({ length: ROWNOLEGLE }, pracownik));
  const bledy = skany.filter(s => s.stan === 'blad').length;
  pokazKomunikat(bledy ? `Gotowe. ${bledy === 1 ? 'Jednego skanu' : `${bledy} skanów`} nie udało się odczytać.` : 'Gotowe. Sprawdź podświetlone pozycje i pobierz tabelę.');
});

$('pobierz').addEventListener('click', async () => {
  const gotowe = skany.filter(s => s.stan === 'gotowe');
  const nazwa = nazwaPliku();
  const bufor = await skoroszyt(window.ExcelJS, gotowe).xlsx.writeBuffer();
  const a = el('a', { download: nazwa, href: URL.createObjectURL(new Blob([bufor],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  pobranoPoZmianach = true;
  pokazKomunikat(`Zapisano tabelę „${nazwa}” w folderze Pobrane.`);
});

// --- zapis do Tabeli materiałowej inwestycji (Dysk Google) ---------------------
const KLUCZ_INWESTYCJI = 'listy-materialowe:inwestycja';
const KLUCZ_RODZAJU = 'listy-materialowe:rodzaj';
let inwestycje = null; // [{ id, nazwa }] z INWESTYCJE_3, wczytane raz na sesję
let wybranaInwestycja = (() => { try { return JSON.parse(localStorage.getItem(KLUCZ_INWESTYCJI)); } catch { return null; } })();
google.zaladujBiblioteke().catch(() => { /* bez internetu - komunikat przy zapisie */ });

function opisBleduGoogle(e) {
  const tekst = String(e?.message || e);
  if (e?.status === 403) return 'To konto Google nie ma prawa zapisu w folderze tej inwestycji (albo nie widzi dysku INWESTYCJE_3). Zaloguj się kontem firmowym albo poproś o uprawnienia „Edytujący”.';
  if (/przerwane|popup/i.test(tekst)) return 'Logowanie do Google przerwane. Kliknij „Zapisz w tabeli” jeszcze raz.';
  if (/fetch|network|połączenia/i.test(tekst)) return 'Brak połączenia z Google. Sprawdź internet i spróbuj ponownie.';
  return `Nie udało się zapisać w tabeli (${tekst}).`;
}

function rysujInwestycje() {
  const fraza = $('szukaj-inwestycji').value.trim().toLowerCase();
  const lista = inwestycje || (wybranaInwestycja ? [wybranaInwestycja] : []);
  const widoczne = lista.filter(i => !fraza || i.nazwa.toLowerCase().includes(fraza));
  $('lista-inwestycji').replaceChildren(...(widoczne.length ? widoczne.map(i => {
    const b = el('button', { type: 'button', textContent: i.nazwa });
    b.setAttribute('aria-pressed', String(i.id === wybranaInwestycja?.id));
    b.addEventListener('click', () => {
      wybranaInwestycja = { id: i.id, nazwa: i.nazwa };
      try { localStorage.setItem(KLUCZ_INWESTYCJI, JSON.stringify(wybranaInwestycja)); } catch { /* tryb prywatny */ }
      rysujInwestycje();
    });
    return b;
  }) : inwestycje ? [el('p', { textContent: 'Brak inwestycji o tej nazwie.' })] : []));
}
$('szukaj-inwestycji').addEventListener('input', rysujInwestycje);

$('do-tabeli').addEventListener('click', async () => {
  $('stan-tabeli').textContent = '';
  $('szukaj-inwestycji').value = '';
  try { $('rodzaj-instalacji').value = localStorage.getItem(KLUCZ_RODZAJU) || 'PV'; } catch { /* tryb prywatny */ }
  rysujInwestycje();
  $('okno-tabeli').showModal();
  if (inwestycje) return;
  $('stan-tabeli').textContent = 'Wczytuję inwestycje z Dysku…';
  try {
    inwestycje = await google.listaInwestycji(DYSK.inwestycje);
    $('stan-tabeli').textContent = '';
  } catch (e) {
    console.error(e);
    $('stan-tabeli').textContent = opisBleduGoogle(e);
  }
  rysujInwestycje();
});

$('zapisz-w-tabeli').addEventListener('click', async () => {
  const gotowe = skany.filter(s => s.stan === 'gotowe');
  if (!wybranaInwestycja) { $('stan-tabeli').textContent = 'Wybierz inwestycję z listy.'; return; }
  const rodzaj = $('rodzaj-instalacji').value;
  try { localStorage.setItem(KLUCZ_RODZAJU, rodzaj); } catch { /* tryb prywatny */ }
  const przycisk = $('zapisz-w-tabeli');
  przycisk.disabled = true;
  $('stan-tabeli').textContent = 'Zapisuję w tabeli…';
  try {
    const id = await tabelaMat.tabelaMaterialowa(google, wybranaInwestycja.id);
    const { dopisano, usunieto } = await tabelaMat.zapiszPozycje(google, id, {
      nowe: pozycjeDoTabeli(gotowe, rodzaj),
      czyStary: czyStaryWiersz(gotowe.map(s => s.nazwa))
    });
    pobranoPoZmianach = true;
    $('okno-tabeli').close();
    pokazKomunikat(`Zapisano ${pozycji(dopisano)} w „Tabeli materiałowej” inwestycji ${wybranaInwestycja.nazwa}` +
      (usunieto ? ` (zastąpiły ${usunieto} wcześniej zapisanych z tych skanów).` : '.'));
  } catch (e) {
    console.error(e);
    $('stan-tabeli').textContent = opisBleduGoogle(e);
  } finally {
    przycisk.disabled = false;
  }
});

window.addEventListener('beforeunload', e => {
  if (!pobranoPoZmianach && skany.some(s => s.stan === 'gotowe')) e.preventDefault();
});

// --- lewa kolumna ----------------------------------------------------------------
function opisStanu(s) {
  if (s.stan === 'czeka') return ['', 'Czeka na odczyt'];
  if (s.stan === 'czyta') return ['czyta', s.tryb === 'dokladny' ? 'Czytam dokładnie…' : 'Czytam…'];
  if (s.stan === 'blad') return ['blad', 'Nie udało się odczytać'];
  const n = niepewne(s);
  return n ? ['do-sprawdzenia', `${pozycji(s.wynik.pozycje.length)} · ${n} do sprawdzenia`] : ['gotowe', `${pozycji(s.wynik.pozycje.length)} · gotowe`];
}

function rysujListe() {
  $('licznik').textContent = skany.length || '';
  $('lista').replaceChildren(...skany.map(s => {
    const [klasa, tekst] = opisStanu(s);
    const usun = el('button', { className: 'usun', ikona: 'x', title: 'Usuń z listy', type: 'button' });
    usun.addEventListener('click', e => {
      e.stopPropagation();
      skany.splice(skany.indexOf(s), 1);
      if (wybrany === s.id) wybrany = skany[0]?.id ?? null;
      odswiez();
    });
    usun.hidden = s.stan === 'czyta';
    const li = el('li', { className: s.id === wybrany ? 'wybrany' : '', title: s.nazwa },
      el('span', { className: 'ikona-pliku', ikona: 'plik' }),
      el('span', { className: 'opis-pliku' },
        el('span', { className: 'nazwa', textContent: s.wynik?.adres || s.nazwa }),
        el('span', { className: `stan ${klasa}` }, el('span', { className: 'kropka' }), tekst)),
      usun);
    li.addEventListener('click', () => { wybrany = s.id; odswiez(); });
    return li;
  }));
}

function odswiezPrzyciski() {
  const klucz = !!czytajKlucz();
  const doOdczytu = skany.filter(s => s.stan === 'czeka' || s.stan === 'blad').length;
  const czyta = skany.some(s => s.stan === 'czyta');
  const gotowe = skany.filter(s => s.stan === 'gotowe');

  const odczytaj = $('odczytaj');
  odczytaj.disabled = !klucz || !doOdczytu || czyta;
  odczytaj.textContent = czyta ? 'Czytam skany…' : doOdczytu ? `Odczytaj skany (${doOdczytu})` : 'Odczytaj skany';
  odczytaj.title = klucz ? '' : 'Najpierw wpisz klucz dostępu w Ustawieniach.';

  const pobierz = $('pobierz');
  pobierz.disabled = !gotowe.length;
  $('do-tabeli').disabled = !gotowe.length || czyta;
  pobierz.classList.toggle('gotowy', gotowe.length > 0 && !czyta);

  const postep = $('postep');
  postep.hidden = !czyta || wPartii.razem < 1;
  if (!postep.hidden) {
    const proc = Math.round(100 * wPartii.gotowe / wPartii.razem);
    $('postep-opis').textContent = `Odczytano ${wPartii.gotowe} z ${wPartii.razem}`;
    $('postep-proc').textContent = `${proc}%`;
    $('postep-wypelnienie').style.width = `${Math.max(4, proc)}%`;
  }

  const wszystkich = gotowe.reduce((a, s) => a + s.wynik.pozycje.length, 0);
  $('podsumowanie').textContent = gotowe.length && !czyta
    ? `W tabeli: ${gotowe.length} ${gotowe.length === 1 ? 'skan' : 'skanów'}, ${pozycji(wszystkich)}` : '';
}

// --- prawa część -----------------------------------------------------------------
let rysowanyPodglad = null;

function powitanie() {
  const bezKlucza = !czytajKlucz();
  const w = el('div', { className: 'powitanie' },
    el('h2', { textContent: 'Odczyt list materiałowych' }),
    el('p', { textContent: 'Program przepisuje odręczne ilości ze skanów list materiałowych do tabeli Excel.' }),
    el('div', { className: 'kroki' },
      ...[['Dodaj skany', 'Przeciągnij pliki PDF albo całą paczkę ZIP na pole po lewej albo kliknij je, by wybrać.'],
        ['Odczytaj', 'Kliknij „Odczytaj skany”. Jeden skan to zwykle kilkanaście sekund.'],
        ['Sprawdź i zapisz', 'Popraw pozycje podświetlone na pomarańczowo, pobierz Excel albo zapisz w Tabeli materiałowej inwestycji.']]
        .map(([t, o], i) => el('div', { className: 'krok' }, el('b', { textContent: i + 1 }), el('h3', { textContent: t }), el('p', { textContent: o })))));
  if (bezKlucza) {
    const b = el('button', { className: 'przycisk glowny', type: 'button', textContent: 'Wpisz klucz dostępu' });
    b.addEventListener('click', otworzUstawienia);
    w.append(el('p', { className: 'drobny', textContent: 'Na tym komputerze program nie jest jeszcze skonfigurowany.', style: 'margin-top:24px' }), b);
  }
  return w;
}

function rysujPodglad() {
  const skan = skany.find(s => s.id === wybrany);
  const podglad = $('podglad');
  if (!skan) {
    if (rysowanyPodglad !== 'powitanie') podglad.replaceChildren(powitanie());
    rysowanyPodglad = 'powitanie';
    return;
  }
  // Nie przerysowuj w trakcie edycji, gdy zmienia się tylko stan innych skanów.
  const klucz = `${skan.id}:${skan.stan}:${skan.tryb}:${!!skan.zrodlo}`;
  if (rysowanyPodglad === klucz) return;
  rysowanyPodglad = klucz;

  const strony = el('div', { className: 'strony' });
  if (skan.zrodlo) {
    strony.append(...skan.zrodlo.strony.map(s => el('div', { className: 'strona', id: `strona-${s.numer}` },
      el('p', { className: 'strona-etykieta', textContent: `Strona ${s.numer}` }),
      el('img', { src: s.dataUrl, alt: `Strona ${s.numer} skanu` }))));
  } else {
    strony.append(el('div', { className: 'komunikat-pusty' }, el('div', { className: 'krecek' })));
    otworzSkan(skan.plik).then(async z => {
      if (skan.zrodlo) { await z.zamknij(); return; }
      skan.zrodlo = z;
      if (skan.stan !== 'czyta') await z.zamknij();
      rysowanyPodglad = null;
      if (wybrany === skan.id) rysujPodglad();
    }).catch(e => { console.error(e); skan.stan = 'blad'; skan.blad = opisBledu(e); odswiez(); });
  }

  const dane = el('div', { className: 'dane' });
  if (skan.wynik && skan.stan !== 'czyta') dane.append(...edytor(skan));
  else if (skan.stan === 'czyta') dane.append(el('div', { className: 'komunikat-pusty' }, el('div', { className: 'krecek' }),
    el('h3', { textContent: skan.tryb === 'dokladny' ? 'Czytam skan dokładnie…' : 'Czytam skan…' }),
    el('p', { textContent: skan.tryb === 'dokladny' ? 'Dokładny odczyt trwa zwykle 1–2 minuty.' : 'Zwykle trwa to kilkanaście sekund.' })));
  else if (skan.stan === 'blad') {
    const ponow = el('button', { className: 'przycisk drugi', type: 'button', textContent: 'Spróbuj ponownie', style: 'margin-top:16px' });
    ponow.disabled = !czytajKlucz();
    ponow.addEventListener('click', () => odczytaj(skan, skan.tryb || 'szybki'));
    dane.append(el('div', { className: 'komunikat-pusty blad' }, el('h3', { textContent: 'Nie udało się odczytać skanu' }), el('p', { textContent: skan.blad }), ponow));
  } else dane.append(el('div', { className: 'komunikat-pusty' }, el('h3', { textContent: 'Skan czeka na odczyt' }),
    el('p', { textContent: 'Kliknij „Odczytaj skany” w lewym dolnym rogu.' })));

  podglad.replaceChildren(naglowekSkanu(skan), el('div', { className: 'robocze' }, strony, dane));
}

function naglowekSkanu(skan) {
  const w = skan.wynik;
  const lewa = el('div', { className: 'lewa' }, el('p', { className: 'plik-nazwa', textContent: w && skan.stan !== 'czyta' ? skan.nazwa : 'Skan' }));
  if (w && skan.stan !== 'czyta') {
    const adres = el('input', { className: 'adres', value: w.adres, placeholder: 'Adres', title: 'Adres - kliknij, aby poprawić' });
    adres.addEventListener('input', () => { w.adres = adres.value; zmieniono(); rysujListe(); });
    lewa.append(adres, el('div', { className: 'male-pola' }, ...[['moc', 'Moc'], ['data', 'Data'], ['ekipa', 'Ekipa']].map(([k, t]) => {
      const i = el('input', { value: w[k] ?? '' });
      i.addEventListener('input', () => { w[k] = i.value; zmieniono(); });
      return el('label', {}, t, i);
    })));
  } else lewa.append(el('p', { className: 'adres adres-tekst', textContent: skan.nazwa }));

  const prawa = el('div', { className: 'prawa' });
  if (w && skan.stan === 'gotowe') {
    const n = niepewne(skan);
    prawa.append(el('span', { className: `znaczek ${n ? 'uwaga' : 'ok'}`, ikona: n ? 'uwaga' : 'ok', id: 'znaczek' },
      n ? `${n} do sprawdzenia` : 'Wszystko sprawdzone'));
    if (skan.tryb !== 'dokladny') {
      const dokladniej = el('button', { className: 'przycisk drugi maly', type: 'button', ikona: 'lupa' }, 'Przeczytaj dokładniej');
      dokladniej.title = 'Ponowny, staranniejszy odczyt tego skanu - przydaje się, gdy dużo pozycji jest źle odczytanych.';
      dokladniej.disabled = !czytajKlucz();
      dokladniej.addEventListener('click', () => {
        if (confirm('Przeczytać ten skan jeszcze raz, dokładniej?\n\nTrwa to dłużej (1–2 minuty). Poprawki wpisane ręcznie w tym skanie zostaną zastąpione.')) odczytaj(skan, 'dokladny');
      });
      prawa.append(dokladniej);
    }
  }
  return el('div', { className: 'naglowek-skanu' }, lewa, prawa);
}

const KOLUMNY_EDYTORA = [
  ['pozycja', 'Pozycja'], ['jednostka', 'Jedn.'], ['ilosc', 'Ilość'], ['dodatkowo', 'Dodatkowo'],
  ['poprawka', 'Poprawka na kartce'], ['uwagi', 'Uwagi']
];

function pokazStrone(numer) {
  document.querySelectorAll('.strona.aktywna').forEach(e => e.classList.remove('aktywna'));
  const s = document.getElementById(`strona-${numer}`);
  if (!s) return;
  s.classList.add('aktywna');
  s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Kolumny pokazywane zawsze; pozostałe tylko, gdy w skanie coś w nich jest.
const ZAWSZE = new Set(['pozycja', 'jednostka', 'ilosc']);
const WIELOLINIOWE = new Set(['pozycja', 'uwagi', 'poprawka']);

function edytor(skan) {
  const w = skan.wynik;
  const kolumny = KOLUMNY_EDYTORA.filter(([k]) => ZAWSZE.has(k) || w.pozycje.some(p => String(p[k] ?? '').trim()));
  const tbody = el('tbody');
  const odswiezZnaczek = () => {
    const n = niepewne(skan);
    const z = document.getElementById('znaczek');
    if (z) {
      z.className = `znaczek ${n ? 'uwaga' : 'ok'}`;
      z.innerHTML = IKONA[n ? 'uwaga' : 'ok'];
      z.append(n ? `${n} do sprawdzenia` : 'Wszystko sprawdzone');
    }
    rysujListe();
  };

  const komorkaStatusu = (p, tr) => {
    const td = el('td', { className: 'status' });
    const rysuj = () => {
      tr.classList.toggle('niepewny', p.pewnosc !== 'wysoka');
      if (p.pewnosc === 'wysoka') { td.replaceChildren(el('span', { className: 'pewny', ikona: 'ok', title: 'Odczyt pewny' })); return; }
      const b = el('button', { className: 'sprawdz', type: 'button', ikona: 'ok', title: p.uwagi || 'Porównaj ze skanem i kliknij, gdy się zgadza' }, 'Zgadza się');
      b.addEventListener('click', () => { p.pewnosc = 'wysoka'; zmieniono(); rysuj(); odswiezZnaczek(); });
      td.replaceChildren(b);
    };
    rysuj();
    return td;
  };

  let numer = 0;
  const wiersz = p => {
    const tr = el('tr');
    tr.append(el('td', { className: 'nr', textContent: ++numer }));
    for (const [k] of kolumny) {
      const input = el(WIELOLINIOWE.has(k) ? 'textarea' : 'input', { value: p[k] ?? '', rows: 1 });
      input.addEventListener('input', () => { p[k] = input.value; zmieniono(); dopasujWysokosc(input); });
      if (k === 'pozycja') {
        tr.append(el('td', { className: 'komorka-pozycji' },
          el('span', { className: 'sekcja', textContent: p.sekcja || '' },
            p.dopisane ? el('span', { className: 'dopisek', textContent: 'dopisane ręcznie' }) : null),
          input));
      } else tr.append(el('td', { className: `k-${k}` }, input));
      // Przycisk "Zgadza się" zaraz przy ilości - widoczny także na mniejszych ekranach.
      if (k === 'ilosc') tr.append(komorkaStatusu(p, tr));
    }
    const kosz = el('button', { className: 'kosz', type: 'button', ikona: 'kosz', title: 'Usuń tę pozycję' });
    kosz.addEventListener('click', () => { w.pozycje.splice(w.pozycje.indexOf(p), 1); tr.remove(); zmieniono(); odswiezZnaczek(); odswiezPrzyciski(); });
    tr.append(el('td', {}, kosz));
    tr.addEventListener('focusin', () => pokazStrone(p.strona));
    tr.addEventListener('mouseenter', () => pokazStrone(p.strona));
    return tr;
  };

  let strona = null;
  for (const p of w.pozycje) {
    if (p.strona !== strona) {
      strona = p.strona;
      const nr = strona;
      const naglowek = el('tr', { className: 'strona-wiersz' }, el('td', { colSpan: kolumny.length + 3, textContent: `Strona ${nr}` }));
      naglowek.addEventListener('click', () => pokazStrone(nr));
      tbody.append(naglowek);
    }
    tbody.append(wiersz(p));
  }

  const tabela = el('div', { className: 'karta' }, el('table', { className: 'pozycje' },
    el('thead', {}, el('tr', {}, el('th', { textContent: '#' }),
      ...kolumny.flatMap(([k, t]) => k === 'ilosc' ? [el('th', { textContent: t }), el('th')] : [el('th', { textContent: t })]), el('th'))),
    tbody));

  const dodaj = el('button', { className: 'przycisk duch maly', type: 'button', ikona: 'plus' }, 'Dodaj pozycję');
  dodaj.addEventListener('click', () => {
    const ostatnia = w.pozycje.at(-1);
    const p = { strona: ostatnia?.strona ?? 1, sekcja: 'Dodane w programie', pozycja: '', jednostka: '', ilosc: '', dodatkowo: '',
      zaznaczenie: '', poprawka: '', dopisane: false, pewnosc: 'wysoka', uwagi: '' };
    w.pozycje.push(p);
    const tr = wiersz(p);
    tbody.append(tr);
    tr.querySelectorAll('textarea').forEach(dopasujWysokosc);
    tr.querySelector('textarea, input')?.focus();
    zmieniono(); rysujListe(); odswiezPrzyciski();
  });
  const pod = el('div', { className: 'pod-tabela' }, dodaj,
    el('p', { textContent: w.pozycje.length ? 'Najedź na pozycję, aby zobaczyć jej stronę na skanie. Zmiany trafiają od razu do tabeli.' : 'Na tym skanie nie znaleziono wpisanych ilości.' }));
  // Pola wieloliniowe dopasowują wysokość do tekstu, gdy są już na stronie.
  requestAnimationFrame(() => tabela.querySelectorAll('textarea').forEach(dopasujWysokosc));
  return [tabela, pod];
}

function dopasujWysokosc(pole) {
  if (pole.tagName !== 'TEXTAREA') return;
  pole.style.height = 'auto';
  pole.style.height = `${pole.scrollHeight + 2}px`;
}
window.addEventListener('resize', () => document.querySelectorAll('.pozycje textarea').forEach(dopasujWysokosc));

function odswiez() {
  rysujListe();
  rysujPodglad();
  odswiezPrzyciski();
}
odswiez();

// Do testów automatycznych.
window.__listy = { skany, odswiez };
