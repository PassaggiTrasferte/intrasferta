/* Carpoolino · webapp (beta)
   Nessun build: HTML + JS + Supabase. Tutti i testi degli utenti passano da esc(). */
(function () {
  "use strict";

  const CFG = window.INTRASFERTA_CONFIG || {};
  const SPORTS = window.SPORTS, SPORT_ORDER = window.SPORT_ORDER;
  const $app = document.getElementById("app");

  // ---------- utilità ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DOW = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const MON = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const pad = (n) => String(n).padStart(2, "0");
  const dateParts = (iso) => { const d = new Date(iso); return { dow: DOW[d.getDay()], day: d.getDate(), mon: MON[d.getMonth()], time: pad(d.getHours()) + ":" + pad(d.getMinutes()), ymd: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }; };
  const toISO = (ymd, hm) => new Date(ymd + "T" + (hm || "00:00")).toISOString();
  const splitNames = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const initials = (s) => (String(s || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  const sportOf = (team) => SPORTS[team?.sport] || SPORTS.altro;
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });

  const firstName = (s) => String(s || "").split(",")[0].trim().split(/\s+/)[0] || "";
  const waNum = (t) => { let d = String(t || "").replace(/[^0-9+]/g, ""); if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (/^3\d{8,9}$/.test(d)) d = "39" + d; return d.length >= 8 ? d : ""; };
  const waHref = (phone, text) => { const n = waNum(phone); return "https://wa.me/" + (n || "") + "?text=" + encodeURIComponent(text); };
  const mapsSearch = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const mapsRoute = (from, to) => "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + encodeURIComponent(from) + "&destination=" + encodeURIComponent(to);
  const telOk = (t) => !t || waNum(t).length >= 10;
  async function geocode(q) {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=" + encodeURIComponent(q));
    const j = await r.json(); return j && j[0] ? [Number(j[0].lon), Number(j[0].lat)] : null;
  }
  async function estimateKm(from, to) {
    if (!from || !to) return null;
    try {
      const a = await geocode(from); if (!a) return null;
      await new Promise((res) => setTimeout(res, 1100)); // limite di cortesia del servizio di geocodifica
      const b = await geocode(to); if (!b) return null;
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`);
      const j = await r.json(); const m = j && j.routes && j.routes[0] && j.routes[0].distance;
      return m ? Math.round(m / 100) / 10 : null;
    } catch (e) { return null; }
  }

  let toastT;
  function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000); }

  const ERRORS = {
    last_admin: "Sei l'unico amministratore di una squadra con altri membri: prima nomina un altro amministratore in Membri, poi potrai eliminare l'account.",
    ride_full: "Auto piena: qualcuno ha appena preso l'ultimo posto.",
    athlete_already_booked: "Questo atleta ha già un posto per questa trasferta.",
    invalid_code: "Codice invito non valido o scaduto. Chiedi un nuovo link all'amministratore.",
    forbidden: "Non hai i permessi per questa operazione.",
    convocation_only_admin: "Su questo mezzo i posti li assegna la società.",
    last_admin: "Sei l'unico amministratore: nomina un altro amministratore prima di uscire.",
    event_past: "La trasferta è già passata.",
    not_authenticated: "Sessione scaduta: accedi di nuovo.",
    request_gone: "Questa richiesta non c'è più.",
    only_admins_create_teams: "Solo gli amministratori possono creare una squadra. Per una nuova società scrivi al supporto.",
    need_own_ride:"Prima offri il tuo passaggio su questa trasferta, poi premi di nuovo «Lo porto io».",
    own_ride_full: "La tua auto è piena."
  };
  function errMsg(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || "";
    for (const k in ERRORS) if (m.includes(k)) return ERRORS[k];
    if (/row-level security/i.test(m)) return ERRORS.forbidden;
    if (/Failed to fetch|NetworkError/i.test(m)) return "Connessione assente: riprova tra poco.";
    return "Operazione non riuscita. Riprova tra poco.";
  }

  // ---------- configurazione mancante ----------
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("INCOLLA") || !window.supabase) {
    $app.innerHTML = `<div class="wrap narrow"><div class="card"><h2>Configurazione mancante</h2>
      <p>Apri <b>config.js</b> e incolla l'indirizzo e la chiave del progetto Supabase, come spiegato nella guida.</p></div></div>`;
    return;
  }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ---------- stato ----------
  const S = {
    session: null, user: null, profile: null,
    teams: [], memberships: [],
    team: null, me: null, members: [], events: [], rides: [], bookings: [], vehicles: [], requests: [],
    ui: {}, showPast: false, channel: null, loadedTeam: null, aiPreview: null
  };
  const isAdmin = () => S.me && S.me.role === "admin" && S.me.status === "active";
  const premium = (t) => (t || S.team)?.plan !== "free";

  // ---------- autenticazione ----------
  async function init() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    sb.auth.onAuthStateChange((_ev, session) => {
      const was = !!S.session; S.session = session;
      if (!!session !== was) { S.profile = null; route(); }
    });
    window.addEventListener("hashchange", route);
    route();
  }

  async function ensureProfile() {
    if (S.profile) return S.profile;
    S.user = (await sb.auth.getUser()).data.user;
    const { data } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
    S.profile = data || { id: S.user.id, display_name: "", phone: "" };
    try { S.platformAdmin = (await sb.rpc("is_platform_admin")).data === true; } catch (e) { S.platformAdmin = false; }
    if (S.profile.phone == null) S.profile.phone = "";
    await loadConsents();
    return S.profile;
  }

  // ---------- consensi ----------
  const TERMS_VERSION = "1";
  const season = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 8 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`; };
  async function loadConsents() {
    S.consents = {}; S.consentLog = [];
    try {
      const { data } = await sb.from("consents").select("kind,version,granted,created_at").eq("user_id", S.user.id).order("created_at", { ascending: false });
      S.consentLog = data || [];
      S.consentLog.forEach((c) => { const k = c.kind === "club" || c.kind === "driver" ? c.kind + ":" + c.version : c.kind; if (!(k in S.consents)) S.consents[k] = c; });
    } catch (e) { /* tabella non ancora creata */ S.consents = null; }
  }
  const hasConsent = (k) => !!(S.consents && S.consents[k] && S.consents[k].granted);
  const consentsOk = () => S.consents === null || (hasConsent("terms") && S.consents.terms.version === TERMS_VERSION && hasConsent("parent"));
  async function saveConsent(kind, granted, version) {
    const row = { user_id: S.user.id, kind, version: version || (kind === "terms" ? TERMS_VERSION : ""), granted: !!granted };
    const { error } = await sb.from("consents").insert(row); if (error) throw error;
    const k = kind === "club" || kind === "driver" ? kind + ":" + row.version : kind;
    if (S.consents) S.consents[k] = { ...row, created_at: new Date().toISOString() };
    S.consentLog.unshift({ ...row, created_at: new Date().toISOString() });
  }
  const driverOk = () => hasConsent("driver:" + season());

  // finestra dei consensi (primo accesso e Termini aggiornati)
  function viewConsents() {
    const updated = S.consents && S.consents.terms && S.consents.terms.version !== TERMS_VERSION;
    const open = S.ui.legalOpen;
    $app.innerHTML = `<div class="hero"><div class="in"><h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg" alt="Carpoolino" class="wordmark"></h1></div></div>
      <div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cons-title">
        <img src="icon.svg" alt="" width="56" height="56" class="modal-icon">
        <h2 id="cons-title">${updated ? "Abbiamo aggiornato i Termini" : "Prima di iniziare, due cose importanti"}</h2>
        ${open ? `<div class="legal-box">${LEGAL[open].html}</div><button class="btn-ghost" data-act="legal-close">← Torna al riepilogo</button>` : `
        <div class="cons-item"><span aria-hidden="true">🤝</span><div><b>Carpoolino mette in contatto le famiglie, non organizza i viaggi.</b> I passaggi sono accordi gratuiti tra genitori: chi guida è responsabile del proprio viaggio.</div></div>
        <div class="cons-item"><span aria-hidden="true">🚗</span><div><b>Chi offre un passaggio deve poter trasportare i ragazzi in sicurezza:</b> patente valida, auto assicurata e revisionata, rispetto del codice della strada, cinture o seggiolini per tutti, non più passeggeri dei posti omologati.</div></div>
        <div class="cons-item"><span aria-hidden="true">🔒</span><div><b>I tuoi dati restano qui.</b> Nome, cellulare e nome dei tuoi figli li vedono solo le tue squadre. Niente pubblicità profilata, nessun dato ceduto a terzi, nessuna posizione in tempo reale.</div></div>`}
        <form class="form" data-form="consents">
          <label class="full check"><input type="checkbox" name="terms" required ${hasConsent("terms") && !updated ? "checked" : ""}> <span>Ho letto e accetto i <button type="button" class="btn-link" data-act="legal-open" data-v="termini">Termini d'uso</button> e l'<button type="button" class="btn-link" data-act="legal-open" data-v="privacy">Informativa privacy</button> <small class="muted">(obbligatorio)</small></span></label>
          <label class="full check"><input type="checkbox" name="parent" required ${hasConsent("parent") ? "checked" : ""}> <span>Sono il genitore, o chi ne fa le veci, degli atleti che inserirò <small class="muted">(obbligatorio)</small></span></label>
          <div class="full label" style="margin-top:4px">Facoltativi</div>
          <label class="full check switch"><input type="checkbox" name="news" ${hasConsent("news") ? "checked" : ""}> <span>Ricevere via email novità e consigli d'uso di Carpoolino</span></label>
          <label class="full check switch"><input type="checkbox" name="stats" ${hasConsent("stats") ? "checked" : ""}> <span>Statistiche d'uso anonime per migliorare l'app</span></label>
          <div class="actions"><button class="btn-primary btn-block" type="submit">Continua</button></div>
        </form>
        <p class="small muted" style="margin:0">Puoi cambiare i consensi facoltativi quando vuoi da Profilo › Privacy e consensi.</p>
      </div></div>`;
  }

  // ---------- Termini d'uso e Informativa privacy (bozze da far rivedere a un legale) ----------
  const LEGAL_UPDATED = "15 ottobre 2026";
  const LEGAL = {
    termini: { title: "Termini d'uso", html: `
      <p class="muted">Versione ${TERMS_VERSION} · aggiornati il ${LEGAL_UPDATED}. Gestore del servizio: &lt;titolare&gt;.</p>
      <h3>1. Cos'è Carpoolino</h3>
      <p>Carpoolino è uno strumento online che aiuta i genitori e le società sportive a coordinare i passaggi in auto verso trasferte, partite e allenamenti. Carpoolino <b>mette in contatto le famiglie ma non organizza, non effettua e non intermedia trasporti</b>: non è un vettore, un'agenzia né un servizio di noleggio con conducente.</p>
      <h3>2. Passaggi di cortesia, gratuiti</h3>
      <p>I passaggi pubblicati sono accordi liberi e <b>gratuiti</b> tra privati (trasporto di cortesia). Carpoolino non gestisce pagamenti e vieta di chiedere o offrire compensi per i passaggi. Ogni eventuale accordo diverso riguarda solo le persone coinvolte.</p>
      <h3>3. Chi guida</h3>
      <p>Chi offre un passaggio dichiara, e garantisce per tutta la durata del viaggio, di:</p>
      <ul><li>avere una patente valida e non sospesa, ed essere in condizioni idonee alla guida;</li>
        <li>usare un veicolo con assicurazione RC auto in corso di validità e revisione regolare;</li>
        <li>rispettare il codice della strada, usare cinture di sicurezza e, dove previsto, sistemi di ritenuta adeguati all'età dei ragazzi;</li>
        <li>non trasportare più persone dei posti omologati del veicolo.</li></ul>
      <p><b>Chi guida è l'unico responsabile del viaggio</b> e del rispetto di questi obblighi. La dichiarazione viene richiesta all'interno dell'app e rinnovata a ogni stagione sportiva.</p>
      <h3>4. Genitori e accompagnatori</h3>
      <p>Il genitore, o chi esercita la responsabilità genitoriale, decide liberamente se affidare il proprio figlio a un altro conducente e se accettare un passaggio. È sua cura verificare che le condizioni del viaggio siano adeguate.</p>
      <h3>5. Società sportive e mezzi della società</h3>
      <p>La società che usa Carpoolino resta responsabile dei propri mezzi, dei propri autisti e delle proprie coperture assicurative. Carpoolino non sostituisce le polizze della società né quelle dei singoli conducenti.</p>
      <h3>6. Limitazione di responsabilità</h3>
      <p>Nei limiti consentiti dalla legge, il gestore di Carpoolino non risponde di sinistri, danni a persone o cose, ritardi, mancati passaggi o comportamenti degli utenti durante i viaggi, che restano regolati dai rapporti tra le persone coinvolte e dalle rispettive assicurazioni. Restano ferme le responsabilità che la legge non consente di escludere.</p>
      <h3>7. Uso corretto</h3>
      <p>Inserisci solo dati veri e che hai il diritto di condividere, non usare l'app per scopi diversi dal coordinamento dei passaggi e rispetta gli altri membri della squadra. Gli amministratori possono rimuovere chi non rispetta queste regole.</p>
      <h3>8. Servizio e modifiche</h3>
      <p>Il servizio è offerto così com'è, in versione beta, e può cambiare o essere sospeso. Se modifichiamo questi Termini te lo chiederemo di nuovo al primo accesso. Puoi chiudere il tuo account in qualsiasi momento da Profilo › Privacy e consensi.</p>
      <h3>9. Contatti</h3>
      <p>&lt;titolare&gt; · &lt;email di contatto&gt;</p>` },
    privacy: { title: "Informativa privacy", html: `
      <p class="muted">Aggiornata il ${LEGAL_UPDATED} · ai sensi del Regolamento UE 2016/679 (GDPR).</p>
      <h3>Titolare del trattamento</h3>
      <p>&lt;titolare&gt; · &lt;indirizzo&gt; · &lt;email per la privacy&gt;</p>
      <h3>Quali dati trattiamo</h3>
      <ul><li><b>Account:</b> email, usata solo per l'accesso con codice.</li>
        <li><b>Profilo:</b> nome che scegli e numero di cellulare.</li>
        <li><b>Squadre:</b> le squadre a cui partecipi, il tuo ruolo e il nome dei tuoi atleti.</li>
        <li><b>Passaggi:</b> auto offerte, posti prenotati, richieste, punti di partenza e orari che inserisci.</li>
        <li><b>Consensi:</b> cosa hai accettato e quando.</li>
        <li><b>Statistiche d'uso</b> (solo se le attivi): giorni di apertura dell'app e uso delle funzioni, senza dati di posizione.</li></ul>
      <p>Non raccogliamo indirizzi di casa, posizione in tempo reale o dati di pagamento.</p>
      <h3>Dati dei minori</h3>
      <p>Il nome degli atleti, spesso minorenni, è inserito dal genitore o da chi ne fa le veci, che dichiara di averne il diritto. È visibile solo ai membri della stessa squadra.</p>
      <h3>Perché e su quale base</h3>
      <ul><li>Far funzionare il servizio che hai richiesto: account, squadre e passaggi (esecuzione del servizio).</li>
        <li>Conservare la prova dei consensi e delle dichiarazioni (obbligo e legittimo interesse a tutela del servizio).</li>
        <li>Inviarti novità via email e raccogliere statistiche d'uso, solo con il tuo consenso, revocabile in ogni momento.</li></ul>
      <h3>Chi vede i tuoi dati</h3>
      <p>Il tuo nome, il cellulare e il nome dei tuoi atleti sono visibili solo ai membri delle tue squadre. <b>Non vendiamo né cediamo dati a terzi e non facciamo pubblicità profilata.</b> Gli sponsor mostrati nell'app non ricevono dati personali: conteggiamo solo visualizzazioni e clic in forma aggregata.</p>
      <h3>Fornitori tecnici</h3>
      <p>Supabase (database e accesso, server nell'Unione Europea), Brevo (invio delle email), GitHub Pages (pubblicazione del sito), Anthropic (lettura dei calendari caricati dagli amministratori, senza dati dei genitori). Trattano i dati solo per nostro conto.</p>
      <h3>Per quanto tempo</h3>
      <p>Finché hai un account. Se lo elimini, cancelliamo profilo, iscrizioni, passaggi e prenotazioni; resta solo ciò che la legge ci obbliga a conservare.</p>
      <h3>I tuoi diritti</h3>
      <p>Puoi accedere ai tuoi dati, correggerli, scaricarli, chiederne la cancellazione o limitarne l'uso, e revocare i consensi facoltativi. Molte di queste cose le fai da solo in Profilo › Privacy e consensi; per il resto scrivi a &lt;email per la privacy&gt;. Puoi anche presentare reclamo al Garante per la protezione dei dati personali.</p>
      <h3>Cookie</h3>
      <p>Usiamo solo la memoria tecnica del browser necessaria a tenerti collegato e a ricordare le tue preferenze. Nessun cookie di profilazione o di terze parti.</p>` }
  };
  function viewLegal(kind) {
    const L = LEGAL[kind];
    $app.innerHTML = topBar({ title: L.title, back: S.session ? "#/profilo" : "#/" }) + `<div class="wrap narrow"><article class="card legal">${L.html}
      <p class="small muted">Bozza in revisione: il testo definitivo sarà verificato da un legale.</p></article></div>` + footer();
    window.scrollTo(0, 0);
  }



  // ---------- primo contatto: benvenuto, codice squadra, accesso ----------
  // S.ui.landing: "welcome" (default) · "code" (scrivi il codice) · "email" (accesso)
  function viewLogin(nextHash) {
    if (nextHash) store("it-next", nextHash);
    const next = store("it-next") || "";
    const invite = next.startsWith("#/join/");
    const step = S.ui.loginEmail ? "otp" : (invite || next === "#/new") && !S.ui.landing ? "email" : (S.ui.landing || "welcome");
    const hero = (big) => `<div class="hero"><div class="in">
        <h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg" alt="Carpoolino" class="wordmark"></h1>
        <p style="font-size:1.2rem;margin:0">Le trasferte della squadra, organizzate in un minuto.</p>
        ${big ? `<p class="hero-sub">I genitori offrono i posti in auto, gli altri prenotano: niente più giri di messaggi la sera prima.</p>` : ""}
      </div></div>`;
    const privacy = `<p class="small muted" style="text-align:center"><a href="#/termini">Termini d'uso</a> · <a href="#/privacy">Informativa privacy</a> · Nessuna pubblicità profilata, nessun dato ceduto a terzi.</p>`;
    let body = "";
    if (step === "welcome") {
      body = `<div class="feat">
          <div><span aria-hidden="true">🚗</span><b>Chi guida offre i posti</b></div>
          <div><span aria-hidden="true">🙋</span><b>Chi non ha passaggio lo chiede</b></div>
          <div><span aria-hidden="true">🌱</span><b>Risparmi km, euro e CO₂</b></div>
        </div>
        <button class="choice" data-act="landing-create"><b>Registra la tua squadra</b><span>Per allenatori e dirigenti: crei la squadra e inviti i genitori</span></button>
        <button class="choice" data-act="landing-join"><b>Entra nella squadra di tuo figlio</b><span>Hai ricevuto un link, un QR o un codice</span></button>
        <p style="text-align:center;margin:4px 0 0">Hai già un account? <button class="btn-link" data-act="landing-login">Accedi</button></p>`;
    } else if (step === "code") {
      body = `<form class="card form" data-form="landing-code">
          <h2 class="full">Entra nella squadra</h2>
          <label class="full">Codice della squadra<input name="code" required maxlength="40" autocapitalize="characters" autocomplete="off" placeholder="Es. OLI-7K4M2"></label>
          <p class="full small muted" style="margin:0">Il codice te lo dà l'allenatore o lo trovi sotto il QR. Se hai ricevuto un link su WhatsApp, aprilo: entri direttamente. Il QR si inquadra con la fotocamera del telefono.</p>
          <div class="actions"><button class="btn-primary" type="submit">Continua</button><button class="btn-ghost" type="button" data-act="landing-back">Indietro</button></div>
        </form>`;
    } else if (step === "email") {
      const title = next === "#/new" ? "Registra la tua squadra" : invite ? "" : "Accedi";
      body = `${invite ? `<div class="card invite-banner"><div class="label">Sei stato invitato in</div><h2 id="inv-name">${esc(S.ui.inviteName || "…")}</h2><div class="small muted">Accedi con la tua email per entrare nella squadra.</div></div>` : ""}
        <form class="card form" data-form="login-email">
          ${title ? `<h2 class="full">${title}</h2>` : ""}
          <label class="full">La tua email<input type="email" name="email" required autocomplete="email" placeholder="nome@esempio.it"></label>
          <div class="actions"><button class="btn-primary btn-block" type="submit">Ricevi il codice di accesso</button></div>
          <p class="full small muted" style="margin:0">Niente password: ti mandiamo un codice di 6 cifre via email. Se è la prima volta, l'account si crea da solo.</p>
        </form>
        <p style="text-align:center;margin:0"><button class="btn-link" data-act="landing-back">← Indietro</button></p>`;
    } else {
      body = `<form class="card form" data-form="login-code">
          <p class="full" style="margin:0">Abbiamo scritto a <b>${esc(S.ui.loginEmail)}</b>. Inserisci il codice ricevuto, oppure apri il link nella mail da questo stesso telefono.</p>
          <label class="full">Codice<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required placeholder="123456"></label>
          <div class="actions"><button class="btn-primary" type="submit">Entra</button><button class="btn-ghost" type="button" data-act="login-restart">Cambia email</button></div>
        </form>`;
    }
    $app.innerHTML = hero(step === "welcome") + `<div class="wrap narrow">${body}${privacy}</div>`;
    // nome della squadra dell'invito, visibile anche prima di accedere
    if (step === "email" && invite && !S.ui.inviteName) {
      const codes = decodeURIComponent(next.slice(7)).split(",").filter(Boolean);
      Promise.all(codes.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) || null, () => null))).then((ts) => {
        const names = ts.filter(Boolean).map((t) => t.team_name);
        S.ui.inviteName = names.length ? names.join(" e ") : "una squadra";
        const el = document.getElementById("inv-name"); if (el) el.textContent = S.ui.inviteName;
      });
    }
  }

  function viewName() {
    $app.innerHTML = `<div class="wrap narrow">
      <h1>Come ti chiami?</h1>
      <form class="card form" data-form="profile-name">
        <label class="full">Il tuo nome, come ti vedranno gli altri genitori<input name="name" required maxlength="80" placeholder="${store("it-next") === "#/new" ? "Es. Marco Rossi, allenatore" : "Es. Paolo, papà di Matteo"}" value="${esc(S.profile?.display_name || "")}"></label>
        <label class="full">Il tuo cellulare (per gli avvisi WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile?.phone || "")}"></label>
        <p class="full small muted" style="margin:0">Il numero lo vedono solo i genitori delle tue squadre: serve per avvisare con un tocco chi guida o chi ha prenotato.</p>
        <div class="actions"><button class="btn-primary" type="submit">Continua</button></div>
      </form></div>`;
  }

  const logEvent = (kind, team, qty) => { if (!hasConsent("stats")) return; try { sb.rpc("log_event", { p_kind: kind, p_team: team || null, p_qty: qty || 0 }).then(() => {}, () => {}); } catch (e) { /* facoltativo */ } };
  function logOpenOncePerDay() { const d = new Date().toISOString().slice(0, 10); if (store("cp-open") !== d) { store("cp-open", d); logEvent("app_open"); } }

  // ---------- router ----------
  async function route() {
    const hash = location.hash || "#/";
    const p0 = hash.slice(2).split("/")[0];
    if (p0 === "termini" || p0 === "privacy") return viewLegal(p0);
    if (!S.session) return viewLogin(hash !== "#/" ? hash : null);
    try { await ensureProfile(); } catch (e) { toast(errMsg(e)); }
    if (!consentsOk()) return viewConsents();
    if (!S.profile?.display_name) return viewName();
    logOpenOncePerDay();
    const next = store("it-next");
    if (next) { store("it-next", null); if (next !== hash) { location.hash = next; return; } }

    const parts = hash.slice(2).split("/");
    if (parts[0] === "join" && parts[1]) return viewJoin(decodeURIComponent(parts[1]));
    if (parts[0] === "new") return viewNewTeam();
    if (parts[0] === "squadre") return viewHome(true);
    if (parts[0] === "profilo") return viewProfile();
    if (parts[0] === "admin") return viewAdmin();
    if (parts[0] === "t" && parts[1]) return viewTeam(parts[1], parts[2] || "trasferte");
    return viewHome();
  }

  function topBar({ title, sub, back, backLabel, tabs, active, teamId }) {
    return `<header class="top"><div class="in">
      ${back ? `<a class="iconbtn" href="${back}" aria-label="${esc(backLabel || "Indietro")}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></a>` : ""}
      <a class="brand" href="#/" aria-label="Carpoolino, home"><img src="icon.svg" alt="" width="38" height="38"><img src="logo.svg" alt="" class="wordmark"></a>
      <div class="grow"></div>
      <a class="iconbtn ring" href="#/profilo" aria-label="Profilo">${esc(initials(S.profile?.display_name))}</a>
    </div>
    ${title || sub ? `<div class="in titlerow"><div class="grow">${title ? `<div class="title">${esc(title)}</div>` : ""}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div>` : ""}
    ${tabs ? `<nav class="tabs" aria-label="Sezioni squadra">${tabs.map(([k, l]) => `<a href="#/t/${teamId}/${k}" ${k === active ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>` : ""}
    </header>`;
  }
  function logoSvg(h) {
    return `<svg width="${Math.round(h * 0.85)}" height="${h}" viewBox="0 0 64 75" aria-hidden="true"><path d="M32 2C16.5 2 4 14.2 4 29.4 4 50 32 73 32 73s28-23 28-43.6C60 14.2 47.5 2 32 2z" fill="#2FB36A"/><path d="M15 37v-5c0-1.7 1.1-3.2 2.8-3.7l5-1.5 5.5-6.6c.9-1.1 2.3-1.7 3.7-1.7h7.6c1.5 0 2.8.6 3.7 1.7l5.3 6.3 3 .8c1.8.4 3 2 3 3.8V37z" fill="#fff"/><circle cx="23" cy="38" r="4.2" fill="#16202E"/><circle cx="41" cy="38" r="4.2" fill="#16202E"/></svg>`;
  }
  // versione letta dall'indirizzo di app.js in index.html (es. app.js?v=20261015-3)
  const APP_VERSION = ((document.querySelector('script[src*="app.js"]') || {}).src || "").split("v=")[1] || "";
  const footer = () => `<footer class="foot">Carpoolino beta${APP_VERSION ? " · versione " + esc(APP_VERSION) : ""} · solo coordinamento tra famiglie, nessun pagamento · <a href="#/termini">Termini</a> · <a href="#/privacy">Privacy</a> · <a href="mailto:${esc(CFG.SUPPORT_EMAIL || "")}">segnala un problema</a></footer>`;

  // ---------- home: le mie squadre ----------
  async function viewHome(stay) {
    unsubscribe();
    $app.innerHTML = topBar({}) + `<div class="wrap"><div class="boot">Carico le tue squadre…</div></div>`;
    const uid = S.user.id;
    const { data: mems, error } = await sb.from("team_members").select("team_id, role, status, athletes").eq("user_id", uid);
    if (error) return toast(errMsg(error));
    S.memberships = mems || [];
    const ids = S.memberships.filter((m) => m.status === "active").map((m) => m.team_id);
    if (!stay && ids.length) { const last = store("it-last-team"); location.replace("#/t/" + (ids.includes(last) ? last : ids[0]) + "/trasferte"); return; }
    let teams = [], events = [], rides = [], bookings = [];
    if (ids.length) {
      teams = (await sb.from("teams").select("*").in("id", ids)).data || [];
      const now = new Date().toISOString();
      events = (await sb.from("events").select("id,team_id,title,starts_at").in("team_id", ids).gte("starts_at", now).order("starts_at")).data || [];
      const evIds = events.map((e) => e.id);
      if (evIds.length) {
        rides = (await sb.from("rides").select("id,event_id,seats").in("event_id", evIds)).data || [];
        bookings = (await sb.from("bookings").select("id,ride_id").in("event_id", evIds)).data || [];
      }
    }
    const pending = S.memberships.filter((m) => m.status === "pending");
    const cards = teams.map((t) => {
      const m = S.memberships.find((x) => x.team_id === t.id);
      const evs = events.filter((e) => e.team_id === t.id);
      const nextEv = evs[0];
      const noCar = evs.filter((e) => !rides.some((r) => r.event_id === e.id)).length;
      const free = rides.filter((r) => evs.some((e) => e.id === r.event_id)).reduce((a, r) => a + Math.max(0, r.seats - bookings.filter((b) => b.ride_id === r.id).length), 0);
      return `<a class="card teamcard" href="#/t/${t.id}/trasferte">
        <div class="between"><div><h2>${esc(t.name)}</h2><div class="meta">${esc(sportOf(t).label)}${t.category ? " · " + esc(t.category) : ""} · ${esc(t.season)}</div></div>
        <span class="chip ${m.role === "admin" ? "navy" : ""}">${m.role === "admin" ? "Amministratore" : "Genitore"}</span></div>
        <div class="stats"><div><b>${evs.length}</b>trasferte</div><div><b>${free}</b>posti liberi</div><div class="${noCar ? "warn" : ""}"><b>${noCar}</b>senza auto</div></div>
        ${nextEv ? `<div class="small muted">Prossima: <b style="color:var(--ink)">${(() => { const p = dateParts(nextEv.starts_at); return `${p.dow} ${p.day} ${p.mon} · ${esc(nextEv.title)}`; })()}</b></div>` : ""}
      </a>`;
    }).join("");
    $app.innerHTML = topBar({}) + `<div class="wrap">
      <div><div class="muted">Ciao ${esc(S.profile.display_name.split(",")[0])}</div><h1>Le mie squadre</h1></div>
      ${pending.length ? `<div class="notice">Hai ${pending.length} richiest${pending.length === 1 ? "a" : "e"} in attesa di approvazione da parte dell'amministratore.</div>` : ""}
      ${cards || `<div class="card"><h2>Benvenuto in Carpoolino</h2><div class="muted">Non sei ancora in nessuna squadra. Cosa vuoi fare?</div></div>`}
      ${!cards && !S.ui.codeOpen ? `<button class="choice" data-act="code-open"><b>Entra nella squadra di tuo figlio</b><span>Scrivi il codice che ti ha dato l'allenatore, oppure apri il link ricevuto</span></button>
        <a class="choice" href="#/new"><b>Registra la tua squadra</b><span>Per allenatori e dirigenti: crei la squadra e inviti i genitori</span></a>` : ""}
      <div class="stack">
        ${cards ? `<a class="btn btn-primary btn-block" href="#/new">+ Registra una nuova squadra</a>` : ""}
        ${S.ui.codeOpen ? `<form class="card form" data-form="code-join"><label class="full">Codice della squadra<input name="code" required maxlength="40" autocapitalize="characters" autocomplete="off" placeholder="Es. OLI-7K4M2"></label><div class="actions"><button class="btn-primary" type="submit">Continua</button><button class="btn-ghost" type="button" data-act="code-close">Annulla</button></div></form>`
          : cards ? `<button class="btn-ghost btn-block" data-act="code-open">Ho un codice invito</button>` : ""}
      </div></div>` + footer();
  }

  // ---------- nuova squadra (solo amministratori) ----------
  const canCreateTeam = () => !!S.user; // chi registra una squadra ne diventa amministratore

  async function viewNewTeam() {
    unsubscribe();
    if (!S.memberships) { const { data } = await sb.from("team_members").select("team_id, role, status, athletes").eq("user_id", S.user.id); S.memberships = data || []; }
    const sp = S.ui.newSport || "basket", L = SPORTS[sp];
    $app.innerHTML = topBar({ title: "Registra la squadra", back: S.memberships.length ? "#/squadre" : "" }) + `<div class="wrap">
      ${wizardSteps(1)}
      <form class="card form" data-form="new-team">
        <div class="full stack" style="gap:8px"><div class="label">Sport</div>
          <div class="pill-group" role="radiogroup" aria-label="Sport">${SPORT_ORDER.map((k) => `<button type="button" class="pill" role="radio" aria-checked="${k === sp}" data-act="pick-sport" data-v="${k}">${esc(SPORTS[k].label)}</button>`).join("")}</div></div>
        <label class="full">Nome squadra<input name="name" required minlength="2" maxlength="80" placeholder="Es. Urania Milano U17"></label>
        <label>Categoria<input name="category" maxlength="40" placeholder="Es. U17"></label>
        <label>Stagione<input name="season" maxlength="20" value="2026/27"></label>
        <label class="full">Tuo figlio gioca in questa squadra? Scrivi il suo nome (facoltativo)<input name="athletes" maxlength="200" placeholder="Es. Luca — più nomi separati da virgola"></label>
        <div class="full card" style="background:var(--bg)"><div class="label">Così vedranno le pagine i genitori</div>
          <div class="small">Luogo: <b>${esc(L.place)}</b> · Orario: <b>${esc(L.time)}</b> · Evento: <b>${esc(L.event)}</b></div></div>
        <label class="full check declare"><input name="role-ok" type="checkbox" required> <span>Sono l'allenatore o un dirigente di questa squadra e accetto i <a href="#/termini" target="_blank">Termini</a> per le società: mezzi, autisti e coperture assicurative della società restano sotto la sua responsabilità.</span></label>
        <p class="full small muted" style="margin:0">Diventerai l'amministratore: aggiungi le trasferte e inviti i genitori. Se tuo figlio è già in una squadra su Carpoolino, non crearne un'altra: chiedi il link all'allenatore.</p>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Crea la squadra e continua</button></div>
      </form></div>`;
  }

  // ---------- entrare con invito ----------
  async function viewJoin(code) {
    unsubscribe();
    const codes = [...new Set(String(code).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (codes.length > 1) return viewJoinMulti(codes);
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="boot">Controllo l'invito…</div></div>`;
    logEvent("invite_open");
    const { data, error } = await sb.rpc("preview_invite", { p_code: code });
    const t = data && data[0];
    if (error || !t) {
      $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="empty"><strong>Invito non valido</strong>${ERRORS.invalid_code}</div></div>`;
      return;
    }
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow">
      <div class="card"><div class="label">Ti hanno invitato in</div><h1>${esc(t.team_name)}</h1>
        <div class="meta">${esc((SPORTS[t.sport] || SPORTS.altro).label)}${t.category ? " · " + esc(t.category) : ""} · ${esc(t.season)}</div></div>
      <form class="card form" data-form="join" data-code="${esc(code)}">
        <label class="full">Nome del tuo atleta<input name="athletes" required maxlength="200" placeholder="Es. Luca — più nomi separati da virgola"></label>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Entra nella squadra</button></div>
        <p class="full small muted" style="margin:0">Gli altri membri della squadra vedranno il tuo nome e quello del tuo atleta.</p>
      </form></div>`;
  }

  async function viewJoinMulti(codes) {
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="boot">Controllo l'invito…</div></div>`;
    logEvent("invite_open");
    const prev = await Promise.all(codes.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) || null, () => null)));
    // squadre in cui sei già: confronto con i codici delle tue squadre
    const { data: mine } = await sb.from("team_members").select("team_id,status").eq("user_id", S.user.id);
    const myIds = (mine || []).map((m) => m.team_id);
    const myTeams = myIds.length ? (await sb.from("teams").select("id,invite_code").in("id", myIds)).data || [] : [];
    const already = new Set(myTeams.map((t) => t.invite_code));
    const rows = codes.map((c, i) => ({ code: c, t: prev[i], member: already.has(c) }));
    if (!rows.some((r) => r.t)) { $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="empty"><strong>Invito non valido</strong>${ERRORS.invalid_code}</div></div>`; return; }
    const open = rows.filter((r) => r.t && !r.member);
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow">
      <div class="card"><div class="label">Ti hanno invitato in ${rows.filter((r) => r.t).length} squadre</div>
        <div class="small muted">Spunta le squadre in cui gioca un tuo figlio e scrivi il suo nome accanto.</div></div>
      <form class="card form" data-form="join-multi">
        ${rows.map((r) => !r.t ? `<div class="full small muted">Un codice dell'invito non è più valido (${esc(r.code)}).</div>`
          : r.member ? `<div class="full"><b>${esc(r.t.team_name)}</b> <span class="chip ok">ci sei già</span></div>`
          : `<div class="full join-row">
              <label class="check"><input type="checkbox" name="pick" value="${esc(r.code)}" ${open.length === 1 ? "checked" : ""}> <span><b>${esc(r.t.team_name)}</b><span class="small muted"> · ${esc((SPORTS[r.t.sport] || SPORTS.altro).label)}${r.t.category ? " · " + esc(r.t.category) : ""}</span></span></label>
              <input name="ath-${esc(r.code)}" maxlength="200" placeholder="Nome dell'atleta in questa squadra" aria-label="Nome dell'atleta in ${esc(r.t.team_name)}">
            </div>`).join("")}
        ${open.length ? `<div class="actions"><button class="btn-primary btn-block" type="submit">Entra nelle squadre scelte</button></div>
        <p class="full small muted" style="margin:0">Gli altri membri di ogni squadra vedranno il tuo nome e quello del tuo atleta.</p>` : `<div class="full"><a class="btn btn-primary btn-block" href="#/">Vai alle trasferte</a></div>`}
      </form></div>`;
  }

  // ---------- profilo ----------
  function viewProfile() {
    unsubscribe();
    $app.innerHTML = topBar({ title: "Profilo", back: "#/" }) + `<div class="wrap narrow">
      <form class="card form" data-form="profile-name">
        <label class="full">Il tuo nome<input name="name" required maxlength="80" value="${esc(S.profile.display_name)}"></label>
        <label class="full">Cellulare (per WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile.phone || "")}"></label>
        <div class="full small muted">Il numero è visibile solo ai genitori delle tue squadre.</div>
        <div class="full small muted">Accesso con: ${esc(S.user.email || "")}</div>
        <div class="actions"><button class="btn-primary" type="submit">Salva e torna alle trasferte</button></div>
      </form>
      <a class="btn btn-ghost btn-block" href="#/">← Torna alle trasferte</a>
      ${S.platformAdmin ? `<a class="btn btn-primary btn-block" href="#/admin">Pannello di amministrazione</a>` : ""}
      ${privacyCard()}
      <div class="card small">
        ${S.ui.confirmLogout ? `<div><b>Vuoi uscire da Carpoolino su questo dispositivo?</b></div>
          <div class="muted">Per rientrare dovrai inserire di nuovo la tua email e il codice che ti arriva.</div>
          <div class="row"><button class="btn-link danger" data-act="logout">Sì, esci</button><button class="btn-link" data-act="logout-cancel">No, resta collegato</button></div>`
        : `<div class="muted">Resti collegato su questo dispositivo finché non esci.</div><div><button class="btn-link danger" data-act="logout-ask">Esci dall'account</button></div>`}
      </div>
    </div>` + footer();
  }

  function privacyCard() {
    const c = S.consents || {};
    const when = (k) => c[k] ? new Date(c[k].created_at).toLocaleDateString("it-IT") : "—";
    const drv = c["driver:" + season()];
    return `<div class="card" id="privacy">
      <div class="label">Privacy e consensi</div>
      <div class="small">✓ Termini d'uso e Informativa privacy · versione ${esc((c.terms && c.terms.version) || "—")} · accettati il ${when("terms")}</div>
      <div class="small">✓ Dichiarazione di genitore o tutore · ${when("parent")}</div>
      <div class="small">${drv && drv.granted ? `✓ Dichiarazione del conducente, stagione ${esc(season())} · ${new Date(drv.created_at).toLocaleDateString("it-IT")}` : `Dichiarazione del conducente: ti verrà chiesta la prima volta che offri un passaggio in questa stagione`}</div>
      <label class="check switch"><input type="checkbox" data-act="consent-toggle" data-k="news" ${hasConsent("news") ? "checked" : ""}> <span>Ricevere via email novità e consigli d'uso</span></label>
      <label class="check switch"><input type="checkbox" data-act="consent-toggle" data-k="stats" ${hasConsent("stats") ? "checked" : ""}> <span>Statistiche d'uso anonime</span></label>
      <div class="row small"><a href="#/termini">Termini d'uso</a> · <a href="#/privacy">Informativa privacy</a></div>
      <div class="row"><button class="btn-ghost" data-act="data-export">Scarica i miei dati</button></div>
      ${S.ui.confirmDelete ? `<div class="notice"><b>Eliminare definitivamente l'account?</b><div class="small">Cancelliamo profilo, iscrizioni alle squadre, auto offerte, prenotazioni e richieste. Non si può annullare.</div>
          <div class="row"><button class="btn-link danger" data-act="del-account">Sì, elimina il mio account</button><button class="btn-link" data-act="del-cancel">Annulla</button></div></div>`
        : `<div><button class="btn-link danger" data-act="del-ask">Elimina il mio account</button></div>`}
    </div>`;
  }
  async function exportMyData() {
    const uid = S.user.id;
    const [mem, rides, books, reqs] = await Promise.all([
      sb.from("team_members").select("team_id,role,status,athletes,joined_at").eq("user_id", uid),
      sb.from("rides").select("*").eq("created_by", uid),
      sb.from("bookings").select("*").eq("booked_by", uid),
      sb.from("ride_requests").select("*").eq("requested_by", uid)
    ]);
    const ids = (mem.data || []).map((m) => m.team_id);
    const teams = ids.length ? (await sb.from("teams").select("id,name,category,season").in("id", ids)).data || [] : [];
    const out = { esportato_il: new Date().toISOString(), email: S.user.email, profilo: { nome: S.profile.display_name, cellulare: S.profile.phone },
      squadre: (mem.data || []).map((m) => ({ ...m, squadra: (teams.find((t) => t.id === m.team_id) || {}).name })),
      auto_offerte: rides.data || [], prenotazioni: books.data || [], richieste: reqs.data || [], consensi: S.consentLog || [] };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "carpoolino-i-miei-dati.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- pannello amministrazione (solo super-admin) ----------
  async function viewAdmin() {
    unsubscribe();
    if (!S.platformAdmin) { location.hash = "#/"; return; }
    $app.innerHTML = topBar({ title: "Amministrazione", back: "#/profilo" }) + `<div class="wrap"><div class="boot">Calcolo gli indicatori…</div></div>`;
    const { data, error } = await sb.rpc("admin_stats");
    if (error || !data) { $app.innerHTML = topBar({ title: "Amministrazione", back: "#/profilo" }) + `<div class="wrap"><div class="empty"><strong>Dati non disponibili</strong>${esc(errMsg(error))}</div></div>`; return; }
    S.adminData = data;
    const [l, r] = await Promise.all([sb.from("sponsors").select("*").eq("scope", "platform").order("created_at"), sb.rpc("sponsor_report", { p_team: null })]);
    S.platSponsors = l.data || []; S.platSponsorStats = r.data || [];
    renderAdmin();
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const ago = (iso) => { if (!iso) return "—"; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3); return d <= 0 ? "oggi" : d === 1 ? "ieri" : d + " giorni fa"; };
  function renderAdmin() {
    const D = S.adminData, U = D.users, T = D.teams, A = D.activity, AI = D.ai;
    const f = S.ui.adminFilter || "tutte";
    const d30 = Date.now() - 30 * 86400e3;
    let list = D.team_list || [];
    if (f === "attive") list = list.filter((t) => new Date(t.last_activity).getTime() >= d30 && (t.rides > 0 || t.bookings > 0));
    if (f === "dormienti") list = list.filter((t) => !t.rides && !t.bookings);
    if (f === "premium") list = list.filter((t) => t.plan === "premium");
    const tile = (v, l, warn) => `<div class="${warn ? "warn" : ""}"><b>${fmt(v)}</b>${l}</div>`;
    const sportName = (k) => (SPORTS[k] || SPORTS.altro).label;
    const W = D.weekly || [];
    const max = Math.max(1, ...W.map((w) => Math.max(w.active_users, w.bookings)));
    const bars = W.map((w, i) => { const x = 8 + i * 26, h1 = Math.round((w.active_users / max) * 90), h2 = Math.round((w.bookings / max) * 90);
      return `<rect x="${x}" y="${100 - h1}" width="10" height="${h1}" rx="2" class="b1"><title>Settimana ${w.week}: ${w.active_users} utenti attivi</title></rect><rect x="${x + 11}" y="${100 - h2}" width="10" height="${h2}" rx="2" class="b2"><title>Settimana ${w.week}: ${w.bookings} posti prenotati</title></rect>`; }).join("");
    const plans = Object.entries(T.by_plan || {}).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(" · ") || "—";
    const sports = Object.entries(T.by_sport || {}).map(([k, v]) => `${esc(sportName(k))}: <b>${v}</b>`).join(" · ") || "—";
    $app.innerHTML = topBar({ title: "Amministrazione", sub: "Visibile solo a te · aggiornato " + new Date(D.generated_at).toLocaleString("it-IT"), back: "#/profilo" }) + `<div class="wrap">
      <div class="card"><div class="label">Utenti</div><div class="stats">
        ${tile(U.total, "registrati")}${tile(U.with_team, "in una squadra")}${tile(U.active_7d, "attivi 7 gg")}${tile(U.active_30d, "attivi 30 gg")}${tile(U.new_30d, "nuovi 30 gg")}${tile(U.signin_30d, "accessi 30 gg")}
      </div></div>
      <div class="card"><div class="label">Squadre</div><div class="stats">
        ${tile(T.total, "registrate")}${tile(T.active_30d, "attive 30 gg")}${tile(T.dormant, "mai usate", T.dormant > 0)}
      </div><div class="small muted">Piani: ${plans}<br>Sport: ${sports}</div></div>
      <div class="card"><div class="label">Utilizzo</div><div class="stats">
        ${tile(A.events, "trasferte caricate")}${tile(A.events_upcoming, "in programma")}${tile(A.events_no_car, "in programma senza auto", A.events_no_car > 0)}
        ${tile(A.rides, "auto/mezzi offerti")}${tile(A.bookings, "posti prenotati")}${tile(A.requests_open, "richieste aperte", A.requests_open > 0)}
      </div><div class="small muted">Riempimento auto (trasferte passate): <b>${pct(A.bookings_past, A.seats_past)}%</b> · mezzi della società: <b>${fmt(A.rides_club)}</b></div></div>
      <div class="card"><div class="label">Import calendario con AI</div><div class="stats">
        ${tile(AI.ok, "riusciti")}${tile(AI.empty, "senza partite", AI.empty > 0)}${tile(AI.error, "errori", AI.error > 0)}${tile(AI.events_found, "partite trovate")}
      </div></div>
      <div class="card"><div class="between"><div class="label">Ultime 12 settimane</div><div class="small"><span class="lg b1"></span> utenti attivi <span class="lg b2"></span> posti prenotati</div></div>
        <svg class="weekly" viewBox="0 0 ${8 + W.length * 26} 104" preserveAspectRatio="none" role="img" aria-label="Andamento settimanale">${bars}<line x1="0" y1="100.5" x2="${8 + W.length * 26}" y2="100.5" class="axis"/></svg>
        <div class="small muted">Gli utenti attivi si contano da oggi in poi: il registro d'uso è appena stato attivato.</div></div>
      <div class="card"><div class="between"><div class="label">Squadre · ${list.length}</div><button class="btn-ghost" data-act="admin-csv">Esporta CSV</button></div>
        <div class="pill-group" role="radiogroup" aria-label="Filtro squadre">${[["tutte", "Tutte"], ["attive", "Attive"], ["dormienti", "Mai usate"], ["premium", "Premium"]].map(([k, l]) => `<button type="button" class="pill" role="radio" aria-checked="${k === f}" data-act="admin-filter" data-v="${k}">${l}</button>`).join("")}</div>
        <div class="tablewrap"><table><thead><tr><th>Squadra</th><th class="num">Membri</th><th class="num">Trasferte</th><th class="num">Auto</th><th class="num">Posti</th><th class="num">AI</th><th>Ultima attività</th></tr></thead>
        <tbody>${list.map((t) => `<tr><td><b>${esc(t.name)}</b><div class="small muted">${esc(sportName(t.sport))}${t.category ? " · " + esc(t.category) : ""} · ${esc(t.plan)}${t.pending ? " · " + t.pending + " in attesa" : ""}</div></td><td class="num">${t.members}</td><td class="num">${t.events}${t.events_upcoming ? ` <span class="muted">(${t.events_upcoming})</span>` : ""}</td><td class="num">${t.rides}</td><td class="num">${t.bookings}</td><td class="num">${t.ai_imports}</td><td>${ago(t.last_activity)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Nessuna squadra.</td></tr>`}</tbody></table></div>
        <div class="small muted">Trasferte: totale (in programma). Squadre "attive": almeno un'auto o una prenotazione e attività negli ultimi 30 giorni.</div></div>
      <div class="card"><div class="between"><div class="label">Sponsor della piattaforma · ${(S.platSponsors || []).length}</div>${S.ui.spEdit ? "" : `<button class="btn-primary" data-act="sp-new">+ Aggiungi</button>`}</div>
        <div class="small muted">Compaiono a rotazione nel banner in cima alle trasferte delle squadre degli sport scelti (fino a 10 per squadra, in ordine casuale), salvo le squadre Premium con sponsor propri attivi.</div>
        ${sponsorList(S.platSponsors || [], S.platSponsorStats, "platform")}</div>
      ${S.ui.spEdit ? sponsorForm(S.ui.spEdit === "new" ? null : (S.platSponsors || []).find((x) => x.id === S.ui.spEdit), "platform") : ""}
      <button class="btn-ghost" data-act="admin-refresh">Aggiorna</button>
    </div>` + footer();
  }
  function adminCSV() {
    const L = S.adminData.team_list || [];
    const head = ["squadra", "sport", "categoria", "stagione", "piano", "creata", "membri", "in_attesa", "trasferte", "in_programma", "auto", "posti_prenotati", "richieste_aperte", "import_ai", "ultima_attivita"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = L.map((t) => [q(t.name), t.sport, q(t.category), q(t.season), t.plan, String(t.created_at).slice(0, 10), t.members, t.pending, t.events, t.events_upcoming, t.rides, t.bookings, t.requests_open, t.ai_imports, String(t.last_activity).slice(0, 10)].join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";")].concat(rows).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "carpoolino-squadre.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- squadra ----------
  function unsubscribe() { if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } S.loadedTeam = null; }

  async function fetchTeamData(id, uid) {
    const [t, me] = await Promise.all([
      sb.from("teams").select("*").eq("id", id).maybeSingle(),
      sb.from("team_members").select("*").eq("team_id", id).eq("user_id", uid).maybeSingle()
    ]);
    if (t.error) throw t.error;
    if (!t.data) return null;
    const [mem, ev, ri, bo, ve, rq] = await Promise.all([
      sb.from("team_members").select("*").eq("team_id", id),
      sb.from("events").select("*").eq("team_id", id).order("starts_at"),
      sb.from("rides").select("*").eq("team_id", id).order("created_at"),
      sb.from("bookings").select("*").eq("team_id", id).order("created_at"),
      sb.from("vehicles").select("*").eq("team_id", id).order("created_at"),
      sb.from("ride_requests").select("*").eq("team_id", id).order("created_at")
    ]);
    return { team: t.data, me: me.data, members: (mem.data || []).map((m) => ({ ...m, team_id: m.team_id || id })), events: ev.data || [], rides: ri.data || [], bookings: bo.data || [], vehicles: ve.data || [], requests: rq.data || [] };
  }

  // Un genitore vede insieme le trasferte di tutte le sue squadre (S.multi);
  // ogni trasferta resta gestita con le regole della propria squadra (withTeam).
  async function loadTeam(id) {
    const uid = S.user.id;
    const main = await fetchTeamData(id, uid);
    if (!main) { S.team = null; S.me = null; return false; }
    S.team = main.team; S.me = main.me;
    let all = [main];
    if (S.me) {
      const { data: mine } = await sb.from("team_members").select("team_id,status").eq("user_id", uid).eq("status", "active");
      const others = (mine || []).map((m) => m.team_id).filter((t) => t !== id);
      if (others.length) all = all.concat((await Promise.all(others.map((t) => fetchTeamData(t, uid).catch(() => null)))).filter(Boolean));
    }
    S.multi = all.length > 1;
    S.teamsById = {}; S.mesById = {};
    all.forEach((d) => { S.teamsById[d.team.id] = d.team; S.mesById[d.team.id] = d.me; });
    S.teamOrder = all.map((d) => d.team.id);
    const allMem = all.flatMap((d) => d.members);
    const memberIds = [...new Set(allMem.map((m) => m.user_id))];
    const prof = memberIds.length ? (await sb.from("profiles").select("id,display_name,phone").in("id", memberIds)).data || [] : [];
    S.allMembers = allMem.map((m) => { const pr = prof.find((p) => p.id === m.user_id) || {}; return { ...m, name: pr.display_name || "Genitore", phone: pr.phone || "" }; });
    S.members = S.allMembers.filter((m) => m.team_id === id);
    const byTime = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
    S.events = all.flatMap((d) => d.events).sort(byTime);
    S.rides = all.flatMap((d) => d.rides); S.bookings = all.flatMap((d) => d.bookings);
    S.vehicles = all.flatMap((d) => d.vehicles); S.requests = all.flatMap((d) => d.requests);
    try { S.sponsors = (await sb.rpc("get_sponsors", { p_team: id })).data || []; } catch (e) { S.sponsors = []; }
    return true;
  }

  // esegue fn come se fosse aperta la squadra tid (dati e permessi di quella squadra)
  function withTeam(tid, fn) {
    if (!S.multi || !S.teamsById || !S.teamsById[tid]) return fn();
    const keep = { team: S.team, me: S.me, members: S.members, events: S.events, rides: S.rides, bookings: S.bookings, requests: S.requests, vehicles: S.vehicles };
    const only = (a) => a.filter((x) => x.team_id === tid);
    try {
      S.team = S.teamsById[tid]; S.me = S.mesById[tid];
      S.members = S.allMembers.filter((m) => m.team_id === tid);
      S.events = only(keep.events); S.rides = only(keep.rides); S.bookings = only(keep.bookings); S.requests = only(keep.requests); S.vehicles = only(keep.vehicles);
      return fn();
    } finally { Object.assign(S, keep); }
  }
  const evTeam = (eid) => (S.events.find((x) => x.id === eid) || {}).team_id || S.team.id;

  function subscribe(id) {
    if (S.loadedTeam === id && S.channel) return;
    unsubscribe(); S.loadedTeam = id;
    let t;
    const refresh = () => { clearTimeout(t); t = setTimeout(async () => { if (S.loadedTeam !== id) return; if (anyFormOpen()) return; await loadTeam(id); renderTeam(); }, 400); };
    let ch = sb.channel("team-" + id);
    const ids = S.multi && S.teamOrder ? S.teamOrder : [id];
    ids.forEach((tid) => ["rides", "bookings", "events", "ride_requests"].forEach((tb) => { ch = ch.on("postgres_changes", { event: "*", schema: "public", table: tb, filter: "team_id=eq." + tid }, refresh); }));
    S.channel = ch.subscribe();
  }
  const anyFormOpen = () => !!(S.ui.offer || S.ui.book || S.ui.club || S.ui.editEvent || S.ui.newEvent || S.ui.req);
  const member = (uid) => S.members.find((m) => m.user_id === uid) || (S.allMembers || []).find((m) => m.user_id === uid) || {};
  const canAddEvents = () => isAdmin();
  const canEditEvent = () => isAdmin();
  const tripLabel = (e) => { const p = dateParts(e.starts_at); return { trip: e.title, d: `${p.dow} ${p.day} ${p.mon}` }; };
  const DIR = { ar: "andata e ritorno", andata: "solo andata", ritorno: "solo ritorno" };

  let currentTab = "trasferte";
  async function viewTeam(id, tab) {
    currentTab = tab;
    if (S.loadedTeam !== id) {
      S.ui = {}; S.aiPreview = null;
      $app.innerHTML = topBar({ title: "…", back: "#/" }) + `<div class="wrap"><div class="boot">Carico la squadra…</div></div>`;
      try { const ok = await loadTeam(id); if (!ok) { $app.innerHTML = topBar({ title: "Squadra", back: "#/" }) + `<div class="wrap"><div class="empty"><strong>Squadra non disponibile</strong>Non fai parte di questa squadra, oppure la tua richiesta è ancora in attesa di approvazione.</div></div>`; return; } }
      catch (e) { toast(errMsg(e)); return; }
      subscribe(id);
    } else if (!anyFormOpen()) {
      try { await loadTeam(id); } catch (e) { /* mostra i dati già caricati */ }
      if (!S.team) { location.hash = "#/"; return; }
    }
    renderTeam();
  }

  // squadre in cui l'utente è amministratore (tra quelle caricate)
  const adminTeamIds = () => (S.teamOrder || [S.team.id]).filter((tid) => { const m = (S.mesById || {})[tid] || (tid === S.team.id ? S.me : null); return m && m.role === "admin" && m.status === "active"; });
  const ADMIN_TABS = ["mezzi", "report", "sponsor", "impostazioni"];
  const teamById = (tid) => (S.teamsById && S.teamsById[tid]) || (tid === S.team.id ? S.team : null);
  function targetTeam(needPremium) {
    let ids = adminTeamIds(); if (needPremium) ids = ids.filter((tid) => premium(teamById(tid)));
    const id = ids.includes(S.ui.adminTeam) ? S.ui.adminTeam : ids.includes(S.team.id) ? S.team.id : ids[0];
    return teamById(id) || S.team;
  }
  function teamSelect(needPremium) {
    let ids = adminTeamIds(); if (needPremium) ids = ids.filter((tid) => premium(teamById(tid)));
    if (ids.length < 2 && ids[0] === S.team.id && !S.multi) return "";
    const cur = targetTeam(needPremium).id;
    return `<label class="full">Squadra<select name="target-team" data-act-change="target-team">${ids.map((tid) => `<option value="${tid}" ${tid === cur ? "selected" : ""}>${esc(teamById(tid).name)}</option>`).join("")}</select></label>`;
  }
  function teamTabs() {
    const tabs = [["trasferte", "Trasferte"], ["membri", "Membri"], ["invita", "Invita"], ["risparmio", "Risparmio"]];
    const adm = adminTeamIds();
    if (adm.length) tabs.push(["mezzi", "Mezzi"], ["report", "Report"]);
    if (adm.some((tid) => premium(S.teamsById ? S.teamsById[tid] : S.team))) tabs.push(["sponsor", "Sponsor"]);
    if (adm.length) tabs.push(["impostazioni", "Squadra"]);
    return tabs;
  }
  // scelta della squadra nelle sezioni che riguardano una sola squadra
  function teamSwitch() {
    if (!S.multi) return "";
    let ids = ADMIN_TABS.includes(currentTab) ? adminTeamIds() : S.teamOrder.slice();
    if (currentTab === "sponsor") ids = ids.filter((tid) => premium(S.teamsById[tid]));
    if (ids.length < 2) return `<div class="small muted">Squadra: <b>${esc(S.team.name)}</b></div>`;
    ids.sort((a, b) => S.teamsById[a].name.localeCompare(S.teamsById[b].name));
    return `<div class="pill-group" role="radiogroup" aria-label="Squadra">${ids.map((tid) => `<a class="pill" role="radio" aria-checked="${tid === S.team.id}" href="#/t/${tid}/${currentTab}" title="${esc(S.teamsById[tid].name)}">${esc(S.teamsById[tid].category || S.teamsById[tid].name)}</a>`).join("")}</div>`;
  }

  function renderTeam() {
    const t = S.team;
    const tabs = teamTabs();
    if (!tabs.some(([k]) => k === currentTab)) currentTab = "trasferte";
    store("it-last-team", t.id);
    // sezione da amministratore aperta su una squadra dove non lo sei: passa a una tua squadra
    if (ADMIN_TABS.includes(currentTab) && !isAdmin()) { const a = adminTeamIds()[0]; if (a) { location.replace("#/t/" + a + "/" + currentTab); return; } currentTab = "trasferte"; }
    if (currentTab === "sponsor" && !premium()) { const a = adminTeamIds().find((tid) => premium(S.teamsById[tid])); if (a && a !== t.id) { location.replace("#/t/" + a + "/sponsor"); return; } }
    const head = topBar({ back: "#/squadre", backLabel: "Le mie squadre", tabs, active: currentTab, teamId: t.id });
    const fn = { trasferte: tabTrips, membri: tabMembers, invita: tabInvite, risparmio: tabSavings, mezzi: tabVehicles, report: tabReport, sponsor: tabSponsors, impostazioni: tabSettings }[currentTab];
    // trasferte e risparmio mostrano tutte le squadre; le altre sezioni solo la squadra aperta
    const body = currentTab === "trasferte" || currentTab === "risparmio" ? fn() : teamSwitch() + withTeam(t.id, fn);
    const y = window.scrollY;
    const curSp = document.querySelector(".sp-banner")?.dataset.cur;
    $app.innerHTML = head + `<div class="wrap">${waPanel()}${t.plan === "beta" && isAdmin() && currentTab === "trasferte" ? `<div class="notice small">Versione beta: tutte le funzioni Premium sono attive gratuitamente.</div>` : ""}${body}</div>` + footer();
    window.scrollTo(0, y);
    if (currentTab === "invita") drawQR();
    if (curSp != null) { const nb = document.querySelector(".sp-banner"); if (nb) nb.dataset.cur = curSp; }
    countSponsorViews();
    if (currentTab === "sponsor" && !S.teamSponsorsLoaded) loadTeamSponsors();
  }

  // ----- avviso WhatsApp dopo un'azione -----
  function waPanel() {
    const list = S.ui.wa; if (!list || !list.length) return "";
    return `<div class="card wa-card" style="border:2px solid #25D366">
      <div class="label">📲 Avvisa su WhatsApp</div>
      ${list.map((m) => `<div class="stack" style="gap:6px"><div class="small">${esc(m.text)}</div>
        <div class="row"><a class="btn btn-ok" target="_blank" rel="noopener" href="${esc(waHref(m.phone, m.text))}">Scrivi a ${esc(m.to)}</a>${waNum(m.phone) ? "" : `<span class="small muted">numero non indicato: scegli tu il contatto in WhatsApp</span>`}</div></div>`).join("")}
      <div><button class="btn-link" data-act="wa-close">Chiudi</button></div></div>`;
  }

  // ----- tab trasferte -----
  function roster() {
    const out = [];
    S.members.filter((m) => m.status === "active").forEach((m) => splitNames(m.athletes).forEach((a) => out.push({ name: a, parent: m.name, user_id: m.user_id })));
    return out;
  }
  const myAthletes = () => splitNames(S.me?.athletes);

  function tabTrips() {
    const L = sportOf(S.team);
    const cut = Date.now(); // dall'ora di inizio la trasferta passa tra quelle passate
    const up = S.events.filter((e) => new Date(e.starts_at).getTime() >= cut);
    const past = S.events.filter((e) => new Date(e.starts_at).getTime() < cut).reverse();
    const admin = isAdmin();
    return `
      ${wizardTrips()}${firstSteps()}${parentTips()}
      ${adminTeamIds().length && wizStep() !== 2 ? `<div class="row noprint">
        ${S.ui.newEvent ? "" : `<button class="btn-primary" data-act="new-event">+ Aggiungi trasferta</button>`}
        ${adminTeamIds().some((tid) => premium(teamById(tid))) ? `<button class="btn-ghost" data-act="ai-open">Importa calendario con l'AI</button>` : ""}
      </div>` : ""}
      ${sponsorBanner()}
      ${S.ui.newEvent ? eventForm(null, L) : ""}
      ${S.ui.ai ? aiPanel() : ""}
      ${up.length ? up.map((e) => withTeam(e.team_id, () => tripCard(e, false))).join("") : `<div class="empty"><strong>Nessuna trasferta in programma</strong>${admin ? "Aggiungi la prossima trasferta o importa il calendario." : "Quando l'amministratore aggiunge una trasferta, comparirà qui."}</div>`}
      ${past.length ? `<button class="btn-link" data-act="toggle-past">${S.showPast ? "Nascondi" : "Mostra"} trasferte passate (${past.length})</button>${S.showPast ? past.map((e) => withTeam(e.team_id, () => tripCard(e, true))).join("") : ""}` : ""}`;
  }

  // ----- procedura guidata per chi registra una squadra -----
  function wizardSteps(n) {
    const L = ["La squadra", "Le trasferte", "I genitori"];
    return `<ol class="wiz" aria-label="Passo ${n} di 3">${L.map((l, i) => `<li class="${i + 1 < n ? "done" : i + 1 === n ? "on" : ""}"><span>${i + 1 < n ? "✓" : i + 1}</span>${l}</li>`).join("")}</ol>`;
  }
  const wizStep = () => isAdmin() ? Number(store("it-wizard-" + S.team.id) || 0) : 0;
  function wizardTrips() {
    if (wizStep() !== 2) return "";
    const has = S.events.some((e) => e.team_id === S.team.id);
    return `${wizardSteps(2)}<div class="card wiz-card">
      <h2>${has ? "Ottimo, le trasferte ci sono" : "Aggiungi le trasferte"}</h2>
      <div class="muted">${has ? "Puoi aggiungerne altre quando vuoi. Ora invita i genitori." : "Il modo più veloce: carica il calendario ufficiale (PDF o foto) e l'AI trova le partite. Oppure aggiungile a mano."}</div>
      <div class="row">${has ? "" : `${premium() ? `<button class="btn-primary" data-act="ai-open">Carica il calendario</button>` : ""}<button class="btn-ghost" data-act="new-event">Aggiungi a mano</button>`}
        <button class="${has ? "btn-primary" : "btn-link"}" data-act="wiz-next">${has ? "Avanti: invita i genitori →" : "Lo faccio più tardi →"}</button></div>
    </div>`;
  }
  function wizardInvite() {
    if (wizStep() !== 3) return "";
    return `${wizardSteps(3)}<div class="card wiz-card"><h2>Invita i genitori</h2>
      <div class="muted">Manda il link nel gruppo WhatsApp della squadra, oppure stampa il QR per la bacheca della palestra. Chi lo apre entra direttamente.</div>
      <div><button class="btn-primary" data-act="wiz-done">Fatto, vai alle trasferte</button></div></div>`;
  }
  // scheda "Primi passi" per l'amministratore, finché le cose essenziali non sono fatte
  function firstSteps() {
    if (!isAdmin() || wizStep() || store("it-steps-hide-" + S.team.id)) return "";
    const ev = S.events.some((e) => e.team_id === S.team.id), par = S.members.filter((m) => m.status === "active").length > 1, veh = S.vehicles.some((v) => v.team_id === S.team.id);
    if (ev && par) return "";
    const it = (ok, label, act) => `<li class="${ok ? "ok" : ""}"><span aria-hidden="true">${ok ? "✓" : "○"}</span>${ok ? label : act}</li>`;
    return `<div class="card steps"><div class="between"><div class="label">Primi passi · ${esc(S.team.name)}</div><button class="btn-link" data-act="steps-hide">Nascondi</button></div>
      <ul>${it(true, "Squadra creata", "")}
        ${it(ev, "Prima trasferta aggiunta", `<button class="btn-link" data-act="new-event">Aggiungi la prima trasferta</button>`)}
        ${it(par, "Genitori invitati", `<a href="#/t/${S.team.id}/invita">Invita i genitori</a>`)}
        ${it(veh, "Mezzo della società", `<a href="#/t/${S.team.id}/mezzi">Aggiungi un mezzo della società</a> <span class="muted">(facoltativo)</span>`)}</ul></div>`;
  }
  // tre suggerimenti per il genitore al primo ingresso
  function parentTips() {
    if (isAdmin() || store("it-tips")) return "";
    return `<div class="card tips"><div class="between"><div class="label">Come funziona</div><button class="btn-link" data-act="tips-ok">Ho capito</button></div>
      <div>🚗 Hai l'auto? Sulla trasferta tocca <b>Offro un passaggio</b>.</div>
      <div>🎟️ Ti serve un posto? Tocca <b>Prenota un posto</b> sull'auto di un altro genitore.</div>
      <div>🙋 Nessun posto libero? Tocca <b>Cerco un passaggio</b>: chi ha l'auto risponde «Lo porto io».</div></div>`;
  }

  // ----- tab risparmio: una scheda per ogni squadra -----
  function tabSavings() {
    const ids = S.multi && S.teamOrder ? S.teamOrder : [S.team.id];
    return ids.map((tid) => withTeam(tid, () => savingsCard(S.multi ? S.team.name : ""))).join("");
  }

  // ----- risparmio (visibile a tutti) -----
  function computeSavings() {
    const t = S.team, cost = Number(t.cost_per_km ?? 0.15), co2k = Number(t.co2_kg_per_km) || 0.12, me = S.user.id;
    const { tot } = computeReport();
    const past = S.events.filter((e) => new Date(e.starts_at).getTime() < Date.now() && e.km_round_trip);
    let famKm = 0, famTrips = 0, given = 0;
    past.forEach((e) => {
      const mine = S.bookings.filter((b) => b.event_id === e.id && b.booked_by === me);
      const inOthers = mine.map((b) => S.rides.find((r) => r.id === b.ride_id)).filter((r) => r && r.created_by !== me);
      if (inOthers.length) { famTrips++; famKm += Number(e.km_round_trip) * (inOthers.some((r) => r.return_trip) ? 1 : 0.5); }
      S.rides.filter((r) => r.event_id === e.id && r.created_by === me).forEach((r) => { given += S.bookings.filter((b) => b.ride_id === r.id && b.booked_by !== me).length; });
    });
    return { cost, co2k, fam: { km: famKm, eur: famKm * cost, co2: famKm * co2k, trips: famTrips, given }, team: { avoided: tot.avoided, km: tot.km, eur: tot.km * cost, co2: tot.co2 } };
  }
  function savingsCard(teamName) {
    const v = computeSavings();
    const empty = !v.team.km && !v.fam.km && !v.fam.given;
    return `<div class="card savings">
      <div class="label">🌱 Il risparmio di questa stagione${teamName ? " · " + esc(teamName) : ""}</div>
      ${empty ? `<div class="small muted">Il conteggio parte dalle prime trasferte concluse con i km indicati: qui vedrai km, euro e CO₂ risparmiati dalla tua famiglia e dalla squadra.</div>` : `
      <div class="small"><b>La tua famiglia</b>${v.fam.given ? ` · hai accompagnato ${v.fam.given} ${v.fam.given === 1 ? "atleta" : "atleti"} di altre famiglie` : ""}</div>
      <div class="stats"><div><b>${fmt(v.fam.km)}</b>km non guidati</div><div><b>${fmt(v.fam.eur)} €</b>risparmiati</div><div><b>${fmt(v.fam.co2)} kg</b>CO₂ evitata</div></div>
      <div class="small"><b>La squadra</b></div>
      <div class="stats"><div><b>${fmt(v.team.avoided)}</b>auto evitate</div><div><b>${fmt(v.team.km)}</b>km evitati</div><div><b>${fmt(v.team.eur)} €</b>risparmiati</div><div><b>${fmt(v.team.co2)} kg</b>CO₂ evitata</div></div>`}
      <div class="small muted">Stima: ${fmt(v.cost, 2)} € e ${fmt(v.co2k, 3)} kg di CO₂ per km (solo carburante). Contano le trasferte concluse con i km indicati.</div>
    </div>`;
  }

  // ----- sponsor -----
  const logoUrl = (path) => path ? CFG.SUPABASE_URL + "/storage/v1/object/public/sponsor-logos/" + path.split("/").map(encodeURIComponent).join("/") : "";
  const isVideo = (sp) => sp && (sp.media_type === "video" || /\.(mp4|webm|mov)$/i.test(sp.logo_path || ""));
  const spSecs = (sp) => Math.min(60, Math.max(3, Number(sp?.seconds) || 6));
  // banner orizzontale (3:1) con immagine o video, a rotazione: solo nella pagina Trasferte
  function sponsorBanner() {
    const L = S.sponsors || []; if (!L.length) return "";
    const slide = (sp, i) => {
      const media = !sp.logo_path ? `<div class="sp-fallback"><b>${esc(sp.name)}</b>${sp.message ? `<span>${esc(sp.message)}</span>` : ""}</div>`
        : isVideo(sp) ? `<video src="${esc(logoUrl(sp.logo_path))}" muted playsinline loop preload="metadata" aria-label="${esc(sp.name)}"></video>`
        : `<img src="${esc(logoUrl(sp.logo_path))}" alt="${esc(sp.name)}${sp.message ? " – " + esc(sp.message) : ""}" ${i === 0 ? "" : `loading="lazy"`}>`;
      const inner = media + (sp.logo_path && sp.message ? `<div class="sp-cap">${esc(sp.message)}</div>` : "");
      return sp.link_url ? `<a class="sp-slide${i === 0 ? " on" : ""}" href="${esc(sp.link_url)}" target="_blank" rel="noopener sponsored" data-sp="${sp.id}" data-i="${i}">${inner}</a>`
        : `<div class="sp-slide${i === 0 ? " on" : ""}" data-sp-id="${sp.id}" data-i="${i}">${inner}</div>`;
    };
    return `<section class="sp-banner noprint" aria-label="Sponsor" aria-roledescription="carosello">
      <div class="sp-slides">${L.map(slide).join("")}</div>
      <div class="sp-tag">Sponsor</div>
      ${L.length > 1 ? `<div class="sp-dots">${L.map((sp, i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-act="sp-goto" data-v="${i}" aria-label="Sponsor ${i + 1} di ${L.length}"></button>`).join("")}</div>` : ""}
    </section>`;
  }
  let spTimer = null;
  function spShow(i) {
    const el = document.querySelector(".sp-banner"); if (!el) return;
    const slides = el.querySelectorAll(".sp-slide"), dots = el.querySelectorAll(".sp-dots button");
    if (!slides.length) return; i = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((s, k) => {
      s.classList.toggle("on", k === i);
      const v = s.querySelector("video");
      if (v) { if (k === i) { try { v.currentTime = 0; } catch (e) {} const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); }
    });
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    el.dataset.cur = i; const sp = (S.sponsors || [])[i]; if (sp) countView(sp);
    return i;
  }
  function startSponsorRotation() {
    clearTimeout(spTimer); spTimer = null;
    const el = document.querySelector(".sp-banner"); if (!el) return;
    const cur = spShow(Number(el.dataset.cur || 0));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((S.sponsors || []).length < 2 || reduce) return;
    const tick = (i) => {
      spTimer = setTimeout(() => {
        const b = document.querySelector(".sp-banner"); if (!b) return;
        if (document.hidden) { tick(i); return; }
        tick(spShow(i + 1));
      }, spSecs((S.sponsors || [])[i]) * 1000);
    };
    tick(cur);
  }
  function countView(sp) {
    if (!S.team) return; const k = "sp-v-" + sp.id + "-" + S.team.id; let seen = null; try { seen = sessionStorage.getItem(k); } catch (e) {}
    if (!seen) { try { sessionStorage.setItem(k, "1"); } catch (e) {} sb.rpc("sponsor_hit", { p_sponsor: sp.id, p_team: S.team.id, p_kind: "view" }).then(() => {}, () => {}); }
  }
  function countSponsorViews() {
    if (!S.team || !(S.sponsors || []).length) return;
    if (document.querySelector(".sp-banner")) startSponsorRotation();
    else { clearTimeout(spTimer); spTimer = null; }
  }
  document.addEventListener("click", (ev) => { const a = ev.target.closest("a[data-sp]"); if (a && S.team) sb.rpc("sponsor_hit", { p_sponsor: a.dataset.sp, p_team: S.team.id, p_kind: "click" }).then(() => {}, () => {}); });

  function sponsorForm(sp, scope) {
    const sports = sp?.sports || [];
    return `<form class="card form" data-form="sponsor" data-scope="${scope}" data-id="${sp ? sp.id : ""}">
      <h3 class="full">${sp ? "Modifica sponsor" : "Nuovo sponsor"}</h3>
      <label class="full">Nome<input name="name" required minlength="2" maxlength="80" value="${esc(sp?.name || "")}" placeholder="Es. Pizzeria Da Mario"></label>
      <label class="full">Messaggio breve (facoltativo)<input name="message" maxlength="140" value="${esc(sp?.message || "")}" placeholder="Es. Sconto 10% per le famiglie della squadra"></label>
      <label class="full">Sito o pagina (facoltativo)<input name="link" type="url" maxlength="300" value="${esc(sp?.link_url || "")}" placeholder="https://…"></label>
      <label class="full">Banner: immagine o video orizzontale<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"></label>
      <div class="full small muted">Formato consigliato 3:1, per esempio 1200×400 pixel. Immagine (PNG, JPG, WEBP, GIF) fino a 2 MB, video MP4 o WEBM fino a 8 MB, senza audio (viene riprodotto muto).</div>
      ${sp?.logo_path ? `<div class="full small muted">Banner attuale: ${isVideo(sp) ? `<video src="${esc(logoUrl(sp.logo_path))}" muted preload="metadata" class="sp-prev"></video>` : `<img src="${esc(logoUrl(sp.logo_path))}" alt="" class="sp-prev">`} (carica un file solo per sostituirlo)</div>` : ""}
      <label>Secondi di visualizzazione<input name="seconds" type="number" min="3" max="60" step="1" value="${esc(String(sp?.seconds || 6))}"></label>
      ${scope === "platform" ? `<div class="full stack" style="gap:8px"><div class="label">Sport in cui mostrarlo (nessuno selezionato = tutti)</div>
        <div class="pill-group">${SPORT_ORDER.map((k) => `<label class="pill check-pill"><input type="checkbox" name="sports" value="${k}" ${sports.includes(k) ? "checked" : ""}> ${esc(SPORTS[k].label)}</label>`).join("")}</div></div>` : ""}
      <label>Dal (facoltativo)<input name="from" type="date" value="${esc(sp?.starts_on || "")}"></label>
      <label>Al (facoltativo)<input name="to" type="date" value="${esc(sp?.ends_on || "")}"></label>
      <label class="full check"><input name="active" type="checkbox" ${!sp || sp.active ? "checked" : ""}> Attivo</label>
      <div class="actions"><button class="btn-primary" type="submit">${sp ? "Salva" : "Aggiungi sponsor"}</button><button class="btn-ghost" type="button" data-act="sp-cancel">Annulla</button></div>
    </form>`;
  }
  function sponsorList(list, stats, scope) {
    const st = (id) => (stats || []).find((x) => x.sponsor_id === id) || { views: 0, clicks: 0, views_30d: 0, clicks_30d: 0 };
    const today = new Date().toISOString().slice(0, 10);
    return list.length ? list.map((sp) => { const x = st(sp.id); const live = sp.active && (!sp.starts_on || sp.starts_on <= today) && (!sp.ends_on || sp.ends_on >= today);
      return `<div class="member">${sp.logo_path ? (isVideo(sp) ? `<video src="${esc(logoUrl(sp.logo_path))}" muted preload="metadata" class="sp-thumb"></video>` : `<img src="${esc(logoUrl(sp.logo_path))}" alt="" class="sp-thumb">`) : `<div class="avatar">${esc(initials(sp.name))}</div>`}
        <div style="flex:1;min-width:0"><b>${esc(sp.name)}</b> <span class="chip ${live ? "ok" : ""}">${live ? "visibile" : "non visibile"}</span>
          <div class="small muted">${scope === "platform" ? (sp.sports && sp.sports.length ? sp.sports.map((k) => esc((SPORTS[k] || SPORTS.altro).label)).join(", ") : "tutti gli sport") + " · " : ""}${sp.starts_on || sp.ends_on ? `dal ${esc(sp.starts_on || "—")} al ${esc(sp.ends_on || "—")} · ` : ""}${isVideo(sp) ? "video" : "immagine"} · ${spSecs(sp)} s ·${fmt(x.views)} visualizzazioni, ${fmt(x.clicks)} clic (30 gg: ${fmt(x.views_30d)} / ${fmt(x.clicks_30d)})</div>
          <div class="row">${S.ui.confirm === "sp:" + sp.id ? `<span class="confirm">Eliminare lo sponsor? <button class="btn-link danger" data-act="sp-del" data-id="${sp.id}" data-scope="${scope}">Sì</button><button class="btn-link" data-act="sp-cancel">No</button></span>` : `<button class="btn-link" data-act="sp-edit" data-id="${sp.id}" data-scope="${scope}">Modifica</button><button class="btn-link danger" data-act="sp-ask-del" data-id="${sp.id}" data-scope="${scope}">Elimina</button>`}</div></div></div>`; }).join("")
      : `<div class="muted">Nessuno sponsor inserito.</div>`;
  }
  async function loadTeamSponsors() {
    const [l, r] = await Promise.all([sb.from("sponsors").select("*").eq("scope", "team").eq("team_id", S.team.id).order("created_at"), sb.rpc("sponsor_report", { p_team: S.team.id })]);
    S.teamSponsors = l.data || []; S.teamSponsorStats = r.data || []; S.teamSponsorsLoaded = true; renderTeam();
  }
  function tabSponsors() {
    if (!S.teamSponsorsLoaded) return `<div class="boot">Carico gli sponsor…</div>`;
    const editing = S.ui.spEdit === "new" ? null : (S.teamSponsors || []).find((x) => x.id === S.ui.spEdit);
    return `<div class="notice small">Gli sponsor della società compaiono solo ai membri di questa squadra, a rotazione nel banner in cima alla pagina Trasferte. Puoi inserirne fino a 10. Finché ne hai almeno uno attivo, sostituiscono quelli di Carpoolino.</div>
      ${S.ui.spEdit ? sponsorForm(editing, "team") : `<button class="btn-primary" data-act="sp-new">+ Aggiungi sponsor</button>`}
      <div class="card"><div class="label">Sponsor della squadra · ${(S.teamSponsors || []).length}</div>${sponsorList(S.teamSponsors || [], S.teamSponsorStats, "team")}</div>`;
  }

  function eventForm(e, L) {
    const p = e ? dateParts(e.starts_at) : null;
    return `<form class="card form" data-form="event" data-id="${e ? e.id : ""}">
      <h3 class="full">${e ? "Modifica trasferta" : "Nuova trasferta"}</h3>
      ${e ? "" : teamSelect(false)}
      <label class="full">${esc(L.event)}<input name="title" required minlength="2" maxlength="120" value="${esc(e?.title || "")}" placeholder="Es. Vanoliyoung - ${esc(S.team.name)}"></label>
      <label>Data<input name="date" type="date" required value="${p ? p.ymd : ""}"></label>
      <label>${esc(L.time)}<input name="time" type="time" value="${p ? p.time : ""}"></label>
      <label class="full">${esc(L.place)} / indirizzo<input name="place" maxlength="200" value="${esc(e?.place || "")}" placeholder="Via, città"></label>
      <label>Km andata e ritorno<input name="km" type="number" min="0" max="5000" step="1" value="${e?.km_round_trip ?? ""}" placeholder="Es. 160"></label>
      <label class="full">Note<input name="notes" maxlength="300" value="${esc(e?.notes || "")}" placeholder="Es. ritrovo al palazzetto alle 18:30"></label>
      <div class="actions"><button class="btn-primary" type="submit">${e ? "Salva" : "Aggiungi trasferta"}</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function tripCard(e, isPast) {
    if (S.ui.editEvent === e.id) return eventForm(e, sportOf(S.team));
    const p = dateParts(e.starts_at);
    const rides = S.rides.filter((r) => r.event_id === e.id).sort((a, b) => (a.kind === "club" ? -1 : 0) - (b.kind === "club" ? -1 : 0));
    const bk = S.bookings.filter((b) => b.event_id === e.id);
    const tot = rides.reduce((a, r) => a + r.seats, 0);
    const free = Math.max(0, tot - bk.length);
    const booked = new Set(bk.map((b) => b.athlete_name.toLowerCase()));
    const missing = roster().filter((a) => !booked.has(a.name.toLowerCase()));
    const admin = isAdmin();
    const chips = rides.length
      ? `<span class="chip">${rides.length} ${rides.length === 1 ? "mezzo" : "mezzi"}</span><span class="chip ${free ? "ok" : "warn"}">${free ? free + (free === 1 ? " posto libero" : " posti liberi") : "Tutto pieno"}</span>`
      : `<span class="chip warn">Nessuna auto ancora</span>`;
    const reqs = S.requests.filter((q) => q.event_id === e.id);
    const confirming = S.ui.confirm === "event:" + e.id;
    return `<article class="trip ${isPast ? "past" : ""}">
      <div class="stub"><span class="cat" title="${esc(S.team.name)}">${esc(S.team.category || S.team.name)}</span><span class="dow">${p.dow}</span><span class="day">${p.day}</span><span class="mon">${p.mon}</span><span class="time">${p.time}</span></div>
      <div class="tbody">
        <div class="between" style="align-items:start">
          <div style="min-width:0"><h2>${esc(e.title)}</h2>
            ${e.place ? `<div class="meta">${esc(e.place)} · <a href="${esc(mapsSearch(e.place))}" target="_blank" rel="noopener">apri in Maps</a></div>` : ""}
            ${e.notes ? `<div class="meta">${esc(e.notes)}</div>` : ""}
            ${e.km_round_trip ? `<div class="meta">${fmt(e.km_round_trip)} km andata e ritorno</div>` : ""}
          </div>
          <div class="row">${chips}${reqs.length ? `<span class="chip warn">${reqs.length === 1 ? "1 cerca un passaggio" : reqs.length + " cercano un passaggio"}</span>` : ""}</div>
        </div>
        ${!isPast && missing.length && rides.length ? `<div class="missing"><b>Senza posto (${missing.length}):</b> ${missing.map((a) => esc(a.name)).join(", ")}</div>` : ""}
        ${rides.map((r) => rideBlock(r, e, isPast)).join("")}
        ${!isPast && reqs.length ? reqBox(e, reqs) : ""}
        ${!isPast ? `<div class="row noprint">
          ${S.ui.offer === e.id ? "" : `<button class="btn-ghost" data-act="offer" data-id="${e.id}">🚗 Offro un passaggio</button>`}
          ${S.ui.req === e.id ? "" : `<button class="btn-ghost" data-act="req" data-id="${e.id}">🙋 Cerco un passaggio</button>`}
          ${admin && S.ui.club !== e.id ? `<button class="btn-ghost" data-act="club" data-id="${e.id}">+ Mezzo della società</button>` : ""}
        </div>` : ""}
        ${S.ui.offer === e.id ? offerForm(e) : ""}
        ${S.ui.req === e.id ? reqForm(e) : ""}
        ${S.ui.club === e.id ? clubForm(e) : ""}
        ${canEditEvent(e) ? `<div class="row noprint">${confirming
          ? `<span class="confirm">Eliminare la trasferta con tutti i passaggi? <button class="btn-link danger" data-act="del-event" data-id="${e.id}">Sì, elimina</button><button class="btn-link" data-act="cancel">Annulla</button></span>`
          : `<button class="btn-link" data-act="edit-event" data-id="${e.id}">Modifica</button><button class="btn-link" data-act="ask-del-event" data-id="${e.id}">Elimina</button>`}</div>` : ""}
      </div></article>`;
  }

  function rideBlock(r, e, isPast) {
    const rs = S.bookings.filter((b) => b.ride_id === r.id);
    const free = Math.max(0, r.seats - rs.length);
    const mine = r.created_by === S.user.id;
    const admin = isAdmin();
    const veh = r.vehicle_id ? S.vehicles.find((v) => v.id === r.vehicle_id) : null;
    const who = r.kind === "club" ? `${veh ? esc(veh.name) : "Mezzo"}${r.driver_name ? " · autista " + esc(r.driver_name) : ""}` : esc(r.driver_name);
    const dots = Array.from({ length: Math.min(r.seats, 20) }, (_, i) => `<span class="seat ${i < rs.length ? "taken" : ""}"></span>`).join("");
    const canBook = !isPast && free > 0 && (r.assignment === "booking" || admin);
    const confirming = S.ui.confirm === "ride:" + r.id;
    return `<div class="ride ${r.kind === "club" ? "club" : ""}">
      <div class="between" style="align-items:baseline">
        <div style="min-width:0"><span class="driver">${who}</span>
          <div class="meta">Parte da ${esc(r.depart_from || "—")}${r.depart_time ? ` alle <b>${esc(r.depart_time)}</b>` : ""} · ${r.return_trip ? "fa anche il ritorno" : "solo andata"}${r.assignment === "convocation" ? " · posti assegnati dalla società" : ""}</div>
          ${r.km_to_venue ? `<div class="meta">≈ ${fmt(r.km_to_venue)} km fino a destinazione (percorso più veloce)${r.depart_from && e.place ? ` · <a href="${esc(mapsRoute(r.depart_from, e.place))}" target="_blank" rel="noopener">percorso in Maps</a>` : ""}</div>` : r.depart_from && e.place ? `<div class="meta"><a href="${esc(mapsRoute(r.depart_from, e.place))}" target="_blank" rel="noopener">percorso in Maps</a></div>` : ""}
          ${r.notes ? `<div class="meta">${esc(r.notes)}</div>` : ""}
          ${r.kind === "parent" ? `<div class="meta courtesy">Passaggio di cortesia tra famiglie: chi guida è responsabile del viaggio.</div>` : ""}
          ${!mine && driverPhone(r) ? `<div class="meta"><a href="tel:${esc(waNum(driverPhone(r)) ? "+" + waNum(driverPhone(r)) : driverPhone(r))}">📞 ${esc(driverPhone(r))}</a></div>` : ""}
        </div>
        <div class="seats" aria-label="${free} posti liberi su ${r.seats}">${dots}<span class="chip ${free ? "ok" : "warn"}">${free ? free + " liberi" : "Pieno"}</span></div>
      </div>
      ${rs.length ? `<ul class="pax">${rs.map((b) => `<li><span>${esc(b.athlete_name)}${b.pickup ? ` <small>· sale a ${esc(b.pickup)}</small>` : ""}</span>${!isPast && (b.booked_by === S.user.id || mine || admin) ? `<button class="btn-link danger" data-act="unbook" data-id="${b.id}">Libera</button>` : ""}</li>`).join("")}</ul>` : ""}
      ${S.ui.book === r.id ? bookForm(r) : ""}
      ${!isPast ? `<div class="row noprint">
        ${canBook && S.ui.book !== r.id ? `<button class="btn-primary" data-act="book" data-id="${r.id}">${r.assignment === "convocation" ? "Assegna un posto" : "Prenota un posto"}</button>` : ""}
        ${mine || admin ? (confirming
          ? `<span class="confirm">Ritirare questo mezzo? Le prenotazioni verranno cancellate. <button class="btn-link danger" data-act="del-ride" data-id="${r.id}">Sì</button><button class="btn-link" data-act="cancel">No</button></span>`
          : `<button class="btn-link" data-act="ask-del-ride" data-id="${r.id}">${r.kind === "club" ? "Togli mezzo" : "Ritira la mia auto"}</button>`) : ""}
      </div>` : ""}
    </div>`;
  }

  const driverPhone = (r) => r.driver_phone || (r.kind === "parent" ? member(r.created_by).phone : "") || "";

  function reqBox(e, reqs) {
    return `<div class="ride" style="border-style:dashed">
      <div class="label">Cercano un passaggio</div>
      <ul class="pax">${reqs.map((q) => {
        const mineQ = q.requested_by === S.user.id;
        return `<li><span><b>${esc(q.athlete_name)}</b> <small>· ${esc(DIR[q.direction] || "")}${q.depart_from ? " · da " + esc(q.depart_from) : ""} · chiesto da ${esc(firstName(member(q.requested_by).name))}</small></span>
          <span class="row">${!mineQ ? `<button class="btn-ok" data-act="take" data-id="${q.id}">Lo porto io</button>` : ""}${mineQ || isAdmin() ? `<button class="btn-link danger" data-act="del-req" data-id="${q.id}">Ritira richiesta</button>` : ""}</span></li>`;
      }).join("")}</ul></div>`;
  }

  function reqForm(e) {
    const booked = new Set(S.bookings.filter((b) => b.event_id === e.id).map((b) => b.athlete_name.toLowerCase()));
    const asked = new Set(S.requests.filter((q) => q.event_id === e.id).map((q) => q.athlete_name.toLowerCase()));
    const names = myAthletes().filter((n) => !booked.has(n.toLowerCase()) && !asked.has(n.toLowerCase()));
    return `<form class="form" data-form="req" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <label>Atleta<input name="athlete" required maxlength="60" list="dlq-${e.id}" value="${esc(names.length === 1 ? names[0] : "")}" placeholder="Nome dell'atleta"><datalist id="dlq-${e.id}">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label>
      <label>Serve per<select name="direction"><option value="ar">andata e ritorno</option><option value="andata">solo andata</option><option value="ritorno">solo ritorno</option></select></label>
      <label class="full">Da dove parte<input name="from" maxlength="120" placeholder="Es. Buccinasco"></label>
      <div class="actions"><button class="btn-primary" type="submit">Pubblica la richiesta</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function offerForm(e) {
    return `<form class="form" data-form="offer" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <label>Posti liberi<select name="seats">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Orario partenza<input name="time" type="time"></label>
      <label class="full">Punto di partenza<input name="from" required maxlength="120" placeholder="Es. parcheggio del palazzetto"></label>
      <label class="full">Note<input name="notes" maxlength="200" placeholder="Es. posso fare una tappa lungo la strada"></label>
      <label class="full">Telefono (per WhatsApp, visibile ai genitori della squadra)<input name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="333 1234567" value="${esc(S.profile.phone || "")}"></label>
      <label class="full check"><input name="back" type="checkbox" checked> Faccio anche il ritorno</label>
      ${driverOk() ? "" : `<label class="full check declare"><input name="driver" type="checkbox" required> <span>Dichiaro di avere patente valida, auto con assicurazione RC in corso e revisione regolare, e di trasportare i ragazzi rispettando il codice della strada, con cinture o seggiolini e senza superare i posti omologati. Il passaggio è gratuito e sotto la mia responsabilità. <small class="muted">Te lo chiediamo una volta a stagione · <a href="#/termini" target="_blank">Termini</a></small></span></label>`}
      <div class="actions"><button class="btn-primary" type="submit">Pubblica il passaggio</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function clubForm(e) {
    const vs = S.vehicles.filter((v) => v.active);
    if (!vs.length) return `<div class="notice small">Prima registra i mezzi della società nella sezione <a href="#/t/${S.team.id}/mezzi">Mezzi</a>.</div>`;
    return `<form class="form" data-form="club" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <label class="full">Mezzo<select name="vehicle">${vs.map((v) => `<option value="${v.id}" data-seats="${v.seats}">${esc(v.name)} · ${v.seats} posti</option>`).join("")}</select></label>
      <label>Posti disponibili<input name="seats" type="number" min="1" max="60" value="${vs[0].seats}"></label>
      <label>Orario partenza<input name="time" type="time"></label>
      <label class="full">Autista<input name="driver" maxlength="80" placeholder="Es. coach Rossi"></label>
      <label class="full">Punto di partenza<input name="from" maxlength="120" placeholder="Es. palestra della società"></label>
      <label class="full">Assegnazione posti<select name="assignment"><option value="booking">I genitori prenotano</option><option value="convocation">La società convoca (assegna l'amministratore)</option></select></label>
      <label class="full check"><input name="back" type="checkbox" checked> Fa anche il ritorno</label>
      <div class="actions"><button class="btn-primary" type="submit">Aggiungi mezzo</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function bookForm(r) {
    const conv = r.assignment === "convocation";
    const booked = new Set(S.bookings.filter((b) => b.event_id === r.event_id).map((b) => b.athlete_name.toLowerCase()));
    const names = (conv || isAdmin() ? roster().map((a) => a.name) : myAthletes()).filter((n) => !booked.has(n.toLowerCase()));
    return `<form class="form" data-form="book" data-id="${r.id}">
      <label>Atleta<input name="athlete" required maxlength="60" list="dl-${r.id}" value="${esc(names.length === 1 && !conv ? names[0] : "")}" placeholder="Nome dell'atleta"><datalist id="dl-${r.id}">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label>
      <label>Dove sale<input name="pickup" maxlength="80" placeholder="Al punto di partenza"></label>
      <div class="actions"><button class="btn-primary" type="submit">${conv ? "Assegna posto" : "Conferma posto"}</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  // ----- import calendario con AI -----
  function aiPanel() {
    if (!CFG.AI_IMPORT_ENABLED) return `<div class="card"><h3>Importa calendario con l'AI</h3><p class="muted" style="margin:0">Funzione non ancora attivata su questa installazione.</p><div><button class="btn-ghost" data-act="ai-close">Chiudi</button></div></div>`;
    const prev = S.aiPreview;
    return `<div class="card">
      <h3>Importa calendario con l'AI</h3>
      ${!prev ? `<form class="form" data-form="ai">
        ${teamSelect(true)}
        <p class="full small muted" style="margin:0">Carica il calendario ufficiale (PDF o foto/screenshot) oppure incolla il testo. L'AI trova le partite: tu controlli e confermi prima di salvare.</p>
        <label class="full">File (PDF, JPG, PNG · max 5 MB)<input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"></label>
        <label class="full">…oppure incolla il testo<textarea name="text" maxlength="20000" placeholder="15/10/2026 20:30 Vanoliyoung - ${esc(S.team.name)}"></textarea></label>
        <div class="actions"><button class="btn-primary" type="submit">Leggi il calendario</button><button class="btn-ghost" type="button" data-act="ai-close">Chiudi</button></div>
      </form>` : `<form class="stack" data-form="ai-confirm">
        <div class="small muted">Trovati ${prev.length} eventi. Sono selezionate le trasferte (partite fuori casa). Controlla date e orari prima di confermare.</div>
        ${prev.map((ev, i) => `<label class="card" style="padding:12px;grid-template-columns:28px 1fr;align-items:start;gap:10px;display:grid">
          <input type="checkbox" name="pick" value="${i}" ${ev.is_away !== false ? "checked" : ""} style="width:22px;height:22px;min-height:0">
          <span class="stack" style="gap:6px"><b>${esc(ev.title)}</b><span class="small muted">${esc(ev.date)} ${esc(ev.time || "")} ${ev.place ? "· " + esc(ev.place) : ""} ${ev.is_away === false ? "· in casa" : ""}</span>
            <span class="row small">Km A/R <input name="km-${i}" type="number" min="0" max="5000" value="${ev.km_round_trip ?? ""}" style="width:110px;min-height:36px;padding:6px 8px"></span></span>
        </label>`).join("")}
        <div class="row"><button class="btn-primary" type="submit">Aggiungi le trasferte selezionate</button><button class="btn-ghost" type="button" data-act="ai-reset">Ricomincia</button></div>
      </form>`}
    </div>`;
  }

  function fileToBase64(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
  }

  // ----- tab membri -----
  function tabMembers() {
    const admin = isAdmin();
    const pend = S.members.filter((m) => m.status === "pending");
    const act = S.members.filter((m) => m.status === "active").sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name));
    return `
      ${admin && pend.length ? `<div class="card" style="background:var(--accent-soft)"><div class="label">Da approvare · ${pend.length}</div>
        ${pend.map((m) => `<div class="member"><div class="avatar">${esc(initials(m.name))}</div><div class="grow" style="flex:1;min-width:0"><b>${esc(m.name)}</b><div class="small muted">atleti: ${esc(m.athletes || "—")}</div></div>
          <button class="btn-ok" data-act="approve" data-id="${m.user_id}">Accetta</button><button class="btn-link danger" data-act="reject" data-id="${m.user_id}">Rifiuta</button></div>`).join("")}</div>` : ""}
      <form class="card form" data-form="my-athletes">
        <label class="full">I miei atleti in questa squadra<input name="athletes" maxlength="200" value="${esc(S.me.athletes)}" placeholder="Più nomi separati da virgola"></label>
        <div class="actions"><button class="btn-primary" type="submit">Salva</button></div>
      </form>
      <div class="card"><div class="label">Membri · ${act.length}</div>
        ${act.map((m) => {
          const me = m.user_id === S.user.id;
          const c = S.ui.confirm === "member:" + m.user_id;
          return `<div class="member"><div class="avatar">${esc(initials(m.name))}</div>
            <div style="flex:1;min-width:0"><b>${esc(m.name)}${me ? " (tu)" : ""}</b><div class="small muted">atleti: ${esc(m.athletes || "—")}</div>
              ${admin && !me ? `<div class="row">${c ? `<span class="confirm">Togliere dalla squadra? <button class="btn-link danger" data-act="remove-member" data-id="${m.user_id}">Sì</button><button class="btn-link" data-act="cancel">No</button></span>`
                : `<button class="btn-link" data-act="toggle-admin" data-id="${m.user_id}">${m.role === "admin" ? "Togli amministratore" : "Rendi amministratore"}</button><button class="btn-link danger" data-act="ask-remove-member" data-id="${m.user_id}">Togli</button>`}</div>` : ""}
            </div>
            <span class="chip ${m.role === "admin" ? "navy" : ""}">${m.role === "admin" ? "Admin" : "Genitore"}</span></div>`;
        }).join("")}
      </div>
      <div>${S.ui.confirm === "leave" ? `<span class="confirm">Vuoi davvero lasciare la squadra? <button class="btn-link danger" data-act="leave">Sì, esci</button><button class="btn-link" data-act="cancel">No</button></span>` : `<button class="btn-link danger" data-act="ask-leave">Lascia la squadra</button>`}</div>`;
  }

  // ----- tab invita -----
  // squadre incluse nell'invito: di default quella aperta; l'amministratore di più squadre può aggiungerne
  const inviteTeams = () => { const sel = (S.ui.invSel || []).filter((tid) => adminTeamIds().includes(tid) && teamById(tid)); return sel.length ? sel.map(teamById) : [S.team]; };
  const inviteUrl = () => location.origin + location.pathname + "#/join/" + inviteTeams().map((t) => t.invite_code).join(",");
  const inviteText = () => { const ts = inviteTeams(); const names = ts.length === 1 ? ts[0].name : ts.slice(0, -1).map((t) => t.name).join(", ") + " e " + ts[ts.length - 1].name; return `Ciao! Per organizzare i passaggi alle trasferte di ${names} usiamo Carpoolino: entra da qui${ts.length > 1 ? ", scegli le squadre" : ""} e scrivi il nome del tuo atleta. ${inviteUrl()}`; };
  function tabInvite() {
    const admin = isAdmin();
    const adm = adminTeamIds();
    const multiInv = admin && adm.length > 1;
    const selIds = inviteTeams().map((t) => t.id);
    return `${wizardInvite()}${multiInv ? `<div class="card"><div class="label">Squadre incluse nell'invito</div>
        <div class="pill-group">${adm.map((tid) => `<label class="pill check-pill"><input type="checkbox" data-act="inv-toggle" data-id="${tid}" ${selIds.includes(tid) ? "checked" : ""}> ${esc(teamById(tid).name)}</label>`).join("")}</div>
        <div class="small muted">Con più squadre il genitore riceve un solo link e sceglie lui in quali entrare: utile per i fratelli.</div></div>` : ""}
      <div class="card">
        <div class="qr" id="qr" role="img" aria-label="QR code dell'invito"></div>
        <div class="small muted" style="text-align:center">${selIds.length > 1 ? `Inquadra per entrare in ${selIds.length} squadre` : `Inquadra per entrare nella squadra · codice <b>${esc(inviteTeams()[0].invite_code)}</b>`}</div>
        <div class="code">${esc(inviteUrl())}</div>
        <div class="row"><button class="btn-ghost" data-act="copy-link">Copia link</button>
          <a class="btn btn-ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(inviteText())}">Invia su WhatsApp</a>
          <button class="btn-ghost" data-act="print">Stampa QR</button></div>
      </div>
      <div class="card"><div class="label">Messaggio pronto</div><div>${esc(inviteText())}</div><div><button class="btn-ghost" data-act="copy-text">Copia messaggio</button></div></div>
      ${admin ? `<div class="card">
        <label class="between" style="font-weight:600">Nuovi genitori da approvare <input type="checkbox" data-act="toggle-approval" ${S.team.require_approval ? "checked" : ""} style="width:24px;height:24px;min-height:0"></label>
        <div class="small muted">Se attivo, chi entra con il link resta in attesa finché un amministratore non lo accetta.</div>
        ${S.ui.confirm === "regen" ? `<span class="confirm">Il vecchio link smetterà di funzionare. <button class="btn-link danger" data-act="regen">Rigenera</button><button class="btn-link" data-act="cancel">Annulla</button></span>` : `<div><button class="btn-link danger" data-act="ask-regen">Rigenera invito</button></div>`}
      </div>` : ""}`;
  }
  function drawQR() {
    const el = document.getElementById("qr"); if (!el || !window.qrcode) return;
    const q = window.qrcode(0, "M"); q.addData(inviteUrl()); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  // ----- tab mezzi -----
  function tabVehicles() {
    const lim = !premium() && S.vehicles.length >= 1;
    return `<div class="notice small">Facoltativo: registra qui pulmini e auto dello staff, se la società ne ha. Potrai assegnarli alle trasferte; i posti si sommano a quelli dei genitori.</div>
      <div class="card"><div class="label">Mezzi della società · ${S.vehicles.length}</div>
        ${S.vehicles.length ? S.vehicles.map((v) => `<div class="member"><div style="flex:1"><b>${esc(v.name)}</b><div class="small muted">${v.seats} posti${v.active ? "" : " · non disponibile"}</div></div>
          <button class="btn-link" data-act="veh-toggle" data-id="${v.id}">${v.active ? "Segna non disponibile" : "Segna disponibile"}</button>
          ${S.ui.confirm === "veh:" + v.id ? `<button class="btn-link danger" data-act="veh-del" data-id="${v.id}">Conferma</button>` : `<button class="btn-link danger" data-act="ask-veh-del" data-id="${v.id}">Elimina</button>`}</div>`).join("") : `<div class="muted">Nessun mezzo registrato.</div>`}
      </div>
      ${lim ? `<div class="notice">Nel piano gratuito puoi registrare un mezzo. Con Premium: mezzi illimitati.</div>` : `<form class="card form" data-form="vehicle">
        <label class="full">Nome<input name="name" required minlength="2" maxlength="60" placeholder="Es. Pulmino 9 posti"></label>
        <label>Posti per gli atleti<input name="seats" type="number" min="1" max="60" required value="8"></label>
        <label class="full check declare"><input name="club-ok" type="checkbox" required> <span>Il mezzo è assicurato e revisionato, sarà guidato da autisti abilitati e la responsabilità dei viaggi resta della società.</span></label>
        <div class="actions"><button class="btn-primary" type="submit">Aggiungi mezzo</button></div>
      </form>`}`;
  }

  // ----- tab report CO2 -----
  function computeReport() {
    const t = S.team, perCar = Number(t.baseline_per_car) || 1.5, co2 = Number(t.co2_kg_per_km) || 0.12;
    const past = S.events.filter((e) => new Date(e.starts_at).getTime() < Date.now());
    const rows = past.map((e) => {
      const bk = S.bookings.filter((b) => b.event_id === e.id);
      const usedRides = S.rides.filter((r) => r.event_id === e.id && bk.some((b) => b.ride_id === r.id));
      const athletes = bk.length;
      const baseline = athletes ? Math.ceil(athletes / perCar) : 0;
      const used = usedRides.length;
      const avoided = Math.max(0, baseline - used);
      const km = e.km_round_trip ? Number(e.km_round_trip) : null;
      return { e, athletes, used, club: usedRides.filter((r) => r.kind === "club").length, baseline, avoided, km, kmAvoided: km != null ? avoided * km : null, co2: km != null ? avoided * km * co2 : null };
    });
    const tot = rows.reduce((a, r) => ({ athletes: a.athletes + r.athletes, used: a.used + r.used, avoided: a.avoided + r.avoided, km: a.km + (r.kmAvoided || 0), co2: a.co2 + (r.co2 || 0), noKm: a.noKm + (r.km == null && r.athletes ? 1 : 0) }), { athletes: 0, used: 0, avoided: 0, km: 0, co2: 0, noKm: 0 });
    return { rows, tot, perCar, co2 };
  }
  function tabReport() {
    const { rows, tot, perCar, co2 } = computeReport();
    const full = premium();
    return `<div class="card">
        <div class="between"><div><div class="label">Report di stagione · ${esc(S.team.season)}</div><h2>${esc(S.team.name)}</h2></div>
          <div class="row noprint"><button class="btn-ghost" data-act="print">Stampa / PDF</button>${full ? `<button class="btn-ghost" data-act="csv">Esporta CSV</button>` : ""}</div></div>
        <div class="bigstats">
          <div><b>${fmt(rows.length)}</b>trasferte svolte</div>
          <div><b>${fmt(tot.athletes)}</b>viaggi atleti organizzati</div>
          <div><b>${fmt(tot.avoided)}</b>auto evitate</div>
          <div><b>${fmt(tot.km)}</b>km evitati</div>
          <div><b>${fmt(tot.co2 / 1000, 2)} t</b>CO2 evitata</div>
          <div><b>${fmt(tot.km * Number(S.team.cost_per_km ?? 0.15))} €</b>risparmiati dalle famiglie</div>
        </div>
        ${tot.noKm ? `<div class="notice small">${tot.noKm} trasferte senza km indicati: non entrano nel calcolo di km e CO2. Aggiungili modificando la trasferta.</div>` : ""}
      </div>
      ${full ? `<div class="card"><div class="label">Dettaglio per trasferta</div><div class="tablewrap"><table>
        <thead><tr><th>Data</th><th>Trasferta</th><th class="num">Atleti</th><th class="num">Mezzi usati</th><th class="num">Auto evitate</th><th class="num">Km A/R</th><th class="num">CO2 kg</th></tr></thead>
        <tbody>${rows.map((r) => { const p = dateParts(r.e.starts_at); return `<tr><td>${p.day} ${p.mon}</td><td>${esc(r.e.title)}</td><td class="num">${r.athletes}</td><td class="num">${r.used}${r.club ? ` <span class="muted">(${r.club} soc.)</span>` : ""}</td><td class="num">${r.avoided}</td><td class="num">${r.km != null ? fmt(r.km) : "—"}</td><td class="num">${r.co2 != null ? fmt(r.co2) : "—"}</td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">Nessuna trasferta conclusa.</td></tr>`}</tbody>
      </table></div></div>` : `<div class="notice">Dettaglio per trasferta ed esportazione disponibili con Premium.</div>`}
      <div class="card small"><div class="label">Metodologia</div>
        <div>Il report è un consuntivo calcolato sui viaggi registrati nell'app: per ogni trasferta conclusa si contano gli atleti con un posto prenotato e i mezzi effettivamente usati (auto dei genitori e mezzi della società con almeno un atleta a bordo).</div>
        <div>Auto che sarebbero servite senza coordinamento = atleti ÷ ${fmt(perCar, 1)} (arrotondato per eccesso). Auto evitate = auto senza coordinamento − mezzi usati. Km evitati = auto evitate × km andata e ritorno della trasferta. CO2 = km evitati × ${fmt(co2, 3)} kg/km. Euro risparmiati = km evitati × ${fmt(Number(S.team.cost_per_km ?? 0.15), 2)} €/km (solo carburante).</div>
        <div class="muted">Parametri modificabili nella sezione Squadra. Ogni mezzo della società è conteggiato come un veicolo.</div>
      </div>`;
  }
  function exportCSV() {
    const { rows } = computeReport();
    const head = ["data", "trasferta", "atleti", "mezzi_usati", "di_cui_societa", "auto_evitate", "km_andata_ritorno", "km_evitati", "co2_kg"];
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(";")].concat(rows.map((r) => [dateParts(r.e.starts_at).ymd, q(r.e.title), r.athletes, r.used, r.club, r.avoided, r.km ?? "", r.kmAvoided ?? "", r.co2 != null ? r.co2.toFixed(1).replace(".", ",") : ""].join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `report-co2-${S.team.name.replace(/\W+/g, "-")}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ----- tab impostazioni squadra -----
  function tabSettings() {
    const t = S.team, sp = S.ui.editSport || t.sport;
    return `<form class="card form" data-form="team-settings">
        <div class="full stack" style="gap:8px"><div class="label">Sport</div>
          <div class="pill-group" role="radiogroup" aria-label="Sport">${SPORT_ORDER.map((k) => `<button type="button" class="pill" role="radio" aria-checked="${k === sp}" data-act="edit-sport" data-v="${k}">${esc(SPORTS[k].label)}</button>`).join("")}</div></div>
        <label class="full">Nome squadra<input name="name" required minlength="2" maxlength="80" value="${esc(t.name)}"></label>
        <label>Categoria<input name="category" maxlength="40" value="${esc(t.category)}"></label>
        <label>Stagione<input name="season" maxlength="20" value="${esc(t.season)}"></label>
        <label>Atleti per auto senza coordinamento<input name="perCar" type="number" min="1" max="4" step="0.1" value="${t.baseline_per_car}"></label>
        <label>CO2 per km (kg)<input name="co2" type="number" min="0" max="1" step="0.001" value="${t.co2_kg_per_km}"></label>
        <label>Costo per km (€)<input name="cost" type="number" min="0" max="2" step="0.01" value="${t.cost_per_km ?? 0.15}"></label>
        <div class="actions"><button class="btn-primary" type="submit">Salva</button></div>
      </form>
      <div class="card"><div class="label">Piano</div><div>${t.plan === "beta" ? "Beta: tutte le funzioni Premium attive" : t.plan === "premium" ? "Premium" : "Gratuito"}</div></div>
      <div class="card"><div class="label">Zona pericolosa</div>
        ${S.ui.confirm === "del-team" ? `<span class="confirm">Eliminare squadra, trasferte e prenotazioni? Non si può annullare. <button class="btn-link danger" data-act="del-team">Elimina definitivamente</button><button class="btn-link" data-act="cancel">Annulla</button></span>` : `<div><button class="btn-danger" data-act="ask-del-team">Elimina la squadra</button></div>`}
      </div>`;
  }

  // ---------- azioni ----------
  async function reloadTeam() { await loadTeam(S.team.id); renderTeam(); }
  const closeForms = () => { S.ui.offer = S.ui.book = S.ui.club = S.ui.editEvent = S.ui.newEvent = S.ui.confirm = S.ui.req = null; };

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    const simple = {
      "login-restart": () => { S.ui.loginEmail = null; viewLogin(); },
      "wiz-next": () => { store("it-wizard-" + S.team.id, "3"); location.hash = "#/t/" + S.team.id + "/invita"; },
      "wiz-done": () => { store("it-wizard-" + S.team.id, null); location.hash = "#/t/" + S.team.id + "/trasferte"; toast("Tutto pronto!"); },
      "steps-hide": () => { store("it-steps-hide-" + S.team.id, "1"); renderTeam(); },
      "tips-ok": () => { store("it-tips", "1"); renderTeam(); },
      "legal-open": () => { S.ui.legalOpen = b.dataset.v; viewConsents(); document.querySelector(".modal")?.scrollTo(0, 0); },
      "legal-close": () => { S.ui.legalOpen = null; viewConsents(); },
      "data-export": () => exportMyData(),
      "del-ask": () => { S.ui.confirmDelete = true; viewProfile(); },
      "del-cancel": () => { S.ui.confirmDelete = false; viewProfile(); },
      "landing-create": () => { store("it-next", "#/new"); S.ui.landing = "email"; viewLogin(); },
      "landing-join": () => { store("it-next", null); S.ui.landing = "code"; viewLogin(); },
      "landing-login": () => { store("it-next", null); S.ui.landing = "email"; viewLogin(); },
      "landing-back": () => { store("it-next", null); S.ui.landing = "welcome"; S.ui.inviteName = null; viewLogin(); },
      "code-open": () => { S.ui.codeOpen = true; viewHome(); },
      "code-close": () => { S.ui.codeOpen = false; viewHome(); },
      "pick-sport": () => { const f = b.closest("form"); const keep = f ? Object.fromEntries(new FormData(f)) : {}; S.ui.newSport = b.dataset.v; viewNewTeam(); const nf = document.querySelector('[data-form="new-team"]'); for (const k in keep) if (nf.elements[k]) nf.elements[k].value = keep[k]; },
      "edit-sport": () => { S.ui.editSport = b.dataset.v; document.querySelectorAll('[data-act="edit-sport"]').forEach((x) => x.setAttribute("aria-checked", String(x === b))); },
      "cancel": () => { closeForms(); renderTeam(); },
      "new-event": () => { closeForms(); S.ui.newEvent = true; renderTeam(); },
      "edit-event": () => { closeForms(); S.ui.editEvent = id; renderTeam(); },
      "offer": () => { closeForms(); S.ui.offer = id; renderTeam(); },
      "club": () => { closeForms(); S.ui.club = id; renderTeam(); },
      "book": () => { closeForms(); S.ui.book = id; renderTeam(); },
      "req": () => { closeForms(); S.ui.req = id; renderTeam(); },
      "wa-close": () => { S.ui.wa = null; renderTeam(); },
      "toggle-past": () => { S.showPast = !S.showPast; renderTeam(); },
      "ai-open": () => { S.ui.ai = true; S.aiPreview = null; renderTeam(); },
      "ai-close": () => { S.ui.ai = false; S.aiPreview = null; renderTeam(); },
      "ai-reset": () => { S.aiPreview = null; renderTeam(); },
      "print": () => window.print(),
      "csv": () => withTeam(S.team.id, exportCSV),
      "copy-link": () => copy(inviteUrl()),
      "inv-toggle": () => { const cur = inviteTeams().map((t) => t.id); const id = b.dataset.id; const nxt = b.checked ? [...new Set(cur.concat(id))] : cur.filter((x) => x !== id); S.ui.invSel = nxt.length ? nxt : [S.team.id]; renderTeam(); },
      "copy-text": () => copy(inviteText()),
      "admin-filter": () => { S.ui.adminFilter = b.dataset.v; renderAdmin(); },
      "admin-csv": () => adminCSV(),
      "admin-refresh": () => viewAdmin(),
      "sp-goto": () => { spShow(Number(b.dataset.v)); startSponsorRotation(); },
      "sp-new": () => { S.ui.spEdit = "new"; S.ui.confirm = null; rerenderSp(); },
      "sp-edit": () => { S.ui.spEdit = id; S.ui.confirm = null; rerenderSp(); },
      "sp-cancel": () => { S.ui.spEdit = null; S.ui.confirm = null; rerenderSp(); },
      "sp-ask-del": () => { S.ui.confirm = "sp:" + id; rerenderSp(); }
    };
    if (simple[act]) return simple[act]();
    if (act.startsWith("ask-")) { const map = { "ask-del-event": "event:" + id, "ask-del-ride": "ride:" + id, "ask-remove-member": "member:" + id, "ask-leave": "leave", "ask-regen": "regen", "ask-veh-del": "veh:" + id, "ask-del-team": "del-team" }; S.ui.confirm = map[act]; return renderTeam(); }

    b.disabled = true;
    try {
      if (act === "logout-ask") { S.ui.confirmLogout = true; viewProfile(); return; }
      if (act === "logout-cancel") { S.ui.confirmLogout = false; viewProfile(); return; }
      if (act === "consent-toggle") { await saveConsent(b.dataset.k, b.checked); toast(b.checked ? "Consenso attivato" : "Consenso revocato"); return; }
      if (act === "del-account") {
        const { error } = await sb.rpc("delete_my_account"); if (error) throw error;
        S.ui = {}; try { localStorage.clear(); } catch (e) {}
        await sb.auth.signOut(); S.profile = null; location.hash = "#/"; toast("Account eliminato. Grazie per aver usato Carpoolino."); return;
      }
      if (act === "logout") { S.ui.confirmLogout = false; await sb.auth.signOut(); S.profile = null; location.hash = "#/"; return; }
      S.ui.wa = null;
      if (act === "unbook") {
        const bk = S.bookings.find((x) => x.id === id), r = bk && S.rides.find((x) => x.id === bk.ride_id), e = r && S.events.find((x) => x.id === r.event_id);
        const { error } = await sb.from("bookings").delete().eq("id", id); if (error) throw error; toast("Posto liberato");
        if (bk && r && e && r.kind === "parent") {
          const L = tripLabel(e);
          if (r.created_by !== S.user.id) S.ui.wa = [{ to: firstName(r.driver_name), phone: driverPhone(r), text: `Ciao ${firstName(r.driver_name)}, ho liberato il posto di ${bk.athlete_name} nella tua auto per ${L.trip} (${L.d}).` }];
          else if (bk.booked_by !== S.user.id) { const m = member(bk.booked_by); S.ui.wa = [{ to: firstName(m.name), phone: m.phone, text: `Ciao ${firstName(m.name)}, purtroppo ho dovuto liberare il posto di ${bk.athlete_name} nella mia auto per ${L.trip} (${L.d}).` }]; }
        }
      }
      if (act === "del-ride") {
        const r = S.rides.find((x) => x.id === id), e = r && S.events.find((x) => x.id === r.event_id);
        const pax = S.bookings.filter((x) => x.ride_id === id && x.booked_by !== S.user.id);
        const { error } = await sb.from("rides").delete().eq("id", id); if (error) throw error; toast("Mezzo ritirato");
        if (e && pax.length) { const L = tripLabel(e); S.ui.wa = pax.map((bk) => { const m = member(bk.booked_by); return { to: firstName(m.name), phone: m.phone, text: `Ciao ${firstName(m.name)}, purtroppo non posso più accompagnare ${bk.athlete_name} a ${L.trip} (${L.d}): il posto è di nuovo libero su Carpoolino.` }; }); }
      }
      if (act === "take") {
        const q = S.requests.find((x) => x.id === id), e = q && S.events.find((x) => x.id === q.event_id);
        const { data, error } = await sb.rpc("take_request", { p_request: id }); if (error) throw error; toast("Atleta aggiunto alla tua auto");
        const r = data && S.rides.find((x) => x.id === data.ride_id);
        if (q && e) { const L = tripLabel(e), m = member(q.requested_by); S.ui.wa = [{ to: firstName(m.name), phone: m.phone, text: `Ciao ${firstName(m.name)}, porto io ${q.athlete_name} a ${L.trip} (${L.d}). Parto da ${r ? r.depart_from || "—" : "—"}${r && r.depart_time ? " alle " + r.depart_time : ""}.` }]; }
      }
      if (act === "sp-del") {
        const sp = (b.dataset.scope === "platform" ? S.platSponsors : S.teamSponsors).find((x) => x.id === id);
        const { error } = await sb.from("sponsors").delete().eq("id", id); if (error) throw error;
        if (sp && sp.logo_path) sb.storage.from("sponsor-logos").remove([sp.logo_path]).then(() => {}, () => {});
        toast("Sponsor eliminato"); S.ui.confirm = null; await reloadSponsors(b.dataset.scope); return;
      }
      if (act === "del-req") { const { error } = await sb.from("ride_requests").delete().eq("id", id); if (error) throw error; toast("Richiesta ritirata"); }
      if (act === "del-event") { const { error } = await sb.from("events").delete().eq("id", id); if (error) throw error; toast("Trasferta eliminata"); }
      if (act === "approve") { const { error } = await sb.from("team_members").update({ status: "active" }).eq("team_id", S.team.id).eq("user_id", id); if (error) throw error; toast("Genitore accettato"); }
      if (act === "reject" || act === "remove-member") { const { error } = await sb.from("team_members").delete().eq("team_id", S.team.id).eq("user_id", id); if (error) throw error; toast(act === "reject" ? "Richiesta rifiutata" : "Membro rimosso"); }
      if (act === "toggle-admin") { const m = S.members.find((x) => x.user_id === id); const { error } = await sb.from("team_members").update({ role: m.role === "admin" ? "parent" : "admin" }).eq("team_id", S.team.id).eq("user_id", id); if (error) throw error; }
      if (act === "leave") { const { error } = await sb.rpc("leave_team", { p_team: S.team.id }); if (error) throw error; unsubscribe(); location.hash = "#/"; toast("Hai lasciato la squadra"); return; }
      if (act === "toggle-approval") { const { error } = await sb.from("teams").update({ require_approval: b.checked }).eq("id", S.team.id); if (error) throw error; toast(b.checked ? "Approvazione attiva" : "Approvazione disattivata"); }
      if (act === "regen") { const { error } = await sb.rpc("regenerate_invite", { p_team: S.team.id }); if (error) throw error; toast("Nuovo invito creato"); }
      if (act === "veh-toggle") { const v = S.vehicles.find((x) => x.id === id); const { error } = await sb.from("vehicles").update({ active: !v.active }).eq("id", id); if (error) throw error; }
      if (act === "veh-del") { const { error } = await sb.from("vehicles").delete().eq("id", id); if (error) throw error; toast("Mezzo eliminato"); }
      if (act === "del-team") { const { error } = await sb.from("teams").delete().eq("id", S.team.id); if (error) throw error; unsubscribe(); location.hash = "#/"; toast("Squadra eliminata"); return; }
      closeForms(); await reloadTeam();
    } catch (e) { toast(errMsg(e)); b.disabled = false; if (act === "toggle-approval") b.checked = !b.checked; }
  });

  document.addEventListener("change", (ev) => {
    const sel = ev.target.closest('select[name="vehicle"]');
    if (sel) { const o = sel.selectedOptions[0]; const f = sel.form; if (o && f.elements.seats) f.elements.seats.value = o.dataset.seats; }
    const tt = ev.target.closest('select[name="target-team"]');
    if (tt) S.ui.adminTeam = tt.value;
  });

  function rerenderSp() { if (location.hash.startsWith("#/admin")) renderAdmin(); else renderTeam(); }
  async function reloadSponsors(scope) {
    S.ui.spEdit = null;
    if (scope === "platform") { const [l, r] = await Promise.all([sb.from("sponsors").select("*").eq("scope", "platform").order("created_at"), sb.rpc("sponsor_report", { p_team: null })]); S.platSponsors = l.data || []; S.platSponsorStats = r.data || []; renderAdmin(); }
    else { S.teamSponsorsLoaded = false; try { S.sponsors = (await sb.rpc("get_sponsors", { p_team: S.team.id })).data || []; } catch (e) {} await loadTeamSponsors(); }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copiato"); }
    catch (e) { prompt("Copia il testo:", text); }
  }

  document.addEventListener("submit", async (ev) => {
    const f = ev.target; ev.preventDefault();
    const kind = f.dataset.form; if (!kind) return;
    const fd = new FormData(f); const v = (k) => String(fd.get(k) ?? "").trim();
    const btn = f.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    try {
      if (kind === "login-email") {
        const email = v("email");
        const redirect = location.origin + location.pathname;
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
        if (error) throw error;
        S.ui.loginEmail = email; viewLogin(); return;
      }
      if (kind === "login-code") {
        const { error } = await sb.auth.verifyOtp({ email: S.ui.loginEmail, token: v("code"), type: "email" });
        if (error) { toast("Codice non valido o scaduto"); if (btn) btn.disabled = false; return; }
        S.ui.loginEmail = null; return;
      }
      if (kind === "profile-name") {
        if (!telOk(v("phone"))) { toast("Scrivi un numero di cellulare valido"); if (btn) btn.disabled = false; return; }
        const upd = { display_name: v("name") }; if (fd.has("phone")) upd.phone = v("phone");
        const { error } = await sb.from("profiles").update(upd).eq("id", S.user.id); if (error) throw error;
        Object.assign(S.profile, upd); toast("Salvato");
        if ((location.hash || "#/").startsWith("#/profilo")) location.hash = "#/"; else route();
        return;
      }
      if (kind === "consents") {
        if (!fd.get("terms") || !fd.get("parent")) { toast("Per continuare servono le due spunte obbligatorie"); if (btn) btn.disabled = false; return; }
        await saveConsent("terms", true); await saveConsent("parent", true);
        for (const k of ["news", "stats"]) { const want = fd.get(k) === "on"; if (want !== hasConsent(k) || !(S.consents && S.consents[k])) await saveConsent(k, want); }
        S.ui.legalOpen = null; route(); return;
      }
      if (kind === "landing-code") {
        const code = v("code").toUpperCase().replace(/\s+/g, "");
        const { data } = await sb.rpc("preview_invite", { p_code: code });
        const t = data && data[0];
        if (!t) { toast(ERRORS.invalid_code); if (btn) btn.disabled = false; return; }
        store("it-next", "#/join/" + encodeURIComponent(code)); S.ui.inviteName = t.team_name; S.ui.landing = "email"; viewLogin(); return;
      }
      if (kind === "code-join") { S.ui.codeOpen = false; location.hash = "#/join/" + encodeURIComponent(v("code").toUpperCase().replace(/\s+/g, "")); return; }
      if (kind === "join-multi") {
        const picks = fd.getAll("pick");
        if (!picks.length) { toast("Spunta almeno una squadra"); if (btn) btn.disabled = false; return; }
        const miss = picks.find((c) => !String(fd.get("ath-" + c) || "").trim());
        if (miss) { toast("Scrivi il nome dell'atleta per ogni squadra spuntata"); f.elements["ath-" + miss]?.focus(); if (btn) btn.disabled = false; return; }
        let ok = 0, wait = 0, last = null;
        for (const c of picks) {
          const { data, error } = await sb.rpc("join_team", { p_code: c, p_athletes: String(fd.get("ath-" + c)).trim() });
          if (error) { toast(errMsg(error)); continue; }
          const r = data && data[0]; if (!r) continue;
          if (r.status === "pending") wait++; else { ok++; last = r.team_id; }
        }
        toast(ok && wait ? `Sei entrato in ${ok} ${ok === 1 ? "squadra" : "squadre"}; ${wait} in attesa di approvazione` : ok ? `Benvenuto! Sei entrato in ${ok} ${ok === 1 ? "squadra" : "squadre"}` : wait ? "Richiesta inviata: attendi l'approvazione" : "Nessuna squadra aggiunta");
        if (last) store("it-last-team", last);
        location.hash = "#/"; return;
      }
      if (kind === "join") {
        const { data, error } = await sb.rpc("join_team", { p_code: f.dataset.code, p_athletes: v("athletes") }); if (error) throw error;
        const r = data && data[0];
        if (r && r.status === "pending") { toast("Richiesta inviata: attendi l'approvazione"); location.hash = "#/"; }
        else { toast("Benvenuto in squadra!"); location.hash = "#/t/" + r.team_id + "/trasferte"; }
        return;
      }
      if (kind === "new-team") {
        const { data, error } = await sb.rpc("create_team", { p_name: v("name"), p_sport: S.ui.newSport || "basket", p_category: v("category"), p_season: v("season"), p_athletes: v("athletes") });
        if (error) throw error;
        S.ui.newSport = null; try { await saveConsent("club", true, data.id); } catch (e) { /* registro facoltativo */ } store("it-wizard-" + data.id, "2"); store("it-last-team", data.id); toast("Squadra creata"); location.hash = "#/t/" + data.id + "/trasferte"; return;
      }
      if (kind === "event") {
        const row = { team_id: f.dataset.id ? evTeam(f.dataset.id) : targetTeam(false).id, title: v("title"), starts_at: toISO(v("date"), v("time")), place: v("place"), notes: v("notes"), km_round_trip: v("km") ? Number(v("km")) : null };
        const q = f.dataset.id ? sb.from("events").update(row).eq("id", f.dataset.id) : sb.from("events").insert({ ...row, created_by: S.user.id });
        const { error } = await q; if (error) throw error; toast(f.dataset.id ? "Trasferta aggiornata" : "Trasferta aggiunta");
      }
      if (kind === "offer") {
        if (!telOk(v("phone"))) { toast("Scrivi un numero di cellulare valido"); if (btn) btn.disabled = false; return; }
        if (!driverOk()) { if (fd.get("driver") !== "on") { toast("Per offrire un passaggio serve la dichiarazione del conducente"); if (btn) btn.disabled = false; return; } await saveConsent("driver", true, season()); }
        const { data: nr, error } = await sb.from("rides").insert({ event_id: f.dataset.id, team_id: evTeam(f.dataset.id), kind: "parent", driver_user_id: S.user.id, driver_name: S.profile.display_name, driver_phone: v("phone"), seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), notes: v("notes"), return_trip: fd.get("back") === "on", created_by: S.user.id }).select("id").single();
        if (error) throw error; toast("Passaggio pubblicato");
        if (v("phone") && !S.profile.phone) { S.profile.phone = v("phone"); sb.from("profiles").update({ phone: v("phone") }).eq("id", S.user.id).then(() => {}); }
        const ev = S.events.find((x) => x.id === f.dataset.id);
        if (nr && ev && ev.place && v("from")) estimateKm(v("from"), ev.place).then(async (km) => { if (km != null) { await sb.rpc("set_ride_km", { p_ride: nr.id, p_km: km }); if (S.team && !anyFormOpen()) reloadTeam(); } });
      }
      if (kind === "req") {
        const { error } = await sb.from("ride_requests").insert({ event_id: f.dataset.id, team_id: evTeam(f.dataset.id), athlete_name: v("athlete"), depart_from: v("from"), direction: v("direction") || "ar", requested_by: S.user.id });
        if (error) { if (/duplicate|unique/i.test(error.message || "")) { toast("Per questo atleta c'è già una richiesta"); if (btn) btn.disabled = false; return; } throw error; }
        toast("Richiesta pubblicata");
      }
      if (kind === "club") {
        const { error } = await sb.from("rides").insert({ event_id: f.dataset.id, team_id: evTeam(f.dataset.id), kind: "club", vehicle_id: v("vehicle"), driver_name: v("driver"), seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), return_trip: fd.get("back") === "on", assignment: v("assignment"), created_by: S.user.id });
        if (error) throw error; toast("Mezzo aggiunto");
      }
      if (kind === "book") {
        S.ui.wa = null;
        const { error } = await sb.rpc("book_seat", { p_ride: f.dataset.id, p_athlete: v("athlete"), p_pickup: v("pickup") });
        if (error) throw error; toast("Posto confermato");
        const r = S.rides.find((x) => x.id === f.dataset.id), e = r && S.events.find((x) => x.id === r.event_id);
        if (r && e && r.kind === "parent" && r.created_by !== S.user.id) { const L = tripLabel(e); S.ui.wa = [{ to: firstName(r.driver_name), phone: driverPhone(r), text: `Ciao ${firstName(r.driver_name)}, ho prenotato un posto per ${v("athlete")} nella tua auto per ${L.trip} (${L.d}).${v("pickup") ? " Sale a " + v("pickup") + "." : ""} Grazie!` }]; }
      }
      if (kind === "sponsor") {
        const scope = f.dataset.scope, file = fd.get("logo");
        const vid = !!(file && file.size && /^video\//.test(file.type));
        if (file && file.size && !/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/.test(file.type)) { toast("Formato non supportato: usa PNG, JPG, WEBP, GIF, MP4 o WEBM"); if (btn) btn.disabled = false; return; }
        if (file && file.size > (vid ? 8 : 2) * 1048576) { toast(vid ? "Video troppo grande (max 8 MB)" : "Immagine troppo grande (max 2 MB)"); if (btn) btn.disabled = false; return; }
        const link = v("link");
        if (link && !/^https?:\/\//i.test(link)) { toast("Il link deve iniziare con https://"); if (btn) btn.disabled = false; return; }
        const secs = Math.min(60, Math.max(3, Math.round(Number(v("seconds")) || 6)));
        const row = { name: v("name"), message: v("message"), link_url: link, starts_on: v("from") || null, ends_on: v("to") || null, active: fd.get("active") === "on", seconds: secs };
        if (scope === "platform") { const sp = fd.getAll("sports"); row.sports = sp.length ? sp : null; }
        if (file && file.size) {
          const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
          const path = (scope === "platform" ? "platform" : S.team.id) + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "." + ext;
          const up = await sb.storage.from("sponsor-logos").upload(path, file, { contentType: file.type, upsert: false });
          if (up.error) throw up.error;
          row.logo_path = path; row.media_type = vid ? "video" : "image";
        }
        const q = f.dataset.id ? sb.from("sponsors").update(row).eq("id", f.dataset.id)
          : sb.from("sponsors").insert({ ...row, scope, team_id: scope === "team" ? S.team.id : null, created_by: S.user.id });
        const { error } = await q; if (error) throw error;
        toast(f.dataset.id ? "Sponsor aggiornato" : "Sponsor aggiunto"); await reloadSponsors(scope); return;
      }
      if (kind === "my-athletes") { const { error } = await sb.from("team_members").update({ athletes: v("athletes") }).eq("team_id", S.team.id).eq("user_id", S.user.id); if (error) throw error; toast("Salvato"); }
      if (kind === "vehicle") { try { if (!hasConsent("club:" + S.team.id)) await saveConsent("club", true, S.team.id); } catch (e) { /* registro facoltativo */ } const { error } = await sb.from("vehicles").insert({ team_id: S.team.id, name: v("name"), seats: Number(v("seats")) }); if (error) throw error; toast("Mezzo aggiunto"); }
      if (kind === "team-settings") {
        const { error } = await sb.from("teams").update({ name: v("name"), category: v("category"), season: v("season"), sport: S.ui.editSport || S.team.sport, baseline_per_car: Number(v("perCar")) || 1.5, co2_kg_per_km: Number(v("co2")) || 0.12, cost_per_km: v("cost") === "" ? 0.15 : Number(v("cost")) }).eq("id", S.team.id);
        if (error) throw error; S.ui.editSport = null; toast("Salvato");
      }
      if (kind === "ai") {
        const TT = targetTeam(true);
        const file = fd.get("file"); const text = v("text");
        if ((!file || !file.size) && !text) { toast("Carica un file o incolla il testo"); if (btn) btn.disabled = false; return; }
        if (file && file.size > 5 * 1024 * 1024) { toast("File troppo grande (max 5 MB)"); if (btn) btn.disabled = false; return; }
        if (btn) btn.textContent = "Sto leggendo…";
        const body = { team_id: TT.id, team_name: TT.name, sport: TT.sport, season: TT.season };
        if (file && file.size) { body.media_type = file.type; body.data = await fileToBase64(file); } else body.text = text;
        const { data, error } = await sb.functions.invoke("import-calendar", { body });
        if (error) { logEvent("ai_import_error", TT.id); throw error; }
        logEvent(data && data.events && data.events.length ? "ai_import_ok" : "ai_import_empty", TT.id, data && data.events ? data.events.length : 0);
        if (!data || !Array.isArray(data.events) || !data.events.length) { toast("Nessuna partita trovata nel documento"); if (btn) { btn.disabled = false; btn.textContent = "Leggi il calendario"; } return; }
        S.aiPreview = data.events; renderTeam(); return;
      }
      if (kind === "ai-confirm") {
        const TT = targetTeam(true);
        const picks = fd.getAll("pick").map(Number);
        const rows = picks.map((i) => { const e = S.aiPreview[i]; const km = fd.get("km-" + i); return { team_id: TT.id, title: String(e.title).slice(0, 120), starts_at: toISO(e.date, e.time), place: String(e.place || "").slice(0, 200), notes: "", km_round_trip: km ? Number(km) : null, created_by: S.user.id }; });
        if (!rows.length) { toast("Seleziona almeno una trasferta"); if (btn) btn.disabled = false; return; }
        const { error } = await sb.from("events").insert(rows); if (error) throw error;
        toast(rows.length === 1 ? "1 trasferta aggiunta" : rows.length + " trasferte aggiunte"); S.ui.ai = false; S.aiPreview = null;
      }
      closeForms(); await reloadTeam();
    } catch (e) { toast(errMsg(e)); if (btn) { btn.disabled = false; if (kind === "ai") btn.textContent = "Leggi il calendario"; } }
  });

  init();
})();
