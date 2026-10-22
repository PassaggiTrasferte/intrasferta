# geniGO · memoria del progetto (app)

Leggere all'inizio di ogni sessione sull'app. Repository PUBBLICO: qui niente dati personali, segreti o backup.

## Cos'è
Web app per organizzare i passaggi in auto alle trasferte sportive tra genitori (società, allenatori, genitori).
Sito: https://genigo.it (GitHub Pages, CNAME). Gratis per la stagione 2026/27.
Più sport: vedi `sports.js` (etichette per sport). Mai pagamenti tra genitori, mai autisti esterni.

## Architettura
- Statica, senza build: `index.html`, `app.js` (~2650 righe, un'unica IIFE, viste `viewXxx`), `styles.css`, `sports.js`, `config.js` (URL + chiave anon Supabase: pubblica per design).
- Librerie servite in locale, niente CDN: `libs/supabase-2.45.4/`, `libs/qrcode-1.4.4/`, font in `fonts/`.
- Versione: il parametro `?v=AAAAMMGG-N` in index.html (stesso valore su tutti i file) è la versione mostrata in fondo all'app. Va aumentato a ogni rilascio.
- Backend Supabase (Frankfurt): accesso solo con codice via email (niente password per i genitori), RLS su tutte le tabelle, funzioni SECURITY DEFINER chiamate via `sb.rpc`.
- Lo schema del database NON è nel repository. Le modifiche al DB sono file SQL numerati applicati a mano dal SQL Editor di Supabase.

## Regole sui dati (privacy, non derogabili)
- Atleti = **alias**, mai nome e cognome. Regola (identica in JS `aliasClean` e SQL `alias_clean`): dalla seconda parola in poi, parole di 3+ lettere ridotte a iniziale e punto; max 15 caratteri. "Marco Rossi" → "Marco R.".
- Alias unico per squadra (`alias_taken`). L'altro genitore si collega solo con il link d'invito (`use_invite`).
- Prenotazioni e richieste legate all'atleta via `athlete_id` (seguono i cambi di alias).
- Genitori: cognome e cellulare facoltativi. "Punto di ritrovo", mai indirizzo di casa.
- Admin: email e cognomi mascherati (`mask_email`).
- Fine stagione (31/8): pulizia automatica di alias, nomi, telefoni, punti di ritrovo (`season_cleanup`, cron giornaliero); restano solo i numeri per il report CO2.
- Testi legali in app.js (`LEGAL_UPDATED`); il titolare del trattamento è ancora un segnaposto `<titolare>`.

## Provenienza visite
Link firmati `genigo.it/?da=canale` → `track_visit` → tabella `visits`; pannello admin `source_stats`. `genigo.it/ig` reindirizza a `/?da=ig-bio`.

## Come lavoriamo
1. Le richieste arrivano a lotti. Prima un piano breve; per modifiche importanti anche un'anteprima, e si procede solo dopo l'ok.
2. Ogni modifica va provata prima di consegnarla: DB di prova Postgres con Supabase simulato, test SQL di comportamento e prova dell'app nel browser (Playwright con Supabase simulato).
3. Consegna: i file pronti vanno in Download › `genigo-<versione>` con un LEGGIMI di pochi passi. Il proprietario li carica su GitHub e lancia lo SQL su Supabase. Claude non entra in pagine con credenziali e non tocca il database vero.
4. SQL sempre "tutto o niente" (transazione), con file di ripristino accanto.
5. Rispondere in italiano, semplice, senza gergo: il proprietario non è uno sviluppatore.
