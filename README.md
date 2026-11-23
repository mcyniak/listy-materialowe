# Listy materiałowe

Strona do odczytu zeskanowanych list materiałowych PV (ilości wpisane ręcznie) do tabeli Excel.
Skany czyta Claude (Anthropic): domyślnie Claude Haiku 5.5, przycisk „Przeczytaj dokładniej” - Claude Opus 5.5.

Klucz API wpisuje się raz w Ustawieniach na każdym komputerze - zostaje tylko w przeglądarce, nie ma go w kodzie.

## Zapis w Tabeli materiałowej inwestycji

Przycisk „Zapisz w tabeli inwestycji”: logowanie Google (ten sam klient OAuth co
aplikacja Audyt), wybór inwestycji (foldery INWESTYCJE_3 z tabelą montażową) i
rodzaju instalacji, zapis do Arkusza Google
`INWESTYCJE_3/<inwestycja>/Tabela materiałowa` – arkusz Pozycje (te same
kolumny co Excel + Rodzaj, Źródło = „Lista materiałowa (skan)”, Zapisano). Tabela
jest wspólna z wnioskami materiałowymi z tabletu (aplikacja Audyt). Ponowny zapis
tego samego skanu (po nazwie pliku) zastępuje jego wcześniejsze wiersze.

`public/src/tabela-materialowa.js` **jest taki sam w repozytorium audyt-tablet** –
zmieniać w obu.

## Praca lokalna

    npm install
    npm run vendor   # biblioteki do public/vendor
    npm start        # http://127.0.0.1:5174
    npm test

Przykładowe skany i wzorcowe odczyty trzymaj w `test/lokalne/` (poza repozytorium - dane klientów).

Publikacja: każdy push do `main` wystawia folder `public/` na GitHub Pages.
