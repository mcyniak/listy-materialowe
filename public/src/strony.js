// Skan (PDF albo zdjęcie) -> obrazy stron dla Claude + wycinanie powiększonych fragmentów.
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

// Największy obraz, jaki Claude przyjmuje bez zmniejszania (dłuższy bok w pikselach).
export const DLUGI_BOK = 2576;
// Powiększenie wycinka: dłuższy bok wycinka po powiększeniu, i największe dopuszczalne powiększenie.
const WYCINEK_BOK = 1800;
const MAX_ZOOM = 4;

function plotno(szer, wys) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(szer));
  canvas.height = Math.max(1, Math.round(wys));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

const jpeg = canvas => canvas.toDataURL('image/jpeg', 0.85);
export const base64 = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);

/**
 * Pasy do powiększenia: prawa część strony (końcówki nazw, jednostka, kolumny ilości),
 * z góry na dół, lekko na siebie zachodzące. Na obu wzorach list ilości są w prawych ~60%.
 */
export function pasy(szer, wys, ile = 3) {
  const x0 = Math.round(szer * 0.4);
  const zakladka = Math.round(wys * 0.03);
  const krok = wys / ile;
  return Array.from({ length: ile }, (_, i) => ({
    x0, x1: szer,
    y0: Math.max(0, Math.round(i * krok) - zakladka),
    y1: Math.min(wys, Math.round((i + 1) * krok) + zakladka)
  }));
}

/** Wycinek w pikselach obrazu strony, przycięty do strony. */
export function przytnij({ x0, y0, x1, y1 }, szer, wys) {
  const a = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
  a.x0 = Math.max(0, Math.min(szer - 1, Math.round(a.x0)));
  a.y0 = Math.max(0, Math.min(wys - 1, Math.round(a.y0)));
  a.x1 = Math.max(a.x0 + 1, Math.min(szer, Math.round(a.x1)));
  a.y1 = Math.max(a.y0 + 1, Math.min(wys, Math.round(a.y1)));
  const zoom = Math.min(MAX_ZOOM, Math.max(1, WYCINEK_BOK / Math.max(a.x1 - a.x0, a.y1 - a.y0)));
  return { ...a, zoom };
}

class SkanPdf {
  constructor(plik) { this.plik = plik; this.pdf = null; }
  async otworz() {
    this.pdf ??= await pdfjs.getDocument({ data: new Uint8Array(await this.plik.arrayBuffer()) }).promise;
    return this.pdf;
  }
  async strony() {
    const pdf = await this.otworz();
    const wynik = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const strona = await pdf.getPage(n);
      const bazowy = strona.getViewport({ scale: 1 });
      const widok = strona.getViewport({ scale: DLUGI_BOK / Math.max(bazowy.width, bazowy.height) });
      const { canvas, ctx } = plotno(widok.width, widok.height);
      await strona.render({ canvasContext: ctx, viewport: widok }).promise;
      wynik.push({ dataUrl: jpeg(canvas), szer: canvas.width, wys: canvas.height, skala: widok.scale });
    }
    return wynik;
  }
  // Renderuje sam wycinek z PDF w większej skali (ostrzej niż powiększanie gotowego obrazu).
  async wytnij(info, obszar) {
    const strona = await (await this.otworz()).getPage(info.numer);
    const skala = info.skala * obszar.zoom;
    const widok = strona.getViewport({ scale: skala, offsetX: -obszar.x0 * obszar.zoom, offsetY: -obszar.y0 * obszar.zoom });
    const { canvas, ctx } = plotno((obszar.x1 - obszar.x0) * obszar.zoom, (obszar.y1 - obszar.y0) * obszar.zoom);
    await strona.render({ canvasContext: ctx, viewport: widok }).promise;
    return jpeg(canvas);
  }
  async zamknij() { if (this.pdf) { await this.pdf.destroy(); this.pdf = null; } }
}

class SkanObraz {
  constructor(plik) { this.plik = plik; }
  async strony() {
    const bitmapa = await createImageBitmap(this.plik);
    const skala = Math.min(1, DLUGI_BOK / Math.max(bitmapa.width, bitmapa.height));
    const { canvas, ctx } = plotno(bitmapa.width * skala, bitmapa.height * skala);
    ctx.drawImage(bitmapa, 0, 0, canvas.width, canvas.height);
    bitmapa.close();
    return [{ dataUrl: jpeg(canvas), szer: canvas.width, wys: canvas.height, skala }];
  }
  async wytnij(info, obszar) {
    const bitmapa = await createImageBitmap(this.plik);
    const k = 1 / info.skala; // piksele obrazu strony -> piksele oryginalnego zdjęcia
    const { canvas, ctx } = plotno((obszar.x1 - obszar.x0) * obszar.zoom, (obszar.y1 - obszar.y0) * obszar.zoom);
    ctx.drawImage(bitmapa, obszar.x0 * k, obszar.y0 * k, (obszar.x1 - obszar.x0) * k, (obszar.y1 - obszar.y0) * k,
      0, 0, canvas.width, canvas.height);
    bitmapa.close();
    return jpeg(canvas);
  }
  async zamknij() {}
}

/**
 * @param {File} plik
 * @returns {Promise<{strony: {numer:number, dataUrl:string, szer:number, wys:number, skala:number}[],
 *   wytnij: (numer:number, obszar:{x0:number,y0:number,x1:number,y1:number}) => Promise<{dataUrl:string, opis:string}>,
 *   zamknij: () => Promise<void>}>}
 */
export async function otworzSkan(plik) {
  let zrodlo;
  if (plik.type === 'application/pdf' || /\.pdf$/i.test(plik.name || '')) zrodlo = new SkanPdf(plik);
  else if (plik.type.startsWith('image/')) zrodlo = new SkanObraz(plik);
  else throw new Error('Obsługiwane są pliki PDF i zdjęcia (JPG, PNG).');

  const strony = (await zrodlo.strony()).map((s, i) => ({ ...s, numer: i + 1 }));
  return {
    strony,
    async wytnij(numer, obszar) {
      const info = strony[numer - 1];
      if (!info) throw new Error(`Skan nie ma strony ${numer} (stron: ${strony.length}).`);
      const o = przytnij(obszar, info.szer, info.wys);
      return { dataUrl: await zrodlo.wytnij(info, o), opis: `Strona ${numer}, x ${o.x0}-${o.x1}, y ${o.y0}-${o.y1}, powiększenie ${o.zoom.toFixed(1)}×` };
    },
    zamknij: () => zrodlo.zamknij()
  };
}
