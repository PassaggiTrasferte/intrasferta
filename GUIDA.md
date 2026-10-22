# geniGO beta · guida alla messa online

Tempo: circa 30-40 minuti, una volta sola. Costo: zero (piani gratuiti), più pochi centesimi per ogni calendario letto con l'AI.

Servono due account gratuiti:
- **Supabase**: database, accessi via email, sicurezza dei dati
- **GitHub**: ospita le pagine dell'app (hai già un account)

---

## 1. Crea il progetto Supabase (10 min)

1. Vai su **supabase.com** → *Start your project* → accedi (anche con GitHub).
2. *New project*:
   - Name: `intrasferta`
   - Database password: generane una e **salvala** (non serve all'app, ma tienila)
   - Region: **Central EU (Frankfurt)** (i dati restano in Europa)
3. Attendi un paio di minuti che il progetto sia pronto.

## 2. Crea il database (2 min)

1. Menu a sinistra → **SQL Editor** → *New query*.
2. Apri il file `supabase/schema.sql`, copia **tutto** il contenuto, incollalo e premi **Run**.
3. Deve comparire "Success". (Se lo rilanci in futuro non fa danni.)

## 3. Accesso via email (5 min)

1. **Authentication → Sign In / Providers → Email**: deve essere attivo (lo è di default).
2. **Authentication → Emails → Templates**: modifica i modelli **Magic Link** e **Confirm signup** così l'email contiene anche il codice a 6 cifre (serve a chi apre la mail su un altro dispositivo o dall'app di posta):

   Oggetto: `Il tuo codice per geniGO`

   ```html
   <h2>Accedi a geniGO</h2>
   <p>Il tuo codice: <strong style="font-size:24px">{{ .Token }}</strong></p>
   <p>Oppure tocca il link: <a href="{{ .ConfirmationURL }}">entra in geniGO</a></p>
   <p>Se non hai chiesto tu l'accesso, ignora questa email.</p>
   ```

3. **Authentication → URL Configuration** (da completare dopo il punto 5, quando hai l'indirizzo GitHub):
   - Site URL: `https://TUO-UTENTE.github.io/intrasferta/`
   - Redirect URLs: aggiungi lo stesso indirizzo

4. **Importante per i beta tester: invio email.** Il servizio email incluso in Supabase serve solo per le prove e invia pochissimi messaggi all'ora. Con più di 3-4 tester collega un servizio SMTP gratuito:
   - crea un account su **resend.com** o **brevo.com** (piano gratuito, migliaia di email al mese)
   - **Project Settings → Authentication → SMTP Settings** → *Enable custom SMTP* e incolla i dati che ti danno (host, porta, utente, password, mittente).

## 4. Collega l'app al progetto (2 min)

1. **Project Settings → API**: copia **Project URL** e la chiave **anon public**.
2. Apri `config.js` e sostituisci i due valori `INCOLLA-QUI-...`.
   La chiave "anon" è pensata per stare nel browser: i dati sono protetti dalle regole del database. **Non** usare mai la chiave "service_role".

## 5. Metti online le pagine su GitHub (10 min)

1. Su **github.com** → *New repository* → nome `intrasferta` → **Public** → *Create*.
2. *uploading an existing file* → trascina **tutti i file e la cartella** di questo pacchetto (index.html, app.js, config.js, styles.css, sports.js, icone, manifest, cartella supabase) → *Commit changes*.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → *Save*.
4. Dopo 1-2 minuti l'app è su `https://TUO-UTENTE.github.io/intrasferta/`.
5. Torna al punto 3.3 e inserisci questo indirizzo in Supabase.

> Il link Google e le pagine attuali di Urania e Olimpia restano attive e separate: la beta parte con dati nuovi.

## 6. Import calendario con l'AI (facoltativo, 10 min)

1. Crea una chiave su **console.anthropic.com** → *API Keys* (serve una carta: ogni calendario costa pochi centesimi; puoi fissare un limite di spesa mensile).
2. In Supabase → **Edge Functions** → *Deploy a new function* → *Via Editor* → nome **`import-calendar`** → incolla il contenuto di `supabase/functions/import-calendar/index.ts` → *Deploy*. Lascia attiva l'opzione "Verify JWT".
3. **Edge Functions → Secrets** → aggiungi `ANTHROPIC_API_KEY` con la tua chiave.
4. In `config.js` metti `AI_IMPORT_ENABLED: true` e ricarica il file su GitHub.

## 7. Prima prova

1. Apri l'app dal telefono → inserisci la tua email → codice → il tuo nome.
2. *Crea una nuova squadra* → scegli lo sport → nome e categoria.
3. Nella scheda **Invita** trovi QR code, link e messaggio pronto per WhatsApp.
4. Aggiungi una trasferta (o importala con l'AI), offri un passaggio, prenota un posto.
5. Sul telefono: menu del browser → **Aggiungi alla schermata Home** per averla come un'app.

---

## Cosa c'è nella beta

- Multi-squadra e multi-sport (basket, calcio, pallavolo, rugby, calcio a 5, pallanuoto, pallamano, hockey, baseball/softball, altro) con le etichette giuste per ogni sport
- Ruoli: amministratore e genitore; approvazione facoltativa dei nuovi genitori
- Invito con link, codice e QR; messaggio pronto per WhatsApp; rigenerazione del link
- Trasferte con data, orario, luogo, note e km; elenco degli atleti ancora senza posto
- Genitori: offro un passaggio / prenoto un posto, con controllo dei posti lato server (niente doppie prenotazioni)
- Mezzi della società (facoltativi): posti a prenotazione o a convocazione
- Import del calendario ufficiale con l'AI (PDF, foto, testo), con anteprima da confermare
- Report CO2 di stagione a consuntivo, con metodologia, stampa/PDF ed esportazione CSV
- Aggiornamento in tempo reale quando qualcuno prenota o offre un posto
- In beta tutte le funzioni Premium sono attive (`plan = 'beta'`); per provare il piano gratuito: in Supabase → Table Editor → teams → plan = `free`

## Sicurezza e privacy, in breve

- Accesso senza password, con codice via email
- Ogni squadra vede solo i propri dati: le regole sono nel database (Row Level Security), non solo nell'interfaccia
- Le prenotazioni passano da una funzione che blocca i posti, quindi due genitori non possono prendere l'ultimo posto insieme
- Dati minimi: nome del genitore, nome dell'atleta, email per l'accesso. Nessun indirizzo di casa, nessuna posizione, nessun pagamento
- Server in UE (se scegli Frankfurt)
- Prima di aprire a molte squadre: informativa privacy e termini d'uso (da far rivedere a un legale), backup automatici (piano Supabase a pagamento) e dominio proprio

## Limiti da sapere

- Il piano gratuito di Supabase mette in pausa il progetto dopo 7 giorni senza utilizzo: basta riattivarlo dal pannello. Per una beta attiva non succede.
- L'AI può sbagliare a leggere un calendario: per questo c'è sempre l'anteprima da confermare.
- Non sono ancora presenti le notifiche push e la migrazione automatica dei dati dalle pagine attuali.
