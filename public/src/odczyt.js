// Odczyt jednego skanu listy materiałowej przez Claude (strony + powiększone pasy -> JSON).
// Jedno zapytanie na skan: powiększenia robi program, nie Claude - bez rund w tę i z powrotem.
import Anthropic from '../vendor/anthropic.mjs';
import { base64, pasy } from './strony.js';

// Jak w kalkulatorze OZC: domyślnie tani i szybki Haiku z krótkim namysłem,
// "Przeczytaj dokładniej" = Opus. Ceny USD za milion tokenów, stan na 2026-11 - tylko do szacunku.
export const TRYBY = {
  szybki: {
    model: 'claude-haiku-5-5', effort: 'low', fallbacks: false,
    // Haiku 5.5: wyższa stawka, gdy zapytanie przekracza 100 tys. tokenów.
    cena: t => (t.input_tokens <= 100000 ? t.input_tokens * 0.1 + t.output_tokens * 0.5 : t.input_tokens * 0.5 + t.output_tokens * 2.5) / 1e6
  },
  dokladny: {
    model: 'claude-opus-5-5', effort: 'high', fallbacks: true,
    cena: t => (t.input_tokens * 4 + t.output_tokens * 20) / 1e6
  }
};

const tekst = { type: 'string' };

export const SCHEMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['wzor', 'adres', 'moc', 'data', 'ekipa', 'pozycje'],
  properties: {
    wzor: tekst,
    adres: tekst,
    moc: tekst,
    data: tekst,
    ekipa: tekst,
    pozycje: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['strona', 'sekcja', 'pozycja', 'jednostka', 'ilosc', 'dodatkowo',
          'zaznaczenie', 'poprawka', 'dopisane', 'pewnosc', 'uwagi'],
        properties: {
          strona: { type: 'integer' },
          sekcja: tekst,
          pozycja: tekst,
          jednostka: tekst,
          ilosc: tekst,
          dodatkowo: tekst,
          zaznaczenie: tekst,
          poprawka: tekst,
          dopisane: { type: 'boolean' },
          pewnosc: { type: 'string', enum: ['wysoka', 'srednia', 'niska'] },
          uwagi: tekst
        }
      }
    }
  }
};

export const INSTRUKCJA = `Odczytujesz zeskanowane listy materiałowe do montażu instalacji fotowoltaicznych. Lista to wydrukowana tabela pozycji (nazwa materiału, jednostka) z ilościami wpisanymi ręcznie długopisem. Większość wierszy jest pusta - wpisy są tylko przy części pozycji.

Dostajesz najpierw wszystkie strony skanu w całości, a potem powiększenia prawej części każdej strony (końcówki nazw pozycji, jednostka, kolumny ilości) w pasach z góry na dół. Pasy lekko na siebie zachodzą - wpis widoczny w dwóch pasach to jeden wpis. Cyfry i przypisanie wpisów do wierszy ustalaj z powiększeń; całe strony służą do pełnych nazw pozycji, nagłówków sekcji, adresu i dopisków poza tabelą.

Zasady odczytu:
- Zwróć tylko pozycje, przy których naprawdę coś napisano lub zaznaczono ręcznie. Pusta komórka ilości oznacza brak pozycji - nie wpisuj wtedy niczego, w szczególności nie wpisuj "1". Zakreślacz, kropka, smuga ani ślad skanera to nie wpis.
- Przepisuj dokładnie to, co napisano. Nie licz, nie poprawiaj, nie zaokrąglaj, nie zamieniaj jednostek. Znak "+" wpisz tylko wtedy, gdy wyraźnie go widać; liczba bez plusa zostaje liczbą bez plusa ("31" to "31").
- Wpis należy do wiersza, na którego linii leży większa część znaków. Gdy wpis leży na granicy dwóch wierszy, wybierz ten, z którym jest wyrównany, i zaznacz niepewność w uwagach.
- Pismo jest polskie: "1" bywa pisana z długim daszkiem (wygląda jak "Λ" albo "/1"), "7" ma poprzeczkę, "4" bywa otwarta, "0" bywa niedomknięte.

Pola nagłówka (pusty tekst, gdy brak):
- wzor: wydrukowany tytuł formularza nad tabelą, dosłownie.
- adres: cały odręczny tekst opisujący miejsce montażu - zwykle na górze pierwszej strony albo w polu ADRES. Dosłownie, w kolejności zapisu; kilka adresów oddziel " / ".
- moc, data, ekipa: z pól MOC / DATA / EKIPA albo z dopisku przy adresie (np. "10KW" -> moc).

Pola pozycji:
- strona: numer strony skanu, od 1.
- sekcja: wydrukowany nagłówek sekcji, pod którym leży wiersz (np. "FALOWNIKI FOXESS", "Rozdzielnice AC"). Dla dopisków spoza tabeli: "Dopisane".
- pozycja: wydrukowana nazwa z wiersza, dosłownie i w całości. Dla dopisków - nazwa tak, jak ją napisano.
- jednostka: wydrukowana jednostka (szt, mb, op, kpl); dla dopisków jednostka z dopisku albo pusty tekst.
- ilosc: ręczny wpis w kolumnie ilości (na starszym wzorze kolumna "Pobrane"), dosłownie. Pusty tekst, gdy w wierszu jest tylko zaznaczenie albo poprawka bez ilości.
- dodatkowo: ręczny wpis w kolumnie "Dodatkowo" (jest tylko na starszym wzorze), inaczej pusty tekst.
- zaznaczenie: wydrukowane warianty zakreślone kółkiem w tym wierszu, przepisane tak, jak są wydrukowane (np. "25A", "U-25", "FI 25"); gdy kółkiem objęto tylko część wariantu (np. samo "32" w "FI 32"), podaj cały wariant ("FI 32"). Kilka oddziel ", ". Pole "pozycja" zostaw z pełnym wydrukiem wszystkich wariantów - program sam zostawi w nazwie zakreślony.
- poprawka: gdy wydrukowany tekst w wierszu przekreślono i dopisano inny, zapisz "stare → nowe" (np. "550 Wp → 480W"). Dopisek do nazwy bez skreślenia zapisz sam. Skreśloną ilość też opisz tutaj, np. "skreślone: 800".
- dopisane: true dla pozycji napisanych ręcznie poza wydrukowanymi wierszami, false dla wierszy wydrukowanych.
- pewnosc: "wysoka", "srednia" albo "niska" - na ile pewny jest odczyt odręcznych znaków i ich przypisanie do wiersza.
- uwagi: przy niepewnym odczycie inne możliwe odczytania (np. "może 4+1"), inne ważne obserwacje (np. dopisek przekreślony). Pusty tekst, gdy brak.

Dopiski spoza tabeli w rodzaju "Klips do kabla - 300 szt" rozbij na: pozycja "Klips do kabla", ilosc "300", jednostka "szt".

Zachowaj kolejność ze skanu: strona po stronie, od góry do dołu.`;

const obraz = dataUrl => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64(dataUrl) } });

/** Treść zapytania: całe strony, potem powiększone pasy każdej strony. */
export async function trescZapytania(skan, nazwaPliku) {
  const content = [];
  for (const s of skan.strony) {
    content.push({ type: 'text', text: `Strona ${s.numer} w całości:` }, obraz(s.dataUrl));
  }
  const wycinki = await Promise.all(skan.strony.flatMap(s =>
    pasy(s.szer, s.wys).map(p => skan.wytnij(s.numer, p))));
  for (const w of wycinki) content.push({ type: 'text', text: `Powiększenie - ${w.opis}:` }, obraz(w.dataUrl));
  content.push({ type: 'text', text: `Plik: ${nazwaPliku}. Odczytaj tę listę materiałową.` });
  return content;
}

/**
 * @param {{klucz: string, skan: Awaited<ReturnType<typeof import('./strony.js').otworzSkan>>,
 *   nazwaPliku: string, tryb?: 'szybki'|'dokladny', sygnal?: AbortSignal}} p
 * @returns {Promise<{wynik: object, kosztUSD: number}>}
 */
export async function odczytajSkan({ klucz, skan, nazwaPliku, tryb = 'szybki', sygnal }) {
  const t = TRYBY[tryb];
  // Klucz podaje użytkownik i zostaje w jego przeglądarce - stąd dangerouslyAllowBrowser.
  const client = new Anthropic({ apiKey: klucz, dangerouslyAllowBrowser: true, maxRetries: 5 });

  const odp = await client.beta.messages.stream({
    model: t.model,
    max_tokens: 64000,
    // Opus: gdyby filtr bezpieczeństwa omyłkowo odrzucił skan, API samo ponowi na innym modelu
    // (Haiku tej opcji nie ma).
    ...(t.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: t.effort, format: { type: 'json_schema', schema: SCHEMAT } },
    system: INSTRUKCJA,
    messages: [{ role: 'user', content: await trescZapytania(skan, nazwaPliku) }]
  }, { signal: sygnal }).finalMessage();

  if (odp.stop_reason === 'refusal') throw new Error('Claude odmówił odczytu tego skanu.');
  if (odp.stop_reason === 'max_tokens') throw new Error('Odpowiedź została ucięta - skan za długi.');
  const json = odp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { wynik: JSON.parse(json), kosztUSD: t.cena(odp.usage) };
}
