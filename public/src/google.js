// Google: logowanie, lista inwestycji z Dysku współdzielonego INWESTYCJE_3
// i zapis do „Tabeli materiałowej” inwestycji (src/tabela-materialowa.js).
// Ten sam klient OAuth i te same zapytania co w aplikacji Audyt.
import { GOOGLE } from '../config.js';

const ZAKRES = 'https://www.googleapis.com/auth/drive';
const MIME = {
  folder: 'application/vnd.google-apps.folder',
  arkusz: 'application/vnd.google-apps.spreadsheet',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// --- Logowanie ---

let biblioteka = null;
// Wczytywana od razu przy starcie - okno logowania musi się otworzyć zaraz po
// kliknięciu, inaczej przeglądarka może je zablokować.
export function zaladujBiblioteke() {
  biblioteka ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { biblioteka = null; reject(new Error('Brak połączenia z Google')); };
    document.head.append(s);
  });
  return biblioteka;
}

const KLUCZ_TOKENU = 'listy.token';
let token = (() => {
  try { return JSON.parse(sessionStorage.getItem(KLUCZ_TOKENU)); } catch { return null; }
})();

export const zalogowany = () => Boolean(token && token.wygasa > Date.now() + 60_000);

export async function zaloguj() {
  if (zalogowany()) return token.wartosc;
  await zaladujBiblioteke();
  return new Promise((resolve, reject) => {
    const klient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: ZAKRES,
      callback: odp => {
        if (odp.error) { reject(new Error(odp.error_description || odp.error)); return; }
        token = { wartosc: odp.access_token, wygasa: Date.now() + Number(odp.expires_in) * 1000 };
        try { sessionStorage.setItem(KLUCZ_TOKENU, JSON.stringify(token)); } catch { /* bez pamięci sesji też działa */ }
        resolve(token.wartosc);
      },
      error_callback: blad => reject(new Error(blad.type === 'popup_closed' ? 'Logowanie przerwane' : (blad.message || blad.type)))
    });
    klient.requestAccessToken({ prompt: token ? '' : undefined });
  });
}

async function api(url, opcje = {}, ponowienie = false) {
  const odp = await fetch(url, { ...opcje, headers: { Authorization: `Bearer ${await zaloguj()}`, ...opcje.headers } });
  if (odp.status === 401 && !ponowienie) { token = null; return api(url, opcje, true); }
  if (!odp.ok) {
    let opis = `${odp.status}`;
    try { opis = (await odp.json()).error?.message || opis; } catch { /* odpowiedź bez JSON */ }
    throw Object.assign(new Error(`Google: ${opis}`), { status: odp.status });
  }
  return odp;
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const cudzyslow = tekst => String(tekst).replace(/['\\]/g, '\\$&');
const json = (metoda, tresc) => ({ method: metoda, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tresc) });

async function lista(q, { driveId, pola = 'id,name,mimeType,modifiedTime,parents' } = {}) {
  const wynik = [];
  let strona = '';
  do {
    const p = new URLSearchParams({ q, fields: `nextPageToken,files(${pola})`, pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (driveId) { p.set('corpora', 'drive'); p.set('driveId', driveId); } else p.set('corpora', 'allDrives');
    if (strona) p.set('pageToken', strona);
    const odp = await (await api(`${DRIVE}/files?${p}`)).json();
    wynik.push(...odp.files);
    strona = odp.nextPageToken || '';
  } while (strona);
  return wynik;
}

// --- Inwestycje: foldery INWESTYCJE_3 z tabelą montażową (jak w Audycie) ---

export async function listaInwestycji(nazwaDysku) {
  const odp = await (await api(`${DRIVE}/drives?${new URLSearchParams({ q: `name = '${cudzyslow(nazwaDysku)}'`, pageSize: '10' })}`)).json();
  if (!odp.drives?.length) throw Object.assign(new Error(`Nie widzę dysku współdzielonego „${nazwaDysku}”.`), { status: 403 });
  const driveId = odp.drives[0].id;
  const [foldery, tabele] = await Promise.all([
    lista(`'${driveId}' in parents and mimeType = '${MIME.folder}' and trashed = false`, { driveId }),
    lista(`(name contains 'montaż' or name contains 'montaz' or name contains 'MONTAŻ') and (mimeType = '${MIME.arkusz}' or mimeType = '${MIME.xlsx}') and trashed = false`, { driveId })
  ]);
  const zTabela = new Set(tabele.flatMap(t => t.parents || []));
  return foldery.filter(f => zTabela.has(f.id)).map(f => ({ id: f.id, nazwa: f.name }))
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl', { numeric: true }));
}

// --- Tabela materiałowa (funkcje, których używa src/tabela-materialowa.js) ---

export async function arkuszeWFolderze(idFolderu) {
  return lista(`'${idFolderu}' in parents and mimeType = '${MIME.arkusz}' and trashed = false`, { pola: 'id,name,modifiedTime' });
}

export async function utworzArkuszGoogle(idFolderu, nazwa) {
  return (await (await api(`${DRIVE}/files?supportsAllDrives=true&fields=id`, json('POST', { name: nazwa, mimeType: MIME.arkusz, parents: [idFolderu] }))).json()).id;
}

// Ustawienia regionalne arkusza (separator argumentów w formułach).
export async function lokalizacjaTabeli(idTabeli) {
  const meta = await (await api(`https://sheets.googleapis.com/v4/spreadsheets/${idTabeli}?fields=properties.locale`)).json();
  return meta.properties?.locale || 'en_US';
}

export async function arkuszeTabeli(idTabeli) {
  return (await (await api(`${SHEETS}/${idTabeli}?fields=sheets.properties(sheetId,title,gridProperties)`)).json()).sheets.map(s => s.properties);
}

export async function zmianyTabeli(idTabeli, requests) {
  return (await api(`${SHEETS}/${idTabeli}:batchUpdate`, json('POST', { requests }))).json();
}

export async function wartosciArkusza(idTabeli, nazwaArkusza) {
  const p = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', majorDimension: 'ROWS' });
  const zakres = encodeURIComponent(`'${nazwaArkusza.replace(/'/g, "''")}'`);
  return (await (await api(`${SHEETS}/${idTabeli}/values/${zakres}?${p}`)).json()).values || [];
}

export async function zapiszKomorki(idTabeli, dane, opcja = 'RAW') {
  await api(`${SHEETS}/${idTabeli}/values:batchUpdate`, json('POST', { valueInputOption: opcja, data: dane }));
}
