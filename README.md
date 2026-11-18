# Listy materiałowe

Strona do odczytu zeskanowanych list materiałowych PV (ilości wpisane ręcznie) do tabeli Excel.
Skany czyta Claude (Anthropic): domyślnie Claude Haiku 5.5, przycisk „Przeczytaj dokładniej” - Claude Opus 5.5.

Klucz API wpisuje się raz w Ustawieniach na każdym komputerze - zostaje tylko w przeglądarce, nie ma go w kodzie.

## Praca lokalna

    npm install
    npm run vendor   # biblioteki do public/vendor
    npm start        # http://127.0.0.1:5174
    npm test

Przykładowe skany i wzorcowe odczyty trzymaj w `test/lokalne/` (poza repozytorium - dane klientów).

Publikacja: każdy push do `main` wystawia folder `public/` na GitHub Pages.
