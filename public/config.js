// Konfiguracja Google - ten sam projekt i klient OAuth co aplikacja Audyt
// (obie stoją pod https://mcyniak.github.io). Identyfikator klienta OAuth NIE
// jest sekretem - jest widoczny w każdej aplikacji webowej; zabezpiecza go
// ograniczenie do adresu https://mcyniak.github.io w Cloud Console i to, że
// aplikacja jest wewnętrzna dla firmowego Google Workspace.
export const GOOGLE = {
  clientId: '460087887322-dcbpakdmkhor2ahf8tlap11ban8ic6gj.apps.googleusercontent.com'
};

// Inwestycje = foldery na tym Dysku współdzielonym (z tabelą montażową).
// Tabela materiałowa: INWESTYCJE_3 / <inwestycja> / Tabela materiałowa.
export const DYSK = { inwestycje: 'INWESTYCJE_3' };
