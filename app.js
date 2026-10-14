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
    ride_full: "Auto piena: qualcuno ha appena preso l'ultimo posto.",
    athlete_already_booked: "Questo atleta ha già un posto per questa trasferta.",
    invalid_code: "Codice invito non valido o scaduto. Chiedi un nuovo link all'amministratore.",
    forbidden: "Non hai i permessi per questa operazione.",
    convocation_only_admin: "Su questo mezzo i posti li assegna la società.",
    last_admin: "Sei l'unico amministratore: nomina un altro amministratore prima di uscire.",
    event_past: "La trasferta è già passata.",
    not_authenticated: "Sessione scaduta: accedi di nuovo.",
    request_gone: "Questa richiesta non c'è più.",
    need_own_ride: "Prima offri il tuo passaggio su questa trasferta, poi premi di nuovo «Lo porto io».",
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
    return S.profile;
  }

  function viewLogin(nextHash) {
    if (nextHash) store("it-next", nextHash);
    const step = S.ui.loginEmail ? "code" : "email";
    $app.innerHTML = `
      <div class="hero"><div class="in">
        <div class="label" style="color:var(--brand)">Beta</div>
        <h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg" alt="Carpoolino" class="wordmark"></h1>
        <p style="font-size:1.15rem;margin:0">Le trasferte della squadra, organizzate in un minuto.</p>
      </div></div>
      <div class="wrap narrow">
        ${step === "email" ? `
        <form class="card form" data-form="login-email">
          <label class="full">La tua email<input type="email" name="email" required autocomplete="email" placeholder="nome@esempio.it"></label>
          <div class="actions"><button class="btn-primary btn-block" type="submit">Ricevi il codice di accesso</button></div>
          <p class="full small muted" style="margin:0">Niente password: ti mandiamo un codice di 6 cifre (e un link) via email.</p>
        </form>` : `
        <form class="card form" data-form="login-code">
          <p class="full" style="margin:0">Abbiamo scritto a <b>${esc(S.ui.loginEmail)}</b>. Inserisci il codice ricevuto, oppure apri il link nella mail da questo stesso telefono.</p>
          <label class="full">Codice<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required placeholder="123456"></label>
          <div class="actions"><button class="btn-primary" type="submit">Entra</button><button class="btn-ghost" type="button" data-act="login-restart">Cambia email</button></div>
        </form>`}
        <p class="small muted">Usando Carpoolino accetti che il tuo nome e quello dei tuoi atleti siano visibili agli altri membri delle tue squadre. Nessun indirizzo di casa, nessuna posizione in tempo reale, nessun pagamento.</p>
      </div>`;
  }

  function viewName() {
    $app.innerHTML = `<div class="wrap narrow">
      <h1>Come ti chiami?</h1>
      <form class="card form" data-form="profile-name">
        <label class="full">Il tuo nome, come ti vedranno gli altri genitori<input name="name" required maxlength="80" placeholder="Es. Carmine, papà di Nicolò" value="${esc(S.profile?.display_name || "")}"></label>
        <label class="full">Il tuo cellulare (per gli avvisi WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile?.phone || "")}"></label>
        <p class="full small muted" style="margin:0">Il numero lo vedono solo i genitori delle tue squadre: serve per avvisare con un tocco chi guida o chi ha prenotato.</p>
        <div class="actions"><button class="btn-primary" type="submit">Continua</button></div>
      </form></div>`;
  }

  const logEvent = (kind, team, qty) => { try { sb.rpc("log_event", { p_kind: kind, p_team: team || null, p_qty: qty || 0 }).then(() => {}, () => {}); } catch (e) { /* facoltativo */ } };
  function logOpenOncePerDay() { const d = new Date().toISOString().slice(0, 10); if (store("cp-open") !== d) { store("cp-open", d); logEvent("app_open"); } }

  // ---------- router ----------
  async function route() {
    const hash = location.hash || "#/";
    if (!S.session) return viewLogin(hash !== "#/" ? hash : null);
    try { await ensureProfile(); } catch (e) { toast(errMsg(e)); }
    if (!S.profile?.display_name) return viewName();
    logOpenOncePerDay();
    const next = store("it-next");
    if (next) { store("it-next", null); if (next !== hash) { location.hash = next; return; } }

    const parts = hash.slice(2).split("/");
    if (parts[0] === "join" && parts[1]) return viewJoin(decodeURIComponent(parts[1]));
    if (parts[0] === "new") return viewNewTeam();
    if (parts[0] === "profilo") return viewProfile();
    if (parts[0] === "admin") return viewAdmin();
    if (parts[0] === "t" && parts[1]) return viewTeam(parts[1], parts[2] || "trasferte");
    return viewHome();
  }

  function topBar({ title, sub, back, tabs, active, teamId }) {
    return `<header class="top"><div class="in">
      ${back ? `<a class="iconbtn" href="${back}" aria-label="Indietro"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></a>` : ""}
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
  const footer = () => `<footer class="foot">Carpoolino beta · solo coordinamento tra famiglie, nessun pagamento · <a href="mailto:${esc(CFG.SUPPORT_EMAIL || "")}">segnala un problema</a></footer>`;

  // ---------- home: le mie squadre ----------
  async function viewHome() {
    unsubscribe();
    $app.innerHTML = topBar({}) + `<div class="wrap"><div class="boot">Carico le tue squadre…</div></div>`;
    const uid = S.user.id;
    const { data: mems, error } = await sb.from("team_members").select("team_id, role, status, athletes").eq("user_id", uid);
    if (error) return toast(errMsg(error));
    S.memberships = mems || [];
    const ids = S.memberships.filter((m) => m.status === "active").map((m) => m.team_id);
    let teams = [], events = [], rides = [], bookings = [];
    if (ids.length) {
      teams = (await sb.from("teams").select("*").in("id", ids)).data || [];
      const now = new Date(Date.now() - 6 * 3600e3).toISOString();
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
      ${cards || `<div class="empty"><strong>Nessuna squadra</strong>Crea la tua squadra oppure entra con il link o il codice ricevuto.</div>`}
      <div class="stack">
        <a class="btn btn-primary btn-block" href="#/new">+ Crea una nuova squadra</a>
        ${S.ui.codeOpen ? `<form class="card form" data-form="code-join"><label class="full">Codice invito<input name="code" required maxlength="12" autocapitalize="characters" placeholder="Es. K7Q4M2PX"></label><div class="actions"><button class="btn-primary" type="submit">Continua</button><button class="btn-ghost" type="button" data-act="code-close">Annulla</button></div></form>`
          : `<button class="btn-ghost btn-block" data-act="code-open">Ho un codice invito</button>`}
      </div></div>` + footer();
  }

  // ---------- nuova squadra ----------
  function viewNewTeam() {
    unsubscribe();
    const sp = S.ui.newSport || "basket", L = SPORTS[sp];
    $app.innerHTML = topBar({ title: "Nuova squadra", back: "#/" }) + `<div class="wrap">
      <form class="card form" data-form="new-team">
        <div class="full stack" style="gap:8px"><div class="label">Sport</div>
          <div class="pill-group" role="radiogroup" aria-label="Sport">${SPORT_ORDER.map((k) => `<button type="button" class="pill" role="radio" aria-checked="${k === sp}" data-act="pick-sport" data-v="${k}">${esc(SPORTS[k].label)}</button>`).join("")}</div></div>
        <label class="full">Nome squadra<input name="name" required minlength="2" maxlength="80" placeholder="Es. Urania Milano U17"></label>
        <label>Categoria<input name="category" maxlength="40" placeholder="Es. U17"></label>
        <label>Stagione<input name="season" maxlength="20" value="2026/27"></label>
        <label class="full">Il tuo atleta (facoltativo)<input name="athletes" maxlength="200" placeholder="Es. Nicolò — più nomi separati da virgola"></label>
        <div class="full card" style="background:var(--bg)"><div class="label">Così vedranno le pagine i genitori</div>
          <div class="small">Luogo: <b>${esc(L.place)}</b> · Orario: <b>${esc(L.time)}</b> · Evento: <b>${esc(L.event)}</b></div></div>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Crea squadra</button></div>
      </form></div>`;
  }

  // ---------- entrare con invito ----------
  async function viewJoin(code) {
    unsubscribe();
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

  // ---------- profilo ----------
  function viewProfile() {
    unsubscribe();
    $app.innerHTML = topBar({ title: "Profilo", back: "#/" }) + `<div class="wrap narrow">
      <form class="card form" data-form="profile-name">
        <label class="full">Il tuo nome<input name="name" required maxlength="80" value="${esc(S.profile.display_name)}"></label>
        <label class="full">Cellulare (per WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile.phone || "")}"></label>
        <div class="full small muted">Il numero è visibile solo ai genitori delle tue squadre.</div>
        <div class="full small muted">Accesso con: ${esc(S.user.email || "")}</div>
        <div class="actions"><button class="btn-primary" type="submit">Salva</button></div>
      </form>
      ${S.platformAdmin ? `<a class="btn btn-primary btn-block" href="#/admin">Pannello di amministrazione</a>` : ""}
      <button class="btn-ghost" data-act="logout">Esci</button>
    </div>` + footer();
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
        <div class="small muted">Compaiono alle squadre degli sport scelti, salvo le squadre Premium che hanno sponsor propri attivi.</div>
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

  async function loadTeam(id) {
    const uid = S.user.id;
    const [t, me] = await Promise.all([
      sb.from("teams").select("*").eq("id", id).maybeSingle(),
      sb.from("team_members").select("*").eq("team_id", id).eq("user_id", uid).maybeSingle()
    ]);
    if (t.error) throw t.error;
    S.team = t.data; S.me = me.data;
    if (!S.team) return false;
    const [mem, ev, ri, bo, ve, rq] = await Promise.all([
      sb.from("team_members").select("*").eq("team_id", id),
      sb.from("events").select("*").eq("team_id", id).order("starts_at"),
      sb.from("rides").select("*").eq("team_id", id).order("created_at"),
      sb.from("bookings").select("*").eq("team_id", id).order("created_at"),
      sb.from("vehicles").select("*").eq("team_id", id).order("created_at"),
      sb.from("ride_requests").select("*").eq("team_id", id).order("created_at")
    ]);
    const memberIds = (mem.data || []).map((m) => m.user_id);
    const prof = memberIds.length ? (await sb.from("profiles").select("id,display_name,phone").in("id", memberIds)).data || [] : [];
    S.members = (mem.data || []).map((m) => { const pr = prof.find((p) => p.id === m.user_id) || {}; return { ...m, name: pr.display_name || "Genitore", phone: pr.phone || "" }; });
    S.events = ev.data || []; S.rides = ri.data || []; S.bookings = bo.data || []; S.vehicles = ve.data || []; S.requests = rq.data || [];
    try { S.sponsors = (await sb.rpc("get_sponsors", { p_team: id })).data || []; } catch (e) { S.sponsors = []; }
    return true;
  }

  function subscribe(id) {
    if (S.loadedTeam === id && S.channel) return;
    unsubscribe(); S.loadedTeam = id;
    let t;
    const refresh = () => { clearTimeout(t); t = setTimeout(async () => { if (S.loadedTeam !== id) return; if (anyFormOpen()) return; await loadTeam(id); renderTeam(); }, 400); };
    S.channel = sb.channel("team-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides", filter: "team_id=eq." + id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: "team_id=eq." + id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: "team_id=eq." + id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests", filter: "team_id=eq." + id }, refresh)
      .subscribe();
  }
  const anyFormOpen = () => !!(S.ui.offer || S.ui.book || S.ui.club || S.ui.editEvent || S.ui.newEvent || S.ui.req);
  const member = (uid) => S.members.find((m) => m.user_id === uid) || {};
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

  function teamTabs() {
    const tabs = [["trasferte", "Trasferte"], ["membri", "Membri"], ["invita", "Invita"]];
    if (isAdmin()) tabs.push(["mezzi", "Mezzi"], ["report", "Report"]);
    if (isAdmin() && premium()) tabs.push(["sponsor", "Sponsor"]);
    if (isAdmin()) tabs.push(["impostazioni", "Squadra"]);
    return tabs;
  }

  function renderTeam() {
    const t = S.team;
    const tabs = teamTabs();
    if (!tabs.some(([k]) => k === currentTab)) currentTab = "trasferte";
    const head = topBar({ title: t.name, sub: `${sportOf(t).label}${t.category ? " · " + t.category : ""} · ${t.season}`, back: "#/", tabs, active: currentTab, teamId: t.id });
    const body = { trasferte: tabTrips, membri: tabMembers, invita: tabInvite, mezzi: tabVehicles, report: tabReport, sponsor: tabSponsors, impostazioni: tabSettings }[currentTab]();
    const y = window.scrollY;
    $app.innerHTML = head + `<div class="wrap">${waPanel()}${t.plan === "beta" && isAdmin() && currentTab === "trasferte" ? `<div class="notice small">Versione beta: tutte le funzioni Premium sono attive gratuitamente.</div>` : ""}${body}</div>` + footer();
    window.scrollTo(0, y);
    if (currentTab === "invita") drawQR();
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
    const cut = Date.now() - 6 * 3600e3;
    const up = S.events.filter((e) => new Date(e.starts_at).getTime() >= cut);
    const past = S.events.filter((e) => new Date(e.starts_at).getTime() < cut).reverse();
    const admin = isAdmin();
    return `
      ${canAddEvents() ? `<div class="row noprint">
        ${S.ui.newEvent ? "" : `<button class="btn-primary" data-act="new-event">+ Aggiungi trasferta</button>`}
        ${admin && premium() ? `<button class="btn-ghost" data-act="ai-open">Importa calendario con l'AI</button>` : ""}
      </div>` : ""}
      ${savingsCard()}
      ${S.ui.newEvent ? eventForm(null, L) : ""}
      ${S.ui.ai ? aiPanel() : ""}
      ${up.length ? up.map((e) => tripCard(e, false)).join("") : `<div class="empty"><strong>Nessuna trasferta in programma</strong>${admin ? "Aggiungi la prossima trasferta o importa il calendario." : "Quando l'amministratore aggiunge una trasferta, comparirà qui."}</div>`}
      ${past.length ? `<button class="btn-link" data-act="toggle-past">${S.showPast ? "Nascondi" : "Mostra"} trasferte passate (${past.length})</button>${S.showPast ? past.map((e) => tripCard(e, true)).join("") : ""}` : ""}
      ${sponsorStrip()}`;
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
  function savingsCard() {
    const v = computeSavings();
    const empty = !v.team.km && !v.fam.km && !v.fam.given;
    return `<div class="card savings">
      <div class="label">🌱 Il risparmio di questa stagione</div>
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
  function sponsorStrip() {
    const L = S.sponsors || []; if (!L.length) return "";
    return `<div class="sponsors noprint"><div class="label">Con il supporto di</div><div class="sp-row">${L.map((sp) => {
      const inner = `${sp.logo_path ? `<img src="${esc(logoUrl(sp.logo_path))}" alt="${esc(sp.name)}" loading="lazy">` : `<b>${esc(sp.name)}</b>`}${sp.message ? `<span>${esc(sp.message)}</span>` : ""}`;
      return sp.link_url ? `<a class="sp" href="${esc(sp.link_url)}" target="_blank" rel="noopener sponsored" data-sp="${sp.id}">${inner}</a>` : `<div class="sp">${inner}</div>`;
    }).join("")}</div></div>`;
  }
  function countSponsorViews() {
    if (!S.team || !(S.sponsors || []).length || !document.querySelector(".sponsors")) return;
    S.sponsors.forEach((sp) => { const k = "sp-v-" + sp.id + "-" + S.team.id; let seen = null; try { seen = sessionStorage.getItem(k); } catch (e) {}
      if (!seen) { try { sessionStorage.setItem(k, "1"); } catch (e) {} sb.rpc("sponsor_hit", { p_sponsor: sp.id, p_team: S.team.id, p_kind: "view" }).then(() => {}, () => {}); } });
  }
  document.addEventListener("click", (ev) => { const a = ev.target.closest("a[data-sp]"); if (a && S.team) sb.rpc("sponsor_hit", { p_sponsor: a.dataset.sp, p_team: S.team.id, p_kind: "click" }).then(() => {}, () => {}); });

  function sponsorForm(sp, scope) {
    const sports = sp?.sports || [];
    return `<form class="card form" data-form="sponsor" data-scope="${scope}" data-id="${sp ? sp.id : ""}">
      <h3 class="full">${sp ? "Modifica sponsor" : "Nuovo sponsor"}</h3>
      <label class="full">Nome<input name="name" required minlength="2" maxlength="80" value="${esc(sp?.name || "")}" placeholder="Es. Pizzeria Da Mario"></label>
      <label class="full">Messaggio breve (facoltativo)<input name="message" maxlength="140" value="${esc(sp?.message || "")}" placeholder="Es. Sconto 10% per le famiglie della squadra"></label>
      <label class="full">Sito o pagina (facoltativo)<input name="link" type="url" maxlength="300" value="${esc(sp?.link_url || "")}" placeholder="https://…"></label>
      <label class="full">Logo (PNG, JPG o WEBP · max 1 MB)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
      ${sp?.logo_path ? `<div class="full small muted">Logo attuale: <img src="${esc(logoUrl(sp.logo_path))}" alt="" style="height:28px;vertical-align:middle"> (carica un file solo per sostituirlo)</div>` : ""}
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
      return `<div class="member">${sp.logo_path ? `<img src="${esc(logoUrl(sp.logo_path))}" alt="" class="sp-thumb">` : `<div class="avatar">${esc(initials(sp.name))}</div>`}
        <div style="flex:1;min-width:0"><b>${esc(sp.name)}</b> <span class="chip ${live ? "ok" : ""}">${live ? "visibile" : "non visibile"}</span>
          <div class="small muted">${scope === "platform" ? (sp.sports && sp.sports.length ? sp.sports.map((k) => esc((SPORTS[k] || SPORTS.altro).label)).join(", ") : "tutti gli sport") + " · " : ""}${sp.starts_on || sp.ends_on ? `dal ${esc(sp.starts_on || "—")} al ${esc(sp.ends_on || "—")} · ` : ""}${fmt(x.views)} visualizzazioni, ${fmt(x.clicks)} clic (30 gg: ${fmt(x.views_30d)} / ${fmt(x.clicks_30d)})</div>
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
    return `<div class="notice small">Gli sponsor della società compaiono solo ai membri di questa squadra, in fondo alla lista delle trasferte e nel report. Finché ne hai almeno uno attivo, sostituiscono quelli di Carpoolino.</div>
      ${S.ui.spEdit ? sponsorForm(editing, "team") : `<button class="btn-primary" data-act="sp-new">+ Aggiungi sponsor</button>`}
      <div class="card"><div class="label">Sponsor della squadra · ${(S.teamSponsors || []).length}</div>${sponsorList(S.teamSponsors || [], S.teamSponsorStats, "team")}</div>`;
  }

  function eventForm(e, L) {
    const p = e ? dateParts(e.starts_at) : null;
    return `<form class="card form" data-form="event" data-id="${e ? e.id : ""}">
      <h3 class="full">${e ? "Modifica trasferta" : "Nuova trasferta"}</h3>
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
      <div class="stub"><span class="dow">${p.dow}</span><span class="day">${p.day}</span><span class="mon">${p.mon}</span><span class="time">${p.time}</span></div>
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
  const inviteUrl = () => location.origin + location.pathname + "#/join/" + S.team.invite_code;
  const inviteText = () => `Ciao! Per organizzare i passaggi alle trasferte di ${S.team.name} usiamo Carpoolino: entra da qui e scrivi il nome del tuo atleta. ${inviteUrl()}`;
  function tabInvite() {
    const admin = isAdmin();
    return `<div class="card">
        <div class="qr" id="qr" role="img" aria-label="QR code dell'invito"></div>
        <div class="small muted" style="text-align:center">Inquadra per entrare nella squadra · codice <b>${esc(S.team.invite_code)}</b></div>
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
      </div>
      ${sponsorStrip()}`;
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
      "csv": () => exportCSV(),
      "copy-link": () => copy(inviteUrl()),
      "copy-text": () => copy(inviteText()),
      "admin-filter": () => { S.ui.adminFilter = b.dataset.v; renderAdmin(); },
      "admin-csv": () => adminCSV(),
      "admin-refresh": () => viewAdmin(),
      "sp-new": () => { S.ui.spEdit = "new"; S.ui.confirm = null; rerenderSp(); },
      "sp-edit": () => { S.ui.spEdit = id; S.ui.confirm = null; rerenderSp(); },
      "sp-cancel": () => { S.ui.spEdit = null; S.ui.confirm = null; rerenderSp(); },
      "sp-ask-del": () => { S.ui.confirm = "sp:" + id; rerenderSp(); }
    };
    if (simple[act]) return simple[act]();
    if (act.startsWith("ask-")) { const map = { "ask-del-event": "event:" + id, "ask-del-ride": "ride:" + id, "ask-remove-member": "member:" + id, "ask-leave": "leave", "ask-regen": "regen", "ask-veh-del": "veh:" + id, "ask-del-team": "del-team" }; S.ui.confirm = map[act]; return renderTeam(); }

    b.disabled = true;
    try {
      if (act === "logout") { await sb.auth.signOut(); S.profile = null; location.hash = "#/"; return; }
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
        Object.assign(S.profile, upd); toast("Salvato"); route(); return;
      }
      if (kind === "code-join") { S.ui.codeOpen = false; location.hash = "#/join/" + encodeURIComponent(v("code").toUpperCase()); return; }
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
        S.ui.newSport = null; toast("Squadra creata"); location.hash = "#/t/" + data.id + "/invita"; return;
      }
      if (kind === "event") {
        const row = { team_id: S.team.id, title: v("title"), starts_at: toISO(v("date"), v("time")), place: v("place"), notes: v("notes"), km_round_trip: v("km") ? Number(v("km")) : null };
        const q = f.dataset.id ? sb.from("events").update(row).eq("id", f.dataset.id) : sb.from("events").insert({ ...row, created_by: S.user.id });
        const { error } = await q; if (error) throw error; toast(f.dataset.id ? "Trasferta aggiornata" : "Trasferta aggiunta");
      }
      if (kind === "offer") {
        if (!telOk(v("phone"))) { toast("Scrivi un numero di cellulare valido"); if (btn) btn.disabled = false; return; }
        const { data: nr, error } = await sb.from("rides").insert({ event_id: f.dataset.id, team_id: S.team.id, kind: "parent", driver_user_id: S.user.id, driver_name: S.profile.display_name, driver_phone: v("phone"), seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), notes: v("notes"), return_trip: fd.get("back") === "on", created_by: S.user.id }).select("id").single();
        if (error) throw error; toast("Passaggio pubblicato");
        if (v("phone") && !S.profile.phone) { S.profile.phone = v("phone"); sb.from("profiles").update({ phone: v("phone") }).eq("id", S.user.id).then(() => {}); }
        const ev = S.events.find((x) => x.id === f.dataset.id);
        if (nr && ev && ev.place && v("from")) estimateKm(v("from"), ev.place).then(async (km) => { if (km != null) { await sb.rpc("set_ride_km", { p_ride: nr.id, p_km: km }); if (S.team && !anyFormOpen()) reloadTeam(); } });
      }
      if (kind === "req") {
        const { error } = await sb.from("ride_requests").insert({ event_id: f.dataset.id, team_id: S.team.id, athlete_name: v("athlete"), depart_from: v("from"), direction: v("direction") || "ar", requested_by: S.user.id });
        if (error) { if (/duplicate|unique/i.test(error.message || "")) { toast("Per questo atleta c'è già una richiesta"); if (btn) btn.disabled = false; return; } throw error; }
        toast("Richiesta pubblicata");
      }
      if (kind === "club") {
        const { error } = await sb.from("rides").insert({ event_id: f.dataset.id, team_id: S.team.id, kind: "club", vehicle_id: v("vehicle"), driver_name: v("driver"), seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), return_trip: fd.get("back") === "on", assignment: v("assignment"), created_by: S.user.id });
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
        if (file && file.size > 1048576) { toast("Logo troppo grande (max 1 MB)"); if (btn) btn.disabled = false; return; }
        const link = v("link");
        if (link && !/^https?:\/\//i.test(link)) { toast("Il link deve iniziare con https://"); if (btn) btn.disabled = false; return; }
        const row = { name: v("name"), message: v("message"), link_url: link, starts_on: v("from") || null, ends_on: v("to") || null, active: fd.get("active") === "on" };
        if (scope === "platform") { const sp = fd.getAll("sports"); row.sports = sp.length ? sp : null; }
        if (file && file.size) {
          const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
          const path = (scope === "platform" ? "platform" : S.team.id) + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "." + ext;
          const up = await sb.storage.from("sponsor-logos").upload(path, file, { contentType: file.type, upsert: false });
          if (up.error) throw up.error;
          row.logo_path = path;
        }
        const q = f.dataset.id ? sb.from("sponsors").update(row).eq("id", f.dataset.id)
          : sb.from("sponsors").insert({ ...row, scope, team_id: scope === "team" ? S.team.id : null, created_by: S.user.id });
        const { error } = await q; if (error) throw error;
        toast(f.dataset.id ? "Sponsor aggiornato" : "Sponsor aggiunto"); await reloadSponsors(scope); return;
      }
      if (kind === "my-athletes") { const { error } = await sb.from("team_members").update({ athletes: v("athletes") }).eq("team_id", S.team.id).eq("user_id", S.user.id); if (error) throw error; toast("Salvato"); }
      if (kind === "vehicle") { const { error } = await sb.from("vehicles").insert({ team_id: S.team.id, name: v("name"), seats: Number(v("seats")) }); if (error) throw error; toast("Mezzo aggiunto"); }
      if (kind === "team-settings") {
        const { error } = await sb.from("teams").update({ name: v("name"), category: v("category"), season: v("season"), sport: S.ui.editSport || S.team.sport, baseline_per_car: Number(v("perCar")) || 1.5, co2_kg_per_km: Number(v("co2")) || 0.12, cost_per_km: v("cost") === "" ? 0.15 : Number(v("cost")) }).eq("id", S.team.id);
        if (error) throw error; S.ui.editSport = null; toast("Salvato");
      }
      if (kind === "ai") {
        const file = fd.get("file"); const text = v("text");
        if ((!file || !file.size) && !text) { toast("Carica un file o incolla il testo"); if (btn) btn.disabled = false; return; }
        if (file && file.size > 5 * 1024 * 1024) { toast("File troppo grande (max 5 MB)"); if (btn) btn.disabled = false; return; }
        if (btn) btn.textContent = "Sto leggendo…";
        const body = { team_id: S.team.id, team_name: S.team.name, sport: S.team.sport, season: S.team.season };
        if (file && file.size) { body.media_type = file.type; body.data = await fileToBase64(file); } else body.text = text;
        const { data, error } = await sb.functions.invoke("import-calendar", { body });
        if (error) { logEvent("ai_import_error", S.team.id); throw error; }
        logEvent(data && data.events && data.events.length ? "ai_import_ok" : "ai_import_empty", S.team.id, data && data.events ? data.events.length : 0);
        if (!data || !Array.isArray(data.events) || !data.events.length) { toast("Nessuna partita trovata nel documento"); if (btn) { btn.disabled = false; btn.textContent = "Leggi il calendario"; } return; }
        S.aiPreview = data.events; renderTeam(); return;
      }
      if (kind === "ai-confirm") {
        const picks = fd.getAll("pick").map(Number);
        const rows = picks.map((i) => { const e = S.aiPreview[i]; const km = fd.get("km-" + i); return { team_id: S.team.id, title: String(e.title).slice(0, 120), starts_at: toISO(e.date, e.time), place: String(e.place || "").slice(0, 200), notes: "", km_round_trip: km ? Number(km) : null, created_by: S.user.id }; });
        if (!rows.length) { toast("Seleziona almeno una trasferta"); if (btn) btn.disabled = false; return; }
        const { error } = await sb.from("events").insert(rows); if (error) throw error;
        toast(rows.length === 1 ? "1 trasferta aggiunta" : rows.length + " trasferte aggiunte"); S.ui.ai = false; S.aiPreview = null;
      }
      closeForms(); await reloadTeam();
    } catch (e) { toast(errMsg(e)); if (btn) { btn.disabled = false; if (kind === "ai") btn.textContent = "Leggi il calendario"; } }
  });

  init();
})();
