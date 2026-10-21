/* geniGO · webapp (beta)
   Nessun build: HTML + JS + Supabase. Tutti i testi degli utenti passano da esc(). */
(function () {
  "use strict";

  const CFG = window.INTRASFERTA_CONFIG || {};
  const SPORTS = window.SPORTS, SPORT_ORDER = window.SPORT_ORDER;
  const $app = document.getElementById("app");

  // ---------- attesa: icona ferma con anello verde che gira, in ogni attesa del database ----------
  const waitOv = document.createElement("div"); waitOv.className = "wait-ov"; waitOv.setAttribute("role", "status"); waitOv.setAttribute("aria-label", "Caricamento in corso");
  waitOv.innerHTML = `<div class="wait-box"><span class="wait-ring"></span><img src="icon.svg" alt="" width="52" height="52"></div>`;
  document.body.appendChild(waitOv);
  let waitN = 0, waitT = null;
  const waiting = (d) => {
    waitN = Math.max(0, waitN + d); clearTimeout(waitT);
    // compare solo se l'attesa supera un attimo; non serve dove c'è già la schermata di caricamento
    if (waitN) waitT = setTimeout(() => { if (!document.querySelector(".boot")) waitOv.classList.add("on"); }, 350);
    else waitOv.classList.remove("on");
  };
  const fetch0 = window.fetch.bind(window);
  window.fetch = (...a) => {
    const url = String((a[0] && a[0].url) || a[0] || "");
    const track = !!CFG.SUPABASE_URL && url.startsWith(CFG.SUPABASE_URL) && !/\/realtime\//.test(url) && !window.__bgLoad;
    if (track) waiting(1);
    const pr = fetch0(...a);
    return track ? pr.finally(() => waiting(-1)) : pr;
  };


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
  async function geocode(q, near) {
    // entro ~250 km dalla destinazione e in Italia: evita omonimi lontani ("parcheggio", "piazza Roma"…)
    const vb = near ? `&bounded=1&viewbox=${near[0] - 2.5},${near[1] + 2.5},${near[0] + 2.5},${near[1] - 2.5}` : "";
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&countrycodes=it" + vb + "&q=" + encodeURIComponent(q));
    const j = await r.json(); return j && j[0] ? [Number(j[0].lon), Number(j[0].lat)] : null;
  }
  async function estimateKm(from, to) {
    if (!from || !to) return null;
    try {
      const b = await geocode(to); if (!b) return null;
      await new Promise((res) => setTimeout(res, 1100)); // limite di cortesia del servizio di geocodifica
      const a = await geocode(from, b); if (!a) return null;
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`);
      const j = await r.json(); const m = j && j.routes && j.routes[0] && j.routes[0].distance;
      const km = m ? Math.round(m / 100) / 10 : null;
      return km != null && km <= 300 ? km : null; // oltre 300 km è quasi certamente un indirizzo frainteso
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
    own_ride_full: "La tua auto è piena.",
    pw_weak: "La password deve avere almeno 8 caratteri, con lettere e numeri.",
    pw_mismatch: "Le due password non coincidono.",
    "Invalid login credentials": "Email o password non corretti. Se non hai ancora una password, accedi con un codice via email.",
    "should be different from the old": "La nuova password deve essere diversa da quella attuale.",
    "Password should": "La password deve avere almeno 8 caratteri, con lettere e numeri.",
    "only request this after": "Attendi qualche secondo prima di chiedere un nuovo codice.",
    "Token has expired or is invalid": "Codice non valido o scaduto.",
    "Signups not allowed for otp": "Non c'è un account con questa email. Torna indietro e scegli «Entra nella squadra» o «Registra la tua squadra».",
    invite_used: "Questo invito è già stato usato. Chiedi all'altro genitore di mandartene uno nuovo.",
    invite_expired: "Questo invito è scaduto. Chiedi all'altro genitore di mandartene uno nuovo.",
    invite_not_found: "Invito non valido.",
    invite_self: "Questo è un invito che hai creato tu: mandalo all'altro genitore.",
    athlete_name_required: "Scrivi il nome dell'atleta.",
    too_many_athletes: "Hai già inserito molti atleti in questa squadra."
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
      if (!!session !== was) {
        S.profile = null;
        // appena entrati: si parte dalle Trasferte, tranne che per un link d'invito
        if (session && !/^#\/(join|genitore)\/|^#\/new$/.test(location.hash) && !/^#\/(join|genitore)\/|^#\/new$/.test(store("it-next") || "")) { store("it-next", null); if ((location.hash || "#/") !== "#/") { history.replaceState(null, "", location.pathname + "#/"); } }
        route();
      }
    });
    window.addEventListener("hashchange", route);
    route();
  }

  async function ensureProfile() {
    if (S.profile) return S.profile;
    // controllo dell'account e dati del profilo in parallelo (un solo giro)
    const sessUser = S.session && S.session.user;
    if (sessUser) S.user = sessUser;
    const early = sessUser ? Promise.all([
      sb.from("profiles").select("*").eq("id", sessUser.id).maybeSingle().then((r) => r, () => ({ data: null })),
      sb.rpc("is_platform_admin").then((r) => r, () => ({ data: false })),
      loadConsents(), loadMyKids()
    ]) : null;
    const gu = await sb.auth.getUser();
    S.user = gu.data && gu.data.user;
    // sessione rimasta in memoria di un account che non esiste più (o scaduta): si esce e si torna all'accesso
    if (!S.user) {
      try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* già fuori */ }
      try { Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* memoria non disponibile */ }
      S.session = null; S.profile = null;
      throw new Error("session_gone");
    }
    let prof, adm;
    if (early && sessUser.id === S.user.id) { [prof, adm] = await early; }
    else {
      [prof, adm] = await Promise.all([sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle(), sb.rpc("is_platform_admin").then((r) => r, () => ({ data: false }))]);
      await Promise.all([loadConsents(), loadMyKids()]);
    }
    S.profile = (prof && prof.data) || { id: S.user.id, display_name: "", phone: "" };
    S.platformAdmin = !!(adm && adm.data === true);
    if (S.profile.phone == null) S.profile.phone = "";
    return S.profile;
  }

  // ---------- figli: ogni ragazzo è una scheda per squadra, collegata a uno o più genitori ----------
  const fullName = (f, l) => (String(f || "").trim() + " " + String(l || "").trim()).trim();
  const normN = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  async function loadMyKids() {
    try {
      const { data, error } = await sb.from("athlete_parents").select("athlete_id,team_id,athletes(id,team_id,first_name,last_name,label)").eq("user_id", S.user.id);
      if (error) throw error;
      S.myKids = (data || []).map((r) => r.athletes).filter(Boolean);
    } catch (e) { S.myKids = null; } // aggiornamento del database non ancora applicato
  }
  const kidRow = (f, l, req, sfx) => `<div class="kid-row"><label>Nome<input name="kf${sfx || ""}" maxlength="40" autocomplete="off" ${req ? "required" : ""} value="${esc(f || "")}"></label><label>Cognome<input name="kl${sfx || ""}" maxlength="40" autocomplete="off" ${req ? "required" : ""} value="${esc(l || "")}"></label></div>`;
  const kidsBlock = (title, req) => `<div class="full kids"><div class="label">${title}</div>${kidRow("", "", req)}<div><button type="button" class="btn-link" data-act="kid-more">+ Aggiungi un altro atleta</button></div></div>`;
  function readKids(fd, sfx) {
    const fs = fd.getAll("kf" + (sfx || "")), ls = fd.getAll("kl" + (sfx || ""));
    return fs.map((f, i) => ({ first: String(f).trim(), last: String(ls[i] || "").trim() })).filter((k) => k.first);
  }
  const kidsMissingSurname = (kids) => kids.find((k) => !k.last);
  // codici d'invito: un codice di gruppo vale per più squadre
  async function expandCodes(codes) {
    const out = [];
    for (const c of codes) {
      const ex = await sb.rpc("expand_invite", { p_code: c }).then((r) => r.data || [], () => []);
      if (ex.length) ex.forEach((x) => out.push(String(x.code).toUpperCase())); else out.push(c);
    }
    return [...new Set(out)];
  }
  // finestra di domanda sì/no, sopra la pagina
  function askModal(title, html, yes, no) {
    return new Promise((res) => {
      const d = document.createElement("div"); d.className = "modal-back";
      d.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${title}</h2>${html}<div class="stack" style="display:grid;gap:8px"><button type="button" class="btn-primary btn-block" data-m="y">${yes}</button><button type="button" class="btn-ghost btn-block" data-m="n">${no}</button></div></div>`;
      d.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; d.remove(); res(b.dataset.m === "y"); });
      document.body.appendChild(d); d.querySelector("[data-m=y]").focus();
    });
  }
  // il ragazzo c'è già (inserito dall'altro genitore) in una o più delle squadre? Una sola domanda per ragazzo.
  // wheres: [{ key, team | code, name }] → restituisce { key: id del ragazzo a cui collegarsi }
  async function resolveKidMulti(kid, wheres) {
    const found = {};
    for (const w of wheres) {
      const { data, error } = await sb.rpc("athlete_matches", { p_first: kid.first, p_last: kid.last, p_team: w.team || null, p_code: w.code || null });
      if (error || !data) continue;
      data.forEach((m) => { const k = (m.exact ? "1" : "0") + normN(m.label); (found[k] = found[k] || { label: m.label, parents: m.parents, exact: m.exact, hits: [] }).hits.push({ key: w.key, id: m.id, name: w.name }); });
    }
    const links = {}, typed = fullName(kid.first, kid.last);
    for (const g of Object.values(found).sort((a, b) => b.exact - a.exact)) {
      const hits = g.hits.filter((h) => !(h.key in links)); if (!hits.length) continue;
      const names = hits.map((h) => `<b>${esc(h.name)}</b>`);
      const where = names.length > 1 ? names.slice(0, -1).join(", ") + " e " + names[names.length - 1] : names[0];
      const by = g.parents ? `L'ha inserito <b>${esc(g.parents)}</b>.` : "";
      const ok = g.exact
        ? await askModal(`${esc(g.label)} è già in squadra`, `<p style="margin:0">È già in ${where}. ${by} Sei anche tu un genitore di ${esc(kid.first)}?</p><p class="small muted" style="margin:0">Con «Sì» vedrai e gestirai le sue prenotazioni${hits.length > 1 ? (hits.length === 2 ? " in tutte e due le squadre" : " in tutte le squadre") : ""}${g.parents ? `; ${esc(firstName(g.parents))} riceve un avviso` : ""}.</p>`, `Sì, sono un genitore di ${esc(kid.first)}`, "No, è un altro atleta")
        : await askModal(`Intendevi ${esc(g.label)}?`, `<p style="margin:0">Hai scritto <b>${esc(typed)}</b>. In ${where} c'è già <b>${esc(g.label)}</b>${g.parents ? `, inserito da ${esc(g.parents)}` : ""}.</p>`, `Sì, è ${esc(g.label)}`, "No, il nome è giusto così");
      hits.forEach((h) => { links[h.key] = ok ? h.id : null; });
    }
    Object.keys(links).forEach((k) => { if (!links[k]) delete links[k]; });
    return links;
  }
  async function resolveKid(kid, where) {
    const t = (S.myTeams || []).find((x) => x.id === where.team);
    return (await resolveKidMulti(kid, [{ ...where, key: "x", name: t ? t.name : "squadra" }])).x || null;
  }
  // ---------- invita l'altro genitore ----------
  // crea il link e mostra la finestra con WhatsApp; ids = schede dei ragazzi (anche di più squadre)
  async function inviteParent(ids, names, intro) {
    const { data: tok, error } = await sb.rpc("create_kid_invite", { p_athletes: ids });
    if (error) { toast(errMsg(error)); return; }
    const url = location.origin + location.pathname + "#/genitore/" + tok;
    const who = names.length > 1 ? names.slice(0, -1).join(", ") + " e " + names[names.length - 1] : names[0];
    const text = `Ciao! Ho inserito ${who} su geniGO per organizzare i passaggi alle trasferte. Apri questo link e registrati: vedrai e potrai gestire anche tu le sue prenotazioni. ${url}`;
    document.querySelector(".modal-back.inv")?.remove();
    const d = document.createElement("div"); d.className = "modal-back inv";
    d.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>Invita l'altro genitore</h2>
      <p style="margin:0">${intro ? esc(intro) + " " : ""}Manda all'altro genitore di <b>${esc(who)}</b> questo link: si registra e viene collegato da solo, senza scrivere nomi.</p>
      <p class="small muted" style="margin:0">Il link vale 14 giorni e una sola volta.</p>
      <div style="display:grid;gap:8px"><a class="btn btn-ok btn-block" target="_blank" rel="noopener" href="${esc(waHref("", text))}" data-m="x">Invia su WhatsApp</a>
        <button type="button" class="btn-ghost btn-block" data-m="copy">Copia il link</button>
        <button type="button" class="btn-link" data-m="x">Più tardi</button></div></div>`;
    d.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; if (b.dataset.m === "copy") { copy(url); return; } setTimeout(() => d.remove(), 50); });
    document.body.appendChild(d);
  }
  // pagina che apre chi riceve il link
  async function viewKidInvite(token) {
    unsubscribe();
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="boot">Controllo l'invito…</div></div>`;
    const { data } = await sb.rpc("preview_kid_invite", { p_token: token });
    const k = data && data[0];
    if (!k) { $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="empty"><strong>Invito non valido</strong>${ERRORS.invite_not_found}</div></div>`; return; }
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow">
      <div class="intro"><div class="label">${esc(k.inviter)} ti ha invitato come genitore di</div><h1>${esc(k.kids)}</h1><div class="meta">${esc(k.teams || "")}</div></div>
      <div class="card">
        ${k.valid ? `<p style="margin:0">Entrerai nella squadra e vedrai le stesse trasferte e prenotazioni di ${esc(firstName(k.inviter))}. Potrai offrire passaggi e prenotare posti per ${esc(firstName(k.kids))}.</p>
          <button class="btn-primary btn-block" data-act="kid-accept" data-id="${esc(token)}">Accetta</button>`
        : `<p style="margin:0">${ERRORS.invite_used}</p>`}
      </div></div>`;
  }
  async function addKids(teamId, kids, links) {
    for (let i = 0; i < kids.length; i++) {
      const { data, error } = await sb.rpc("add_athlete", { p_team: teamId, p_first: kids[i].first, p_last: kids[i].last, p_link: links[i] || null });
      if (error) throw error;
      if (!links[i] && data && data.id) (S.newKidIds = S.newKidIds || []).push({ id: data.id, name: kids[i].first });
    }
  }
  // dopo aver inserito figli nuovi (non collegati a un altro genitore): proponi subito l'invito
  function offerParentInvite() {
    const list = S.newKidIds || []; S.newKidIds = [];
    if (!list.length) return;
    const names = [...new Set(list.map((x) => x.name))];
    setTimeout(() => inviteParent(list.map((x) => x.id), names, "Fatto!"), 600);
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
    $app.innerHTML = `<div class="hero"><div class="in"><h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg?v=gg1" alt="geniGO" class="wordmark"></h1></div></div>
      <div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cons-title">
        <img src="icon.svg" alt="" width="56" height="56" class="modal-icon">
        <h2 id="cons-title">${updated ? "Abbiamo aggiornato i Termini" : "Prima di iniziare, due cose importanti"}</h2>
        ${open ? `<div class="legal-box">${LEGAL[open].html}</div><button class="btn-ghost" data-act="legal-close">← Torna al riepilogo</button>` : `
        <div class="cons-item"><span aria-hidden="true">🤝</span><div><b>geniGO mette in contatto le famiglie, non organizza i viaggi.</b> I passaggi sono accordi gratuiti tra genitori: chi guida è responsabile del proprio viaggio.</div></div>
        <div class="cons-item"><span aria-hidden="true">🚗</span><div><b>Chi offre un passaggio deve poter trasportare gli atleti in sicurezza:</b> patente valida, auto assicurata e revisionata, rispetto del codice della strada, cinture o seggiolini per tutti, non più passeggeri dei posti omologati.</div></div>
        <div class="cons-item"><span aria-hidden="true">🔒</span><div><b>I tuoi dati restano qui.</b> Nome, cellulare e nome dei tuoi atleti li vedono solo le tue squadre. Niente pubblicità profilata, nessun dato ceduto a terzi, nessuna posizione in tempo reale.</div></div>`}
        <form class="form" data-form="consents">
          <label class="full check"><input type="checkbox" name="terms" required ${hasConsent("terms") && !updated ? "checked" : ""}> <span>Ho letto e accetto i <button type="button" class="btn-link" data-act="legal-open" data-v="termini">Termini d'uso</button> e l'<button type="button" class="btn-link" data-act="legal-open" data-v="privacy">Informativa privacy</button> <small class="muted">(obbligatorio)</small></span></label>
          <label class="full check"><input type="checkbox" name="parent" required ${hasConsent("parent") ? "checked" : ""}> <span>Sono il genitore, o chi ne fa le veci, degli atleti che inserirò <small class="muted">(obbligatorio)</small></span></label>
          <div class="full label" style="margin-top:4px">Facoltativi</div>
          <label class="full check switch"><input type="checkbox" name="news" ${hasConsent("news") ? "checked" : ""}> <span>Ricevere via email novità e consigli d'uso di geniGO</span></label>
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
      <h3>1. Cos'è geniGO</h3>
      <p>geniGO è uno strumento online che aiuta i genitori e le società sportive a coordinare i passaggi in auto verso trasferte, partite e allenamenti. geniGO <b>mette in contatto le famiglie ma non organizza, non effettua e non intermedia trasporti</b>: non è un vettore, un'agenzia né un servizio di noleggio con conducente.</p>
      <h3>2. Passaggi di cortesia, gratuiti</h3>
      <p>I passaggi pubblicati sono accordi liberi e <b>gratuiti</b> tra privati (trasporto di cortesia). geniGO non gestisce pagamenti e vieta di chiedere o offrire compensi per i passaggi. Ogni eventuale accordo diverso riguarda solo le persone coinvolte.</p>
      <h3>3. Chi guida</h3>
      <p>Chi offre un passaggio dichiara, e garantisce per tutta la durata del viaggio, di:</p>
      <ul><li>avere una patente valida e non sospesa, ed essere in condizioni idonee alla guida;</li>
        <li>usare un veicolo con assicurazione RC auto in corso di validità e revisione regolare;</li>
        <li>rispettare il codice della strada, usare cinture di sicurezza e, dove previsto, sistemi di ritenuta adeguati all'età degli atleti;</li>
        <li>non trasportare più persone dei posti omologati del veicolo.</li></ul>
      <p><b>Chi guida è l'unico responsabile del viaggio</b> e del rispetto di questi obblighi. La dichiarazione viene richiesta all'interno dell'app e rinnovata a ogni stagione sportiva.</p>
      <h3>4. Genitori e accompagnatori</h3>
      <p>Il genitore, o chi esercita la responsabilità genitoriale, decide liberamente se affidare il proprio atleta a un altro conducente e se accettare un passaggio. È sua cura verificare che le condizioni del viaggio siano adeguate.</p>
      <h3>5. Società sportive e mezzi della società</h3>
      <p>La società che usa geniGO resta responsabile dei propri mezzi, dei propri autisti e delle proprie coperture assicurative. geniGO non sostituisce le polizze della società né quelle dei singoli conducenti.</p>
      <h3>6. Limitazione di responsabilità</h3>
      <p>Nei limiti consentiti dalla legge, il gestore di geniGO non risponde di sinistri, danni a persone o cose, ritardi, mancati passaggi o comportamenti degli utenti durante i viaggi, che restano regolati dai rapporti tra le persone coinvolte e dalle rispettive assicurazioni. Restano ferme le responsabilità che la legge non consente di escludere.</p>
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



  // ---------- onboarding (prima dell'accesso): schermate a tutta pagina ----------
  // pendente in memoria del telefono: squadre dell'invito e figli (it-pend), dati dell'account (it-acct)
  const pendGet = (k) => { try { return JSON.parse(store(k) || "null"); } catch (e) { return null; } };
  const pendSet = (k, o) => store(k, o ? JSON.stringify(o) : null);
  async function loadInvitePend(code) {
    code = String(code || "").toUpperCase().replace(/\s+/g, "");
    const all = await expandCodes([code]);
    const ts = await Promise.all(all.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) ? { code: c, name: r.data[0].team_name } : null, () => null)));
    const teams = ts.filter(Boolean);
    if (!teams.length) return false;
    const old = pendGet("it-pend");
    pendSet("it-pend", { code, teams, kids: old && old.code === code ? old.kids : [] });
    return true;
  }
  const onbBack = (act) => `<div class="onb-top"><button type="button" class="onb-back" data-act="${act}" aria-label="Indietro"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><img src="logo.svg?v=gg1" alt="geniGO" class="onb-top-logo"></div>`;
  const onbLegal = `<p class="onb-legal">Continuando accetti i <a href="#/termini" target="_blank">Termini</a> e l'<a href="#/privacy" target="_blank">Informativa privacy</a></p>`;
  const onbTeams = (p) => `<div class="onb-chips">${(p.teams || []).map((t) => `<span class="onb-chip">${esc(t.name)}</span>`).join("")}</div>`;
  const onbKid = (i, k, teams) => `<div class="onb-group onb-kid" data-i="${i}">
      <label class="onb-line"><span>Nome</span><input name="kf${i}" maxlength="40" autocomplete="off" value="${esc(k.first || "")}" placeholder="Nome"></label>
      <label class="onb-line"><span>Cognome</span><input name="kl${i}" maxlength="40" autocomplete="off" value="${esc(k.last || "")}" placeholder="Cognome"></label>
      ${teams.length > 1 ? `<div class="onb-line onb-plays"><span>Gioca in</span><div class="onb-pills">${teams.map((t) => `<label class="onb-pill"><input type="checkbox" name="kt${i}" value="${esc(t.code)}" ${!k.codes || k.codes.includes(t.code) ? "checked" : ""}><span>${esc(t.name)}</span></label>`).join("")}</div></div>` : ""}
      ${i > 0 ? `<button type="button" class="btn-link onb-kid-del" data-act="onb-kid-del" data-i="${i}">Togli</button>` : ""}
    </div>`;
  const ONB = {
    kidinv: () => {
      const k = S.ui.kidInv || {};
      return `<section class="onb">
        <div class="onb-logo"><img src="logo.svg?v=gg1" alt="geniGO"></div>
        <div class="onb-mid onb-center">
          <p class="onb-sub onb-center" style="margin:0">${esc(k.inviter || "Un genitore")} ti ha invitato come genitore di</p>
          <h1 class="onb-h onb-center">${esc(k.kids || "")}</h1>
          ${k.teams ? `<div class="onb-chips">${String(k.teams).split(", ").map((t) => `<span class="onb-chip">${esc(t)}</span>`).join("")}</div>` : ""}
          <p class="onb-note onb-center">Vedrai le stesse trasferte e prenotazioni di ${esc(firstName(k.inviter) || "chi ti ha invitato")}, senza scrivere nomi.</p>
        </div>
        <div class="onb-foot">
          <button class="onb-btn" data-act="onb-signup">Crea il tuo account</button>
          <p class="onb-small">Hai già un account? <button class="btn-link" data-act="landing-login">Accedi</button></p>
          ${onbLegal}
        </div>
      </section>`;
    },
    kidbad: () => {
      const k = S.ui.kidInv;
      return `<section class="onb">
        <div class="onb-logo"><img src="logo.svg?v=gg1" alt="geniGO"></div>
        <div class="onb-mid onb-center">
          <div class="onb-bad" aria-hidden="true">⏳</div>
          <h1 class="onb-h onb-center">${k ? "Invito non più valido" : "Invito non trovato"}</h1>
          <p class="onb-sub onb-center">${k ? `Questo link è già stato usato oppure è scaduto (vale 14 giorni e una volta sola). Chiedi a ${esc(firstName(k.inviter) || "chi te l'ha mandato")} di mandartene uno nuovo da Profilo › I miei atleti.` : "Il link non è corretto. Chiedi all'altro genitore di mandartene uno nuovo."}</p>
        </div>
        <div class="onb-foot">
          <p class="onb-small">Hai già un account? <button class="btn-link" data-act="landing-login">Accedi</button></p>
          <button class="onb-btn onb-btn-light" data-act="landing-back">Torna all'inizio</button>
        </div>
      </section>`;
    },
    login: () => `<form class="onb" data-form="onb-login">
        ${onbBack("onb-login-back")}
        <h1 class="onb-h">Accedi</h1>
        <p class="onb-sub">Scrivi la tua email: ti mandiamo un codice per entrare. Nessuna password da ricordare.</p>
        <label class="onb-group"><input type="email" name="email" required autocomplete="email" placeholder="La tua email" value="${esc(S.ui.lastEmail || "")}"></label>
        <button class="onb-btn onb-btn-top" type="submit">Mandami il codice</button>
        <p class="onb-small" style="margin-top:14px">Non hai un account? <button type="button" class="btn-link" data-act="landing-back">Inizia da qui</button></p>
        <p class="onb-small"><button type="button" class="btn-link" data-act="onb-loginpw">Hai impostato una password? Entra con la password</button></p>
      </form>`,
    loginpw: () => `<form class="onb" data-form="login-pw">
        ${onbBack("onb-login")}
        <h1 class="onb-h">Entra con la password</h1>
        <label class="onb-group"><input type="email" name="email" required autocomplete="email" placeholder="La tua email" value="${esc(S.ui.lastEmail || "")}"></label>
        <label class="onb-group pw-wrap"><input type="password" name="password" required maxlength="72" autocomplete="current-password" placeholder="Password"><button type="button" class="btn-link pw-eye" data-act="pw-show">Mostra</button></label>
        <button class="onb-btn onb-btn-top" type="submit">Entra</button>
        <p class="onb-small" style="margin-top:14px"><button type="button" class="btn-link" data-act="onb-login">Non la ricordi? Entra con un codice via email</button></p>
      </form>`,
    loading: () => `<section class="onb"><div class="onb-logo"><img src="logo.svg?v=gg1" alt="geniGO"></div><div class="onb-mid"><div class="boot">Controllo l'invito…</div></div></section>`,
    welcome: () => `<section class="onb">
        <div class="onb-logo"><img src="logo.svg?v=gg1" alt="geniGO"></div>
        <h1 class="onb-h onb-center">Chi sei?</h1>
        <div class="onb-cards">
          <button class="onb-card" data-act="landing-join"><span class="onb-card-ico" aria-hidden="true">🚗🙋</span><span><b>Sono un genitore</b><small>Ho ricevuto un invito o un codice dalla squadra</small></span><i aria-hidden="true">›</i></button>
          <button class="onb-card" data-act="landing-create"><span class="onb-card-ico" aria-hidden="true">🏀⚽🏐</span><span><b>Sono una società o un allenatore</b><small>Registro la squadra e invito i genitori</small></span><i aria-hidden="true">›</i></button>
          <button class="onb-card" data-act="landing-login"><span class="onb-card-ico" aria-hidden="true">🔑</span><span><b>Accedi</b><small>Ho già un account geniGO</small></span><i aria-hidden="true">›</i></button>
        </div>
        <div class="onb-foot">${onbLegal}</div>
      </section>`,
    code: () => `<form class="onb" data-form="landing-code">
        ${onbBack("landing-back")}
        <h1 class="onb-h">Entra nella squadra</h1>
        <p class="onb-sub">Scrivi il codice che hai ricevuto dall'allenatore o da un altro genitore.</p>
        <label class="onb-group onb-big"><span>Codice d'invito</span><input name="code" required maxlength="40" autocapitalize="characters" autocomplete="off" placeholder="OLI-7K4M2"></label>
        <p class="onb-note">Hai ricevuto il link su WhatsApp? Aprilo: il codice è già dentro.</p>
        <div class="onb-foot"><button class="onb-btn" type="submit">Avanti</button></div>
      </form>`,
    kids: () => {
      const p = pendGet("it-pend") || { teams: [], kids: [] };
      const kids = p.kids && p.kids.length ? p.kids : [{ first: "", last: "" }];
      return `<form class="onb" data-form="onb-kids">
        ${onbBack("onb-to-code")}
        <h1 class="onb-h">Ti hanno invitato in</h1>
        ${onbTeams(p)}
        <div class="onb-label">I tuoi atleti</div>
        <div class="onb-kids">${kids.map((k, i) => onbKid(i, k, p.teams)).join("")}</div>
        <button type="button" class="onb-add" data-act="onb-kid-add">+ Aggiungi un altro atleta</button>
        <p class="onb-note">Se l'altro genitore si registra con lo stesso nome e cognome dell'atleta, vi colleghiamo e vedete le stesse prenotazioni.</p>
        <div class="onb-foot"><button class="onb-btn" type="submit">Avanti</button></div>
      </form>`;
    },
    almost: () => {
      const p = pendGet("it-pend") || { teams: [] };
      return `<section class="onb">
        ${onbBack("onb-to-kids")}
        <div class="onb-mid onb-center">
          ${onbTeams(p)}
          <img src="icon.svg" alt="" width="132" height="132" class="onb-hero-icon">
          <h1 class="onb-h onb-center">Ottimo!<br>Hai quasi finito…</h1>
          <p class="onb-sub onb-center">Ti manca solo il tuo account personale. Ci vuole un minuto.</p>
        </div>
        <div class="onb-foot">
          <button class="onb-btn onb-btn-light" data-act="onb-signup">Crea il tuo account</button>
          <p class="onb-small">Hai già un account? <button class="btn-link" data-act="landing-login">Accedi</button></p>
        </div>
      </section>`;
    },
    signup: () => {
      const a = pendGet("it-acct") || {}, nx = store("it-next") || "", club = nx === "#/new", kid = nx.startsWith("#/genitore/");
      return `<form class="onb" data-form="onb-signup">
        ${onbBack(club ? "landing-back" : kid ? "onb-to-kidinv" : "onb-to-almost")}
        <h1 class="onb-h">Crea account</h1>
        <p class="onb-sub">${club ? "Poi registri la tua squadra e inviti i genitori." : "Così gli altri genitori della squadra ti riconoscono."}</p>
        <div class="onb-row"><label class="onb-group"><input name="first" required maxlength="40" autocomplete="given-name" placeholder="Nome" value="${esc(a.first || "")}"></label>
          <label class="onb-group"><input name="last" required maxlength="40" autocomplete="family-name" placeholder="Cognome" value="${esc(a.last || "")}"></label></div>
        <label class="onb-group"><input type="email" name="email" required autocomplete="email" placeholder="La tua email" value="${esc(a.email || S.ui.lastEmail || "")}"></label>
        <p class="onb-note" style="margin-top:-4px">Ti mandiamo un codice a questa email per confermarla: niente password da ricordare.</p>
        <label class="onb-check"><input type="checkbox" name="terms" required ${a.terms ? "checked" : ""}><span>Accetto i <a href="#/termini" target="_blank">Termini d'uso</a> e l'<a href="#/privacy" target="_blank">Informativa privacy</a></span></label>
        <label class="onb-check"><input type="checkbox" name="parent" required ${a.parent ? "checked" : ""}><span>Sono il genitore, o chi ne fa le veci, degli atleti che inserisco</span></label>
        <label class="onb-switch"><input type="checkbox" name="news" ${a.news ? "checked" : ""}><span>Novità e consigli d'uso via email</span></label>
        <label class="onb-switch"><input type="checkbox" name="stats" ${a.stats ? "checked" : ""}><span>Statistiche d'uso anonime</span></label>
        <div class="onb-foot"><button class="onb-btn" type="submit">Avanti</button>
          <p class="onb-small">Hai già un account? <button type="button" class="btn-link" data-act="landing-login">Accedi</button></p></div>
      </form>`;
    },
    verify: () => {
      const a = S.ui.verifyEmail ? { email: S.ui.verifyEmail } : (pendGet("it-acct") || {});
      return `<form class="onb" data-form="onb-verify">
        ${onbBack(S.ui.verifyEmail ? "onb-login" : "onb-signup")}
        <div class="onb-center onb-verify">
          <p>Il codice di verifica è stato inviato a</p>
          <p class="onb-mail">${esc(a.email || "")}</p>
          <input class="onb-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required placeholder="______" aria-label="Codice di verifica">
        </div>
        <div class="onb-foot"><button class="onb-btn" type="submit">Avanti</button>
          <p class="onb-small">Potrebbe servire qualche minuto. Controlla anche la posta indesiderata, oppure <button type="button" class="btn-link" data-act="onb-resend">mandalo di nuovo</button>.</p></div>
      </form>`;
    },
  };
  function onbAfter(step) {
    const f = document.querySelector(".onb input:not([type=checkbox])"); if (f && step !== "kids") setTimeout(() => f.focus(), 50);
  }
  // figli scritti nella schermata (per non perderli quando se ne aggiunge o toglie uno)
  function onbReadKids(form) {
    const p = pendGet("it-pend") || { teams: [] }, out = [];
    form.querySelectorAll(".onb-kid").forEach((el) => {
      const i = el.dataset.i, g = (n) => (form.elements[n + i] ? String(form.elements[n + i].value || "").trim() : "");
      const codes = p.teams.length > 1 ? [...form.querySelectorAll(`input[name="kt${i}"]:checked`)].map((x) => x.value) : p.teams.map((t) => t.code);
      out.push({ first: g("kf"), last: g("kl"), codes });
    });
    return out;
  }
  // dopo la registrazione: nome, consensi e figli scritti prima dell'accesso
  async function applyPending() {
    const a = pendGet("it-acct");
    if (a && S.user && String(a.email || "").toLowerCase() === String(S.user.email || "").toLowerCase()) {
      const upd = { first_name: a.first, last_name: a.last, display_name: fullName(a.first, a.last) };
      try { const { error } = await sb.from("profiles").update(upd).eq("id", S.user.id); if (!error) Object.assign(S.profile, upd); } catch (e) { /* lo chiederà la schermata del nome */ }
      try { if (S.consents) { await saveConsent("terms", true); await saveConsent("parent", true); await saveConsent("news", !!a.news); await saveConsent("stats", !!a.stats); } } catch (e) { /* li chiederà la finestra dei consensi */ }
    }
    if (a) pendSet("it-acct", null);
  }
  async function joinPending() {
    const p = pendGet("it-pend"); pendSet("it-pend", null);
    if (!p || !p.kids || !p.kids.length) return false;
    const names = Object.fromEntries(p.teams.map((t) => [t.code, t.name]));
    const entries = p.kids.filter((k) => k.first && k.last && k.codes && k.codes.length).map((k) => ({ first: k.first, last: k.last, codes: k.codes }));
    if (!entries.length) return false;
    await doJoin(entries, p.teams.map((t) => t.code), names, p.teams.length > 1);
    return true;
  }

  // ---------- primo contatto: benvenuto, codice squadra, accesso ----------
  // S.ui.landing: "welcome" (default) · "code" (scrivi il codice) · "email" (accesso)
  function viewLogin(nextHash) {
    if (nextHash) store("it-next", nextHash);
    const next = store("it-next") || "";
    const kidInv = next.startsWith("#/genitore/");
    const invite = next.startsWith("#/join/") || kidInv;
    // invito a una squadra aperto senza essere entrati: prima i figli, poi l'account
    if (next.startsWith("#/join/") && !S.ui.landing && !S.ui.loginEmail) {
      store("it-next", null); S.ui.landing = "loading";
      loadInvitePend(decodeURIComponent(next.slice(7))).then((ok) => { S.ui.landing = ok ? "kids" : "code"; if (!ok) toast(ERRORS.invalid_code); viewLogin(); });
    }
    // invito come secondo genitore: si controlla subito se è ancora valido
    if (kidInv && !S.ui.landing && !S.ui.loginEmail) {
      S.ui.landing = "loading";
      sb.rpc("preview_kid_invite", { p_token: decodeURIComponent(next.slice(11)) }).then((r) => {
        const k = r.data && r.data[0]; S.ui.kidInv = k || null;
        S.ui.landing = k && k.valid ? "kidinv" : "kidbad"; viewLogin();
      }, () => { S.ui.kidInv = null; S.ui.landing = "kidbad"; viewLogin(); });
    }
    const step = S.ui.loginEmail ? "otp" : next === "#/new" && !S.ui.landing ? "signup" : (S.ui.landing || (store("it-splash") ? "welcome" : "splash"));
    if (ONB[step]) { document.body.classList.add("dark"); $app.innerHTML = ONB[step](); onbAfter(step); return; }
    if (step === "splash") {
      // prima schermata (solo la prima volta): logo, messaggio, tre punti, «Inizia»
      document.body.classList.add("dark");
      $app.innerHTML = `<section class="splash">
          <div class="splash-logo"><img src="icon.svg" alt="" width="96" height="96"><img src="logo.svg?v=gg1" alt="geniGO" class="wordmark"></div>
          <p class="splash-tag">Le trasferte della squadra,<br>organizzate in un minuto.</p>
          <div class="splash-list">
            <div><span aria-hidden="true">🚗</span><b>Chi guida offre i posti</b></div>
            <div><span aria-hidden="true">🙋</span><b>Chi non ha passaggio lo chiede</b></div>
            <div><span aria-hidden="true">🌱</span><b>Risparmi km, euro e CO₂</b></div>
          </div>
          <div class="splash-foot">
            <button class="btn-primary btn-block splash-go" data-act="splash-go">Inizia</button>
            <p class="small">Hai già un account? <button class="btn-link" data-act="landing-login">Accedi</button></p>
            <p class="small muted"><a href="#/termini">Termini d'uso</a> · <a href="#/privacy">Informativa privacy</a></p>
          </div>
        </section>`;
      return;
    }
    const hero = (big) => `<div class="hero"><div class="in">
        <h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg?v=gg1" alt="geniGO" class="wordmark"></h1>
        <p style="font-size:1.2rem;margin:0">Le trasferte della squadra, organizzate in un minuto.</p>
      </div></div>`;
    const privacy = `<p class="small muted" style="text-align:center"><a href="#/termini">Termini d'uso</a> · <a href="#/privacy">Informativa privacy</a> · Nessuna pubblicità profilata, nessun dato ceduto a terzi.</p>`;
    let body = "";
    if (false) {
    } else if (step === "login") {
      body = `<form class="card form" data-form="login-pw">
          <h2 class="full">Accedi</h2>
          <label class="full">Email<input type="email" name="email" required autocomplete="email" placeholder="nome@esempio.it" value="${esc(S.ui.lastEmail || "")}"></label>
          ${pwField("password", "Password", "current-password")}
          <div class="actions"><button class="btn-primary btn-block" type="submit">Entra</button></div>
          <div class="full notice" style="margin:0"><b>Non hai ancora una password o non la ricordi?</b>
            <div class="small">Ti mandiamo un codice alla tua email: lo inserisci e scegli la password.</div>
            <div style="margin-top:8px"><button type="button" class="btn-primary" data-act="pw-send-code">Mandami un codice</button></div></div>
        </form>
        <p style="text-align:center;margin:0"><button class="btn-link" data-act="landing-back">← Indietro</button></p>`;
    } else if (step === "email") {
      // codice via email: registrazione, accesso alternativo, password dimenticata
      const purpose = S.ui.otpPurpose || "";
      const title = purpose === "reset" ? "Reimposta la password" : purpose === "login" ? "Accedi con un codice" : next === "#/new" ? "Registra la tua squadra" : invite ? "" : "Crea il tuo account";
      const help = purpose === "reset" ? "Ti mandiamo un codice di 6 cifre: lo inserisci e scegli una nuova password."
        : purpose === "login" ? "Ti mandiamo un codice di 6 cifre per entrare senza password."
        : "Ti mandiamo un codice di 6 cifre per verificare che l'email sia tua. Subito dopo scegli la password.";
      body = `${invite ? `<div class="intro"><div class="label">${kidInv ? "Sei stato invitato come genitore" : "Sei stato invitato in"}</div><h2 id="inv-name">${esc(S.ui.inviteName || "…")}</h2><div class="small muted">Inserisci la tua email per entrare nella squadra.</div></div>` : ""}
        <form class="card form" data-form="login-email">
          ${title ? `<h2 class="full">${title}</h2>` : ""}
          <label class="full">La tua email<input type="email" name="email" required autocomplete="email" placeholder="nome@esempio.it" value="${esc(S.ui.lastEmail || "")}"></label>
          <div class="actions"><button class="btn-primary btn-block" type="submit">${purpose === "reset" ? "Mandami il codice" : purpose === "login" ? "Mandami il codice" : "Ricevi il codice di verifica"}</button></div>
          <p class="full small muted" style="margin:0">${help}</p>
          ${purpose ? "" : `<p class="full small" style="margin:0">Hai già un account? <button type="button" class="btn-link" data-act="landing-login">Accedi con la password</button></p>`}
        </form>
        <p style="text-align:center;margin:0"><button class="btn-link" data-act="landing-back">← Indietro</button></p>`;
    } else {
      body = `<form class="card form" data-form="login-code">
          <p class="full" style="margin:0">Abbiamo scritto a <b>${esc(S.ui.loginEmail)}</b>. Inserisci il codice ricevuto, oppure apri il link nella mail da questo stesso telefono.</p>
          <label class="full">Codice<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required placeholder="123456"></label>
          <div class="actions"><button class="btn-primary" type="submit">${S.ui.otpPurpose === "reset" ? "Continua" : "Verifica"}</button><button class="btn-ghost" type="button" data-act="login-restart">Cambia email</button></div>
          <p class="full small muted" style="margin:0">Non è arrivato? Controlla nella posta indesiderata, oppure <button type="button" class="btn-link" data-act="login-restart">riprova</button>.</p>
        </form>`;
    }
    document.body.classList.add("dark");
    $app.innerHTML = hero(step === "welcome") + `<div class="wrap narrow">${body}${privacy}</div>`;
    // nome della squadra dell'invito, visibile anche prima di accedere
    if (step === "email" && kidInv && !S.ui.inviteName) {
      sb.rpc("preview_kid_invite", { p_token: decodeURIComponent(next.slice(11)) }).then((r) => {
        const k = r.data && r.data[0];
        S.ui.inviteName = k ? `di ${k.kids}${k.teams ? " · " + k.teams : ""}` : "del tuo atleta";
        const el = document.getElementById("inv-name"); if (el) el.textContent = S.ui.inviteName;
      }, () => {});
    } else if (step === "email" && invite && !S.ui.inviteName) {
      const codes0 = decodeURIComponent(next.slice(7)).split(",").filter(Boolean);
      expandCodes(codes0).then((codes) => Promise.all(codes.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) || null, () => null))).then((ts) => {
        const names = ts.filter(Boolean).map((t) => t.team_name);
        S.ui.inviteName = names.length ? names.join(" e ") : "una squadra";
        const el = document.getElementById("inv-name"); if (el) el.textContent = S.ui.inviteName;
      }));
    }
  }

  // ---------- password ----------
  const pwField = (name, label, ac, hint) => `<label class="full">${label}<span class="pw-wrap"><input type="password" name="${name}" required ${ac === "current-password" ? "" : 'minlength="8"'} maxlength="72" autocomplete="${ac || "new-password"}"><button type="button" class="btn-link pw-eye" data-act="pw-show">Mostra</button></span>${hint ? `<span class="small muted" style="font-weight:400">${hint}</span>` : ""}</label>`;
  const pwRules = () => `<div class="full small pw-rules"><span data-r="len">○ almeno 8 caratteri</span> <span data-r="mix">○ lettere e numeri</span> <span data-r="eq">○ le due password coincidono</span></div>`;
  const pwOk = (a) => a.length >= 8 && /[A-Za-zÀ-ÿ]/.test(a) && /\d/.test(a);
  const pwSet = () => !!(S.user && S.user.user_metadata && S.user.user_metadata.pw_set);
  // primo accesso, utenti già registrati (una volta sola) e password dimenticata
  function viewSetPassword() {
    const reset = store("it-forcepw") === "1";
    document.body.classList.add("dark");
    $app.innerHTML = `<div class="hero"><div class="in"><h1 class="hero-logo"><img src="icon.svg" alt="" width="64" height="64"><img src="logo.svg?v=gg1" alt="geniGO" class="wordmark"></h1></div></div>
      <div class="wrap narrow"><form class="card form" data-form="set-pw">
        <h2 class="full">${reset ? "Scegli la nuova password" : "Scegli la tua password"}</h2>
        <p class="full muted" style="margin:0">${reset ? "Da ora entrerai" : "La userai per entrare in geniGO"} con <b>${esc(S.user.email || "")}</b>.</p>
        ${pwField("pw1", reset ? "Nuova password" : "Password", "new-password", "Almeno 8 caratteri, con lettere e numeri.")}
        ${pwField("pw2", "Ripeti la password")}
        ${pwRules()}
        ${S.ui.pwNonce ? `<label class="full">Codice ricevuto via email<input name="nonce" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456"><span class="small muted" style="font-weight:400">Per sicurezza ti abbiamo mandato un codice a ${esc(S.user.email || "")}.</span></label>` : ""}
        <div class="actions"><button class="btn-primary btn-block" type="submit">Salva e continua</button></div>
      </form></div>`;
  }
  function securityCard() {
    return `<form class="card form" data-form="change-pw" id="sicurezza">
      <div class="full label">Accesso</div>
      <div class="full small">Entri con <b>${esc(S.user.email || "")}</b> e un codice che ti mandiamo via email: non serve una password. Su questo telefono resti collegato finché non esci.</div>
      <div class="full small muted">Facoltativo: se preferisci, puoi impostare una password e usarla al posto del codice.</div>
      ${pwField("pw1", pwSet() ? "Nuova password" : "Password (facoltativa)")}
      ${pwField("pw2", "Ripeti la nuova password")}
      ${pwRules()}
      ${S.ui.pwNonce ? `<label class="full">Codice ricevuto via email<input name="nonce" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456"><span class="small muted" style="font-weight:400">Per sicurezza ti abbiamo mandato un codice a ${esc(S.user.email || "")}: inseriscilo per confermare.</span></label>`
        : `<p class="full small muted" style="margin:0">Se non entri da un po', per sicurezza ti mandiamo un codice via email prima di cambiarla.</p>`}
      <div class="actions"><button class="btn-ghost" type="submit">${pwSet() ? "Cambia password" : "Imposta password"}</button></div>
    </form>`;
  }
  // imposta la password; se Supabase chiede una verifica, manda il codice e la chiede
  async function savePassword(fd) {
    const a = String(fd.get("pw1") || ""), b = String(fd.get("pw2") || "");
    if (!pwOk(a)) throw new Error("pw_weak");
    if (a !== b) throw new Error("pw_mismatch");
    const upd = { password: a, data: { pw_set: true } };
    if (fd.get("nonce")) upd.nonce = String(fd.get("nonce")).trim();
    const { data, error } = await sb.auth.updateUser(upd);
    if (error) {
      if (/reauthenticat/i.test(error.message || "") || error.code === "reauthentication_needed") {
        const r = await sb.auth.reauthenticate(); if (r.error) throw r.error;
        S.ui.pwNonce = true; return "nonce";
      }
      throw error;
    }
    S.ui.pwNonce = false; if (data && data.user) S.user = data.user;
    return "ok";
  }

  function viewName() {
    $app.innerHTML = topBar({ title: "Come ti chiami?" }) + `<div class="wrap narrow">
      <form class="card form" data-form="profile-name">
        <label>Nome<input name="first" required maxlength="40" autocomplete="given-name" value="${esc(S.profile?.first_name || "")}"></label>
        <label>Cognome<input name="last" required maxlength="40" autocomplete="family-name" value="${esc(S.profile?.last_name || "")}"></label>
        <p class="full small muted" style="margin:0">Così ti vedranno gli altri genitori della squadra.</p>
        <label class="full">Il tuo cellulare (per gli avvisi WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile?.phone || "")}"></label>
        <p class="full small muted" style="margin:0">Il numero lo vedono solo i genitori delle tue squadre: serve per avvisare con un tocco chi guida o chi ha prenotato.</p>
        <div class="actions"><button class="btn-primary" type="submit">Continua</button></div>
      </form></div>`;
  }

  // una volta sola per chi era già registrato: cognome proprio e dei figli
  function viewFillSurnames() {
    const groups = {};
    (S.myKids || []).filter((k) => !k.last_name).forEach((k) => { const g = normN(k.first_name); (groups[g] = groups[g] || { first: k.first_name, ids: [] }).ids.push(k.id); });
    const me = !S.profile.last_name;
    $app.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="fill-title">
      <div class="modal-brand"><img src="icon.svg" alt="" width="44" height="44"><img src="logo-dark.svg?v=gg1" alt="geniGO" class="modal-wordmark"></div>
      <h2 id="fill-title">Completa i cognomi</h2>
      <p style="margin:0">Ora nome e cognome sono separati: così si distinguono gli atleti con lo stesso nome e mamma e papà vedono le stesse prenotazioni.</p>
      <form class="form" data-form="fill-names">
        ${me ? `<label>Il tuo nome<input name="first" required maxlength="40" value="${esc(S.profile.first_name || firstName(S.profile.display_name))}"></label><label>Il tuo cognome<input name="last" required maxlength="40" autocomplete="family-name"></label>` : ""}
        ${Object.entries(groups).map(([g, k]) => `<label>Atleta<input name="kidf-${esc(k.ids.join(","))}" required maxlength="40" value="${esc(k.first)}"></label><label>Cognome<input name="kidl-${esc(k.ids.join(","))}" required maxlength="40" value="${esc(S.profile.last_name || "")}"></label>`).join("")}
        <div class="actions"><button class="btn-primary btn-block" type="submit">Salva</button></div>
      </form></div></div>`;
  }

  const logEvent = (kind, team, qty) => { if (!hasConsent("stats")) return; try { sb.rpc("log_event", { p_kind: kind, p_team: team || null, p_qty: qty || 0 }).then(() => {}, () => {}); } catch (e) { /* facoltativo */ } };
  function logOpenOncePerDay() { const d = new Date().toISOString().slice(0, 10); if (store("cp-open") !== d) { store("cp-open", d); logEvent("app_open"); } }

  // ---------- router ----------
  async function route() {
    document.body.classList.remove("dark", "has-bnav", "sheet-open"); // sfondo scuro solo per le pagine di benvenuto e accesso
    const hash = location.hash || "#/";
    const p0 = hash.slice(2).split("/")[0];
    if (p0 === "termini" || p0 === "privacy") return viewLegal(p0);
    // senza accesso si ricorda solo un link d'invito; qualsiasi altra pagina riparte dalle Trasferte
    if (!S.session) return viewLogin(/^#\/(join|genitore)\/|^#\/new$/.test(hash) ? hash : null);
    try { await ensureProfile(); } catch (e) {
      if (!S.session) { toast("Accedi di nuovo"); return viewLogin(); }
      toast(errMsg(e));
    }
    if (pendGet("it-acct")) await applyPending();
    if (store("it-forcepw") === "1") return viewSetPassword(); // solo dopo «password dimenticata» da chi la usa
    if (!consentsOk()) return viewConsents();
    if (!S.profile?.display_name) return viewName();
    if (S.myKids && (!S.profile.last_name || S.myKids.some((k) => !k.last_name))) return viewFillSurnames();
    logOpenOncePerDay();
    if (pendGet("it-pend") && (pendGet("it-pend").kids || []).length) { const h0 = location.hash; try { if (await joinPending() && location.hash !== h0) return; } catch (e) { toast(errMsg(e)); } }
    const next = store("it-next");
    if (next) { store("it-next", null); if (next !== hash) { location.hash = next; return; } }

    const parts = hash.slice(2).split("/");
    if (parts[0] === "join" && parts[1]) return viewJoin(decodeURIComponent(parts[1]));
    if (parts[0] === "new") return viewNewTeam();
    if (parts[0] === "squadre") { location.replace("#/"); return; }
    if (parts[0] === "genitore" && parts[1]) return viewKidInvite(decodeURIComponent(parts[1]));
    if (parts[0] === "profilo") return viewProfile(true);
    if (parts[0] === "admin") return viewAdmin();
    if (parts[0] === "t" && parts[1]) return viewTeam(parts[1], parts[2] || "trasferte");
    // ultima squadra aperta su questo telefono: si va diretti lì (un giro di attesa in meno)
    const lastT = store("it-last-team");
    if (lastT && !S.ui.homeOnce) return viewTeam(lastT, "trasferte", true);
    return viewHome();
  }

  function topBar({ title, sub, back, backLabel, tabs, active, teamId }) {
    return `<header class="top"><div class="in">
      ${back ? `<a class="iconbtn" href="${back}" aria-label="${esc(backLabel || "Indietro")}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></a>` : ""}
      <a class="brand" href="#/" aria-label="geniGO, home"><img src="icon.svg" alt="" width="38" height="38"><img src="logo.svg?v=gg1" alt="" class="wordmark"></a>
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
  // riga della versione, fissa in fondo a tutte le pagine (fuori dall'area che si ridisegna)
  { const ver = document.getElementById("ver"); if (ver) ver.textContent = "geniGO" + (APP_VERSION ? " · versione " + APP_VERSION : ""); }
  const footer = () => `<footer class="foot">geniGO beta · solo coordinamento tra famiglie, nessun pagamento · <a href="#/termini">Termini</a> · <a href="#/privacy">Privacy</a> · <a href="mailto:${esc(CFG.SUPPORT_EMAIL || "")}">segnala un problema</a></footer>`;

  // ---------- home: le mie squadre ----------
  async function viewHome(stay) {
    unsubscribe();
    $app.innerHTML = topBar({}) + `<div class="wrap"><div class="boot">Carico le tue squadre…</div></div>`;
    const uid = S.user.id;
    const { data: mems, error } = await sb.from("team_members").select("team_id, role, status, athletes").eq("user_id", uid);
    if (error) return toast(errMsg(error));
    S.memberships = mems || [];
    const ids = S.memberships.filter((m) => m.status === "active").map((m) => m.team_id);
    if (ids.length) { const last = store("it-last-team"); location.replace("#/t/" + (ids.includes(last) ? last : ids[0]) + "/trasferte"); return; }
    // solo richieste in attesa: si spiega cosa succede, senza proporre altre strade
    const waiting = S.memberships.filter((m) => m.status === "pending");
    if (waiting.length && !S.ui.codeOpen) {
      let names = [];
      try { names = ((await sb.from("teams").select("id,name").in("id", waiting.map((m) => m.team_id))).data || []).map((t) => t.name); } catch (e) { /* nomi non visibili prima dell'approvazione */ }
      const kids = (S.myKids || []).map((k) => k.first_name).filter(Boolean);
      $app.innerHTML = topBar({ title: "Quasi dentro!" }) + `<div class="wrap narrow">
        <div class="card wait-card">
          <div class="wait-ico" aria-hidden="true">⏳</div>
          <h2>Richiesta inviata${names.length ? " a " + esc(names.join(" e ")) : ""}</h2>
          <p>L'amministratore della squadra deve approvarla. Appena lo fa entri automaticamente e vedi le trasferte${kids.length ? " di " + esc(kids.length > 1 ? kids.slice(0, -1).join(", ") + " e " + kids[kids.length - 1] : kids[0]) : ""}: puoi chiudere l'app e riaprirla più tardi.</p>
          <button class="btn-primary btn-block" data-act="wait-refresh">Controlla di nuovo</button>
          <p class="small muted" style="margin:0">Ci mette troppo? Scrivi all'allenatore o a chi ti ha mandato il codice.</p>
        </div>
        <p class="small" style="text-align:center"><button class="btn-link" data-act="code-open">Ho un codice per un'altra squadra</button></p>
      </div>` + footer();
      clearInterval(S.waitPoll);
      S.waitPoll = setInterval(async () => {
        if ((location.hash || "#/") !== "#/" || !document.querySelector(".wait-card")) return clearInterval(S.waitPoll);
        const { data } = await sb.from("team_members").select("team_id,status").eq("user_id", uid);
        if ((data || []).some((m) => m.status === "active")) { clearInterval(S.waitPoll); toast("Richiesta approvata: benvenuto in squadra!"); viewHome(); }
      }, 20000);
      return;
    }
    let teams = [], events = [], rides = [], bookings = [];
    if (ids.length) {
      teams = (await sb.from("teams").select("*").in("id", ids)).data || [];
      const now = new Date().toISOString();
      events = (await sb.from("events").select("id,team_id,title,starts_at").in("team_id", ids).gte("starts_at", now).order("starts_at")).data || [];
      const evIds = events.map((e) => e.id);
      if (evIds.length) {
        rides = (await sb.from("rides").select("id,event_id,seats").in("event_id", evIds)).data || [];
        bookings = (await sb.from("bookings").select("*").in("event_id", evIds)).data || [];
      }
    }
    const pending = S.memberships.filter((m) => m.status === "pending");
    const cards = teams.map((t) => {
      const m = S.memberships.find((x) => x.team_id === t.id);
      const evs = events.filter((e) => e.team_id === t.id);
      const nextEv = evs[0];
      const noCar = evs.filter((e) => !rides.some((r) => r.event_id === e.id)).length;
      const free = rides.filter((r) => evs.some((e) => e.id === r.event_id)).reduce((a, r) => a + Math.max(0, r.seats - seatsOf(bookings.filter((b) => b.ride_id === r.id))), 0);
      return `<a class="card teamcard" href="#/t/${t.id}/trasferte">
        <div class="between"><div><h2>${esc(t.name)}</h2><div class="meta">${esc(sportOf(t).label)}${t.category ? " · " + esc(t.category) : ""} · ${esc(t.season)}</div></div>
        <span class="chip ${m.role === "admin" ? "navy" : ""}">${m.role === "admin" ? "Amministratore" : "Genitore"}</span></div>
        <div class="stats"><div><b>${evs.length}</b>trasferte</div><div><b>${free}</b>posti liberi</div><div class="${noCar ? "warn" : ""}"><b>${noCar}</b>senza auto</div></div>
        ${nextEv ? `<div class="small muted">Prossima: <b style="color:var(--ink)">${(() => { const p = dateParts(nextEv.starts_at); return `${p.dow} ${p.day} ${p.mon} · ${esc(nextEv.title)}`; })()}</b></div>` : ""}
      </a>`;
    }).join("");
    $app.innerHTML = topBar({ title: "Le mie squadre" }) + `<div class="wrap">
      ${pending.length ? `<div class="notice">Hai ${pending.length} richiest${pending.length === 1 ? "a" : "e"} in attesa di approvazione da parte dell'amministratore.</div>` : ""}
      ${cards || `<div class="intro"><h2>Benvenuto in geniGO</h2><div class="muted">Non sei ancora in nessuna squadra. Cosa vuoi fare?</div></div>`}
      ${!cards && !S.ui.codeOpen ? `<button class="choice" data-act="code-open"><b>Entra nella squadra del tuo atleta</b><span>Scrivi il codice che ti ha dato l'allenatore, oppure apri il link ricevuto</span></button>
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
    $app.innerHTML = topBar({ title: "Registra la squadra", back: S.memberships.length ? "#/profilo" : "" }) + `<div class="wrap">
      ${wizardSteps(1)}
      <form class="card form" data-form="new-team">
        <div class="full stack" style="gap:8px"><div class="label">Sport</div>
          <div class="pill-group" role="radiogroup" aria-label="Sport">${SPORT_ORDER.map((k) => `<button type="button" class="pill" role="radio" aria-checked="${k === sp}" data-act="pick-sport" data-v="${k}">${esc(SPORTS[k].label)}</button>`).join("")}</div></div>
        <label class="full">Nome squadra<input name="name" required minlength="2" maxlength="80" placeholder="Es. Urania Milano U17"></label>
        <label>Categoria<input name="category" maxlength="40" placeholder="Es. U17"></label>
        <label>Stagione<input name="season" maxlength="20" value="2026/27"></label>
        ${kidsBlock("Hai un atleta in questa squadra? (facoltativo)", false)}
        <div class="full intro"><div class="label">Così vedranno le pagine i genitori</div>
          <div class="small">Luogo: <b>${esc(L.place)}</b> · Orario: <b>${esc(L.time)}</b> · Evento: <b>${esc(L.event)}</b></div></div>
        <label class="full check declare"><input name="role-ok" type="checkbox" required> <span>Sono l'allenatore o un dirigente di questa squadra e accetto i <a href="#/termini" target="_blank">Termini</a> per le società: mezzi, autisti e coperture assicurative della società restano sotto la sua responsabilità.</span></label>
        <p class="full small muted" style="margin:0">Diventerai l'amministratore: aggiungi le trasferte e inviti i genitori. Se il tuo atleta è già in una squadra su geniGO, non crearne un'altra: chiedi il link all'allenatore.</p>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Crea la squadra e continua</button></div>
      </form></div>`;
  }

  // ---------- entrare con invito (una o più squadre) ----------
  // ogni figlio si scrive una volta; chi ha già figli su geniGO li spunta
  const joinTeamPills = (name, teams, checked) => `<div class="pill-group">${teams.map((t) => `<label class="pill check-pill"><input type="checkbox" name="${name}" value="${esc(t.code)}" ${checked ? "checked" : ""}> ${esc(t.name)}</label>`).join("")}</div>`;
  const newKidCard = (i, teams, last, checked) => `<div class="kid-card nk"><div class="kid-row"><label>Nome<input name="nf${i}" maxlength="40" autocomplete="off"></label><label>Cognome<input name="nl${i}" maxlength="40" autocomplete="off" value="${esc(last || "")}"></label></div>
      <div class="small muted">In quali di queste squadre gioca?</div>${joinTeamPills("nt" + i, teams, checked)}</div>`;
  async function viewJoin(code) {
    unsubscribe();
    let codes = [...new Set(String(code).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const bad = () => { $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="empty"><strong>Invito non valido</strong>${ERRORS.invalid_code}</div></div>`; };
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow"><div class="boot">Controllo l'invito…</div></div>`;
    logEvent("invite_open");
    codes = await expandCodes(codes);
    const prev = await Promise.all(codes.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) || null, () => null)));
    try { await loadKidsCtx(); } catch (e) { /* senza figli già inseriti */ }
    const already = new Set((S.myTeams || []).map((t) => String(t.invite_code || "").toUpperCase()));
    const rows = codes.map((c, i) => ({ code: c, t: prev[i], member: already.has(c) })).filter((r) => r.t);
    if (!rows.length) return bad();
    const open = rows.filter((r) => !r.member).map((r) => ({ code: r.code, name: r.t.team_name }));
    const multi = open.length > 1, one = rows.length === 1 ? rows[0].t : null;
    const groups = S.myKids ? kidGroups() : [];
    S.ui.joinGroups = groups.map((g) => ({ first: g.first, last: g.last }));
    S.ui.joinNames = Object.fromEntries(open.map((t) => [t.code, t.name]));
    const tname = (tid) => { const t = (S.myTeams || []).find((x) => x.id === tid); return t ? t.name : ""; };
    const head = one ? `<div class="intro"><div class="label">Ti hanno invitato in</div><h1>${esc(one.team_name)}</h1>
        <div class="meta">${esc((SPORTS[one.sport] || SPORTS.altro).label)}${one.category ? " · " + esc(one.category) : ""} · ${esc(one.season)}</div></div>`
      : `<div class="intro"><div class="label">Ti hanno invitato in ${rows.length} squadre</div><h2>${rows.map((r) => esc(r.t.team_name)).join(" · ")}</h2></div>`;
    const inAlready = rows.filter((r) => r.member).map((r) => `<span class="chip ok">${esc(r.t.team_name)}: ci sei già</span>`).join(" ");
    let body;
    if (!open.length) body = `<div class="card"><div>${inAlready}</div><a class="btn btn-primary btn-block" href="#/">Vai alle trasferte</a></div>`;
    else if (!multi) {
      const t = open[0];
      body = `<form class="card form" data-form="join-any" data-codes="${esc(t.code)}">
        ${inAlready ? `<div class="full">${inAlready}</div>` : ""}
        ${groups.length ? `<div class="full label">Chi gioca in ${esc(t.name)}?</div>
          <div class="full pill-group">${groups.map((g, i) => `<label class="pill check-pill"><input type="checkbox" name="ek" value="${i}"> ${esc(fullName(g.first, g.last))}</label>`).join("")}</div>` : ""}
        <div class="full kids"><div class="${groups.length ? "small muted" : "label"}">${groups.length ? "Un altro atleta?" : "I tuoi atleti in " + esc(t.name)}</div>${kidRow("", S.profile.last_name || "", !groups.length)}<div><button type="button" class="btn-link" data-act="kid-more">+ Aggiungi un altro atleta</button></div></div>
        <p class="full small muted" style="margin:0">Se anche l'altro genitore si registra, basta che scriva lo stesso nome e cognome: vi riconosciamo come genitori dello stesso atleta e vedete le stesse prenotazioni.</p>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Entra nella squadra</button></div>
      </form>`;
    } else {
      body = `<form class="card form" data-form="join-any" data-codes="${esc(open.map((t) => t.code).join(","))}">
        ${inAlready ? `<div class="full">${inAlready}</div>` : ""}
        <div class="full label">I tuoi atleti</div>
        ${groups.map((g, i) => `<div class="full kid-card"><div><b>${esc(fullName(g.first, g.last))}</b><div class="small muted">già su geniGO${g.recs.length ? " · " + esc(g.recs.map((r) => tname(r.team_id)).filter(Boolean).join(" · ")) : ""}</div></div>
          <div class="small muted">In quali di queste squadre gioca?</div>${joinTeamPills("ek-" + i, open, false)}</div>`).join("")}
        <div class="full kids-multi">${newKidCard(0, open, S.profile.last_name, !groups.length)}</div>
        <div class="full"><button type="button" class="btn-link" data-act="kid-more-multi">+ Aggiungi ${groups.length ? "un altro" : "un altro"} atleta</button></div>
        <div class="actions"><button class="btn-primary btn-block" type="submit">Entra nelle squadre</button></div>
        <p class="full small muted" style="margin:0">Entri nelle squadre in cui hai spuntato almeno un atleta. Gli altri membri vedranno il tuo nome e quello dei tuoi atleti.</p>
      </form>`;
    }
    $app.innerHTML = topBar({ title: "Invito", back: "#/" }) + `<div class="wrap narrow">${head}${body}</div>`;
  }

  // entra nelle squadre e collega i figli (da invito o dai dati scritti prima di registrarsi)
  async function doJoin(entries, codes, names, multi) {
    for (const e of entries) e.links = await resolveKidMulti(e, e.codes.map((c) => ({ key: c, code: c, name: names[c] || c })));
    const used = codes.filter((c) => entries.some((e) => e.codes.includes(c)));
    let ok = 0, wait = 0, last = null; const tid = {};
    for (const c of used) {
      const { data, error } = await sb.rpc("join_team", { p_code: c, p_athletes: "" });
      if (error) { toast(errMsg(error)); continue; }
      const r = data && data[0]; if (!r) continue;
      tid[c] = r.team_id; if (r.status === "pending") wait++; else { ok++; last = r.team_id; }
    }
    for (const e of entries) for (const c of e.codes) if (tid[c]) {
      const { data: na, error } = await sb.rpc("add_athlete", { p_team: tid[c], p_first: e.first, p_last: e.last, p_link: e.links[c] || null });
      if (error) toast(errMsg(error));
      else if (!e.links[c] && na && na.id && !e.existing) (S.newKidIds = S.newKidIds || []).push({ id: na.id, name: e.first });
    }
    await loadMyKids(); S.myTeams = null;
    if (last) store("it-last-team", last);
    offerParentInvite();
    if (!multi) { if (wait) { toast("Richiesta inviata: attendi l'approvazione"); location.hash = "#/"; } else if (last) { toast("Benvenuto in squadra!"); location.hash = "#/t/" + last + "/trasferte"; } return; }
    toast(ok && wait ? `Sei entrato in ${ok} ${ok === 1 ? "squadra" : "squadre"}; ${wait} in attesa di approvazione` : ok ? `Benvenuto! Sei entrato in ${ok} ${ok === 1 ? "squadra" : "squadre"}` : wait ? "Richiesta inviata: attendi l'approvazione" : "Nessuna squadra aggiunta");
    location.hash = "#/";
  }

  // ---------- profilo ----------
  // squadre e genitori dei miei figli, per la scheda "I miei atleti"
  async function loadKidsCtx() {
    await loadMyKids();
    const { data: mem } = await sb.from("team_members").select("team_id,status").eq("user_id", S.user.id);
    const ids = (mem || []).map((m) => m.team_id);
    const teams = ids.length ? (await sb.from("teams").select("id,name,category,invite_code").in("id", ids)).data || [] : [];
    S.myTeams = teams.sort((a, b) => a.name.localeCompare(b.name));
    const kidIds = (S.myKids || []).map((k) => k.id);
    const links = kidIds.length ? (await sb.from("athlete_parents").select("athlete_id,user_id").in("athlete_id", kidIds)).data || [] : [];
    const uids = [...new Set(links.map((l) => l.user_id))];
    const prof = uids.length ? (await sb.from("profiles").select("id,first_name,display_name").in("id", uids)).data || [] : [];
    S.kidParents = {};
    links.forEach((l) => { const p = prof.find((x) => x.id === l.user_id) || {}; (S.kidParents[l.athlete_id] = S.kidParents[l.athlete_id] || []).push(p.first_name || firstName(p.display_name) || "genitore"); });
  }
  // un figlio può essere in più squadre: si raggruppa per nome e cognome
  function kidGroups() {
    const g = {};
    (S.myKids || []).forEach((k) => { const key = normN(fullName(k.first_name, k.last_name)); (g[key] = g[key] || { key, first: k.first_name, last: k.last_name, recs: [] }).recs.push(k); });
    return Object.values(g).sort((a, b) => a.first.localeCompare(b.first));
  }
  function kidsCard() {
    if (S.myKids === null) return "";
    const groups = kidGroups(), ed = S.ui.kidEdit;
    const tname = (tid) => { const t = (S.myTeams || []).find((x) => x.id === tid); return t ? t.name : "squadra"; };
    const form = (gr) => `<form class="form" data-form="kid" data-key="${esc(gr ? gr.key : "")}" style="border-top:1px solid var(--line);padding-top:12px">
        <div class="full label">${gr ? "Modifica" : "Aggiungi atleta"}</div>
        <label>Nome<input name="first" required maxlength="40" value="${esc(gr ? gr.first : "")}"></label>
        <label>Cognome<input name="last" required maxlength="40" value="${esc(gr ? gr.last : S.profile.last_name || "")}"></label>
        <div class="full"><div class="label" style="margin-bottom:6px">In quali squadre gioca?</div>
          ${(S.myTeams || []).length ? `<div class="pill-group">${S.myTeams.map((t) => `<label class="pill check-pill"><input type="checkbox" name="team" value="${t.id}" ${gr ? (gr.recs.some((r) => r.team_id === t.id) ? "checked" : "") : S.myTeams.length === 1 ? "checked" : ""}> ${esc(t.name)}</label>`).join("")}</div>` : `<div class="small muted">Non sei ancora in nessuna squadra.</div>`}
          <p class="small muted" style="margin:6px 0 0">Per una squadra nuova usa il codice d'invito che ti ha dato l'allenatore o la società.${gr ? " Togli la spunta per toglierlo da una squadra." : ""}</p></div>
        <div class="actions"><button class="btn-primary" type="submit">Salva</button><button class="btn-ghost" type="button" data-act="kid-cancel">Annulla</button></div>
      </form>`;
    return `<div class="card" id="figli">
      <div class="between"><h3 style="margin:0">I miei atleti</h3>${ed ? "" : `<button class="btn-ghost" data-act="kid-new">+ Aggiungi atleta</button>`}</div>
      ${groups.length ? groups.map((gr) => `<div class="member"><div class="avatar">${esc(initials(fullName(gr.first, gr.last)))}</div>
          <div style="flex:1;min-width:0"><b>${esc(fullName(gr.first, gr.last))}</b>
            <div class="small muted">${esc(gr.recs.map((r) => tname(r.team_id)).join(" · "))}</div>
            <div class="small muted">Genitori: ${esc([...new Set(gr.recs.flatMap((r) => (S.kidParents || {})[r.id] || []))].join(", "))}</div></div>
          ${ed ? "" : `<div style="display:grid;justify-items:end;gap:4px"><button class="btn-link" data-act="kid-edit" data-id="${esc(gr.key)}">Modifica</button>${[...new Set(gr.recs.flatMap((r) => (S.kidParents || {})[r.id] || []))].length < 2 ? `<button class="btn-link" data-act="kid-invite" data-id="${esc(gr.key)}">Invita l'altro genitore</button>` : ""}</div>`}</div>
          ${ed === gr.key ? form(gr) : ""}`).join("") : `<div class="small muted">Nessun atleta indicato.</div>`}
      ${ed === "new" ? form(null) : ""}
    </div>`;
  }

  async function viewProfile(fresh) {
    unsubscribe();
    if (fresh || !S.myTeams) { try { await loadKidsCtx(); } catch (e) { /* mostra il resto del profilo */ } }
    const navTeam = S.team && S.team.id;
    $app.innerHTML = topBar({ title: "Profilo", back: navTeam ? "" : "#/" }) + `<div class="wrap narrow">
      <form class="card form" data-form="profile-name">
        <label>Nome<input name="first" required maxlength="40" autocomplete="given-name" value="${esc(S.profile.first_name || firstName(S.profile.display_name))}"></label>
        <label>Cognome<input name="last" ${S.myKids === null ? "" : "required"} maxlength="40" autocomplete="family-name" value="${esc(S.profile.last_name || "")}"></label>
        <label class="full">Cellulare (per WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="333 1234567" value="${esc(S.profile.phone || "")}"></label>
        <div class="full small muted">Il numero è visibile solo ai genitori delle tue squadre.</div>
        <div class="full small muted">Accesso con: ${esc(S.user.email || "")}</div>
        <div class="actions"><button class="btn-primary" type="submit">Salva e torna alle trasferte</button></div>
      </form>
      ${kidsCard()}
      ${securityCard()}
      <div class="card"><div class="label">Altre squadre</div>
        ${S.ui.codeOpen ? `<form class="form" data-form="code-join"><label class="full">Codice d'invito<input name="code" required maxlength="40" autocapitalize="characters" autocomplete="off" placeholder="Es. OLI-7K4M2"></label><div class="actions"><button class="btn-primary" type="submit">Continua</button><button class="btn-ghost" type="button" data-act="code-close-p">Annulla</button></div></form>`
          : `<div><button class="btn-ghost" data-act="code-open-p">Ho un codice d'invito</button></div>`}
        ${Object.values(S.mesById || {}).some((m) => m && m.role === "admin") || (S.me && S.me.role === "admin") ? `<div class="small muted">Sei un allenatore o un dirigente? <a href="#/new">Registra una squadra</a></div>` : ""}</div>
      <a class="btn btn-ghost btn-block" href="#/">← Torna alle trasferte</a>
      ${privacyCard()}
      <div class="card small">
        ${S.ui.confirmLogout ? `<div><b>Vuoi uscire da geniGO su questo dispositivo?</b></div>
          <div class="muted">Per rientrare dovrai inserire di nuovo la tua email e il codice che ti arriva.</div>
          <div class="row"><button class="btn-link danger" data-act="logout">Sì, esci</button><button class="btn-link" data-act="logout-cancel">No, resta collegato</button></div>`
        : `<div class="muted">Resti collegato su questo dispositivo finché non esci.</div><div><button class="btn-link danger" data-act="logout-ask">Esci dall'account</button></div>`}
      </div>
    </div>` + footer() + (navTeam ? bottomNav(navTeam, "profilo") : "");
    document.body.classList.remove("sheet-open"); if (navTeam) document.body.classList.add("has-bnav");
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
      atleti: (S.myKids || []).map((k) => ({ nome: k.first_name, cognome: k.last_name, squadra: (teams.find((t) => t.id === k.team_id) || {}).name })),
      auto_offerte: rides.data || [], prenotazioni: books.data || [], richieste: reqs.data || [], consensi: S.consentLog || [] };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "genigo-i-miei-dati.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
    $app.innerHTML = topBar({ title: "Amministrazione", sub: "Visibile solo a te · aggiornato " + new Date(D.generated_at).toLocaleString("it-IT"), back: S.team ? "" : "#/profilo" }) + `<div class="wrap">
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
    </div>` + footer() + (S.team ? bottomNav(S.team.id, "admin") : "");
    document.body.classList.remove("sheet-open"); if (S.team) document.body.classList.add("has-bnav");
  }
  function adminCSV() {
    const L = S.adminData.team_list || [];
    const head = ["squadra", "sport", "categoria", "stagione", "piano", "creata", "membri", "in_attesa", "trasferte", "in_programma", "auto", "posti_prenotati", "richieste_aperte", "import_ai", "ultima_attivita"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = L.map((t) => [q(t.name), t.sport, q(t.category), q(t.season), t.plan, String(t.created_at).slice(0, 10), t.members, t.pending, t.events, t.events_upcoming, t.rides, t.bookings, t.requests_open, t.ai_imports, String(t.last_activity).slice(0, 10)].join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";")].concat(rows).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "genigo-squadre.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- squadra ----------
  function unsubscribe() { if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } S.loadedTeam = null; }

  async function fetchTeamData(id, uid) {
    // tutte le richieste partono insieme: un solo giro verso il database
    const [t, mem, ev, ri, bo, ve, rq, at, ap] = await Promise.all([
      sb.from("teams").select("*").eq("id", id).maybeSingle(),
      sb.from("team_members").select("*").eq("team_id", id),
      sb.from("events").select("*").eq("team_id", id).order("starts_at"),
      sb.from("rides").select("*").eq("team_id", id).order("created_at"),
      sb.from("bookings").select("*").eq("team_id", id).order("created_at"),
      sb.from("vehicles").select("*").eq("team_id", id).order("created_at"),
      sb.from("ride_requests").select("*").eq("team_id", id).order("created_at"),
      sb.from("athletes").select("id,team_id,first_name,last_name,label").eq("team_id", id).then((r) => r, () => ({ error: true })),
      sb.from("athlete_parents").select("athlete_id,user_id").eq("team_id", id).then((r) => r, () => ({ error: true }))
    ]);
    if (t.error) throw t.error;
    if (!t.data) return null;
    const me = { data: (mem.data || []).find((m) => m.user_id === uid) || null };
    // ragazzi della squadra con i loro genitori (null se il database non è ancora aggiornato)
    const athletes = !at.error && !ap.error ? (at.data || []).map((a) => ({ ...a, parents: (ap.data || []).filter((x) => x.athlete_id === a.id).map((x) => x.user_id) })) : null;
    return { team: t.data, me: me.data, members: (mem.data || []).map((m) => ({ ...m, team_id: m.team_id || id })), events: ev.data || [], rides: ri.data || [], bookings: bo.data || [], vehicles: ve.data || [], requests: rq.data || [], athletes };
  }

  // Un genitore vede insieme le trasferte di tutte le sue squadre (S.multi);
  // ogni trasferta resta gestita con le regole della propria squadra (withTeam).
  async function loadTeam(id) {
    const uid = S.user.id;
    const safe = (p) => p.then((r) => r, () => ({ data: null }));
    // primo giro: la squadra aperta, le mie iscrizioni, avvisi e sponsor, tutto insieme
    const [main, mineR, noR, unR, spR] = await Promise.all([
      fetchTeamData(id, uid),
      safe(sb.from("team_members").select("team_id,status").eq("user_id", uid).eq("status", "active")),
      safe(sb.rpc("my_notices")), safe(sb.rpc("my_user_notices")), safe(sb.rpc("get_sponsors", { p_team: id }))
    ]);
    if (!main) { S.team = null; S.me = null; return false; }
    S.team = main.team; S.me = main.me;
    let all = [main];
    if (S.me) {
      const others = (mineR.data || []).map((m) => m.team_id).filter((t) => t !== id);
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
    S.athletesOk = all.every((d) => d.athletes); S.athletes = all.flatMap((d) => d.athletes || []);
    S.notices = noR.data || []; S.userNotices = unR.data || []; S.sponsors = spR.data || [];
    return true;
  }

  // esegue fn come se fosse aperta la squadra tid (dati e permessi di quella squadra)
  function withTeam(tid, fn) {
    if (!S.multi || !S.teamsById || !S.teamsById[tid]) return fn();
    const keep = { team: S.team, me: S.me, members: S.members, events: S.events, rides: S.rides, bookings: S.bookings, requests: S.requests, vehicles: S.vehicles, athletes: S.athletes };
    const only = (a) => a.filter((x) => x.team_id === tid);
    try {
      S.team = S.teamsById[tid]; S.me = S.mesById[tid];
      S.members = S.allMembers.filter((m) => m.team_id === tid);
      S.events = only(keep.events); S.rides = only(keep.rides); S.bookings = only(keep.bookings); S.requests = only(keep.requests); S.vehicles = only(keep.vehicles); S.athletes = only(keep.athletes || []);
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
  const anyFormOpen = () => !!(S.ui.offer || S.ui.book || S.ui.club || S.ui.editEvent || S.ui.newEvent || S.ui.req || S.ui.takeNew);
  const member = (uid) => S.members.find((m) => m.user_id === uid) || (S.allMembers || []).find((m) => m.user_id === uid) || {};
  const canAddEvents = () => isAdmin();
  const canEditEvent = () => isAdmin();
  const tripLabel = (e) => { const p = dateParts(e.starts_at); return { trip: e.title, d: `${p.dow} ${p.day} ${p.mon}` }; };
  const DIR = { ar: "andata e ritorno", andata: "solo andata", ritorno: "solo ritorno" };

  let currentTab = "trasferte";
  async function viewTeam(id, tab, fromHome) {
    currentTab = tab;
    if (S.loadedTeam !== id) {
      S.ui = {}; S.aiPreview = null;
      $app.innerHTML = topBar({ title: "…", back: "#/" }) + `<div class="wrap"><div class="boot">Carico la squadra…</div></div>`;
      try { const ok = await loadTeam(id); if (fromHome && (!ok || !S.me || S.me.status !== "active")) { unsubscribe(); if (!ok) store("it-last-team", null); S.ui.homeOnce = true; return viewHome(); } if (!ok) { $app.innerHTML = topBar({ title: "Squadra", back: "#/" }) + `<div class="wrap"><div class="empty"><strong>Squadra non disponibile</strong>Non fai parte di questa squadra, oppure la tua richiesta è ancora in attesa di approvazione.</div></div>`; return; } }
      catch (e) { toast(errMsg(e)); return; }
      subscribe(id); S.teamLoadedAt = Date.now();
    } else {
      // stessa squadra: si mostra subito la sezione con i dati già in memoria (aggiornati in tempo reale);
      // se sono passati più di 30 secondi si ricaricano in sottofondo
      if (!S.team) { location.hash = "#/"; return; }
      const changed = S.lastTab !== tab; S.lastTab = tab;
      renderTeam();
      if (changed) window.scrollTo(0, 0);
      if (Date.now() - (S.teamLoadedAt || 0) > 30000 && !anyFormOpen()) {
        S.teamLoadedAt = Date.now();
        const tab0 = currentTab;
        window.__bgLoad = true;
        const done = () => { window.__bgLoad = false; };
        loadTeam(id).then(() => { done(); if (S.loadedTeam === id && currentTab === tab0 && !anyFormOpen() && S.team) renderTeam(); }, done);
      }
      return;
    }
    renderTeam();
  }

  // squadre in cui l'utente è amministratore (tra quelle caricate)
  const adminTeamIds = () => (S.teamOrder || [S.team.id]).filter((tid) => { const m = (S.mesById || {})[tid] || (tid === S.team.id ? S.me : null); return m && m.role === "admin" && m.status === "active"; });
  const ADMIN_TABS = ["mezzi", "report", "sponsor", "impostazioni", "gestisci"];
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
  // barra in basso: 4 voci; per chi amministra «Gestisci» raccoglie squadra, mezzi, sponsor, risparmio e report
  function teamTabs() {
    const adm = adminTeamIds();
    const tabs = [["trasferte", "Trasferte"], ["membri", "Membri"], ["invita", "Invita"], ["risparmio", "Risparmio"]];
    if (adm.length) tabs.push(["gestisci", "Gestisci"], ["impostazioni", "Squadra"], ["mezzi", "Mezzi"], ["report", "Report"]);
    if (adm.some((tid) => premium(S.teamsById ? S.teamsById[tid] : S.team))) tabs.push(["sponsor", "Sponsor"]);
    return tabs;
  }
  const GEST_SUB = ["impostazioni", "mezzi", "report", "sponsor"];
  const NAV_ICO = { trasferte: "🚗", membri: "👥", invita: "➕", risparmio: "🌱", gestisci: "⚙️", profilo: "👤", admin: "📊" };
  function bottomNav(teamId, active) {
    const adm = adminTeamIds().length > 0;
    const items = [["trasferte", "Trasferte"], ["membri", "Membri"], ["invita", "Invita"], adm ? ["gestisci", "Gestisci"] : ["risparmio", "Risparmio"], ["profilo", "Profilo"]];
    // pannello della piattaforma: solo per il gestore di geniGO
    if (S.platformAdmin) items.push(["admin", "Admin"]);
    const cur = active || currentTab;
    const act = GEST_SUB.includes(cur) || (adm && cur === "risparmio") ? "gestisci" : cur;
    const pend = isAdmin() ? (S.members || []).filter((m) => m.status === "pending").length : 0;
    return `<nav class="bnav noprint" aria-label="Sezioni">${items.map(([k, l]) => `<a href="${k === "profilo" ? "#/profilo" : k === "admin" ? "#/admin" : `#/t/${teamId}/${k}`}" ${k === act ? 'aria-current="page"' : ""}><span class="bnav-ico" aria-hidden="true">${NAV_ICO[k]}</span>${l}${k === "membri" && pend ? `<b class="bnav-dot" aria-label="${pend} in attesa">${pend}</b>` : ""}</a>`).join("")}</nav>`;
  }
  function tabManage() {
    const tid = S.team.id, pr = adminTeamIds().some((x) => premium(teamById(x)));
    const tile = (k, ico, t, d) => `<a class="tile-link" href="#/t/${tid}/${k}"><span class="tile-ico" aria-hidden="true">${ico}</span><span><b>${t}</b><small>${d}</small></span><i aria-hidden="true">›</i></a>`;
    return `<div class="tiles">
      ${tile("impostazioni", "⚙️", "Squadra", "Nome, categoria, stagione, approvazione dei nuovi membri")}
      ${tile("mezzi", "🚐", "Mezzi della società", "Pulmini e auto della società con i loro posti")}
      ${pr ? tile("sponsor", "📣", "Sponsor", "Banner mostrati ai genitori") : ""}
      ${tile("risparmio", "🌱", "Risparmio", "Km, euro e CO₂ evitati grazie ai passaggi condivisi")}
      ${tile("report", "📊", "Report", "Riepilogo delle trasferte ed export per la società")}
    </div>`;
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
    // titolo di ogni sezione nell'intestazione scura, centrato sotto il logo (uguale in tutte le pagine)
    const TITLES = { trasferte: "Trasferte", membri: "Membri", invita: "Invita", risparmio: "Risparmio", gestisci: "Gestisci la squadra", impostazioni: "Squadra", mezzi: "Mezzi della società", report: "Report", sponsor: "Sponsor" };
    const head = topBar({ teamId: t.id, title: TITLES[currentTab] });
    const fn = { trasferte: tabTrips, membri: tabMembers, invita: tabInvite, risparmio: tabSavings, mezzi: tabVehicles, report: tabReport, sponsor: tabSponsors, impostazioni: tabSettings, gestisci: tabManage }[currentTab];
    const sub = (GEST_SUB.includes(currentTab) || (currentTab === "risparmio" && adminTeamIds().length)) ? `<a class="back-link noprint" href="#/t/${t.id}/gestisci">‹ Gestisci</a>` : "";
    // trasferte e risparmio mostrano tutte le squadre; le altre sezioni solo la squadra aperta
    const body = sub + (currentTab === "trasferte" || currentTab === "risparmio" || currentTab === "gestisci" ? fn() : teamSwitch() + withTeam(t.id, fn));
    const y = window.scrollY;
    const curSp = document.querySelector(".sp-banner")?.dataset.cur;
    const sheet = actionSheet();
    $app.innerHTML = head + `<div class="wrap">${waPanel()}${body}</div>` + footer() + bottomNav(t.id) + sheet;
    document.body.classList.add("has-bnav");
    document.body.classList.toggle("sheet-open", !!sheet);
    if (sheet) { const sf = document.querySelector(".sheet [data-form]"); if (sf) updSeatsSum(sf); }
    window.scrollTo(0, y);
    if (currentTab === "invita") drawQR();
    if (curSp != null) { const nb = document.querySelector(".sp-banner"); if (nb) nb.dataset.cur = curSp; }
    countSponsorViews();
    if (currentTab === "sponsor" && !S.teamSponsorsLoaded) loadTeamSponsors();
  }

  // ----- pannello dal basso per offrire, chiedere, prenotare, «lo porto io», mezzo della società -----
  function actionSheet() {
    const u = S.ui, ev = (id) => S.events.find((x) => x.id === id);
    let e, icon, title, sub = "", body;
    if (u.offer && (e = ev(u.offer))) { icon = "🚗"; title = "Offro un passaggio"; body = () => offerForm(e); }
    else if (u.req && (e = ev(u.req))) { icon = "🙋"; title = "Cerco un passaggio"; body = () => reqForm(e); }
    else if (u.club && (e = ev(u.club))) { icon = "🚐"; title = "Mezzo della società"; body = () => clubForm(e); }
    else if (u.book) {
      const r = S.rides.find((x) => x.id === u.book); if (!r || !(e = ev(r.event_id))) return "";
      const veh = r.vehicle_id ? S.vehicles.find((v) => v.id === r.vehicle_id) : null;
      icon = "🎟️"; title = r.assignment === "convocation" ? "Assegna un posto" : "Prenota un posto";
      sub = r.kind === "club" ? (veh ? veh.name : "Mezzo della società") : "Auto di " + (r.driver_name || "un genitore");
      body = () => bookForm(r);
    } else if (u.takeNew) {
      const q = S.requests.find((x) => x.id === u.takeNew); if (!q || !(e = ev(q.event_id))) return "";
      icon = "🤝"; title = "Lo porto io"; body = () => takeNewForm(q, e);
    } else return "";
    const p = dateParts(e.starts_at);
    return `<div class="sheet-ov" data-act="cancel" aria-hidden="true"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
        <div class="sheet-grab" aria-hidden="true"></div>
        <header class="sheet-head"><span class="sheet-ic" aria-hidden="true">${icon}</span>
          <div class="sheet-tt"><b id="sheet-t">${title}</b><small>${esc(e.title)} · ${p.dow} ${p.day} ${p.mon} · ${p.time}</small>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
          <button type="button" class="sheet-x" data-act="cancel" aria-label="Chiudi">✕</button></header>
        <div class="sheet-body">${withTeam(e.team_id, body)}</div>
      </section>`;
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
  // ragazzi della squadra aperta: { name, parents: [nomi], user_ids }
  function roster() {
    if (S.athletesOk) return S.athletes.filter((a) => a.team_id === S.team.id).map((a) => ({ name: a.label, user_ids: a.parents, parents: a.parents.map((u) => member(u).name).filter(Boolean) })).sort((a, b) => a.name.localeCompare(b.name));
    const out = [];
    S.members.filter((m) => m.status === "active").forEach((m) => splitNames(m.athletes).forEach((a) => out.push({ name: a, parents: [m.name], user_ids: [m.user_id] })));
    return out;
  }
  const myAthletes = () => S.athletesOk ? S.athletes.filter((a) => a.team_id === S.team.id && a.parents.includes(S.user.id)).map((a) => a.label).sort() : splitNames(S.me?.athletes);
  const kidsOf = (uid) => S.athletesOk ? S.athletes.filter((a) => a.team_id === S.team.id && a.parents.includes(uid)).map((a) => a.label).sort() : splitNames(member(uid).athletes);
  // avvisi: un altro genitore si è collegato a un mio figlio
  function noticeCards() {
    return (S.userNotices || []).map((n) => `<div class="notice" style="background:var(--warn-soft);color:var(--ink)"><b>⚠️ ${esc(n.message)}</b>
      <div class="row"><button class="btn-link" data-act="unotice-ok" data-id="${n.id}">Ok, ho capito</button></div></div>`).join("") + (S.notices || []).map((n) => `<div class="notice ok"><b>${esc(n.parent)} ora è anche genitore di ${esc(n.athlete)}</b>
      <div class="small">${esc(n.team)} · da ora vede e gestisce le prenotazioni di ${esc(firstName(n.athlete))}.</div>
      <div class="row"><button class="btn-link" data-act="notice-ok" data-id="${n.id}">Ok</button><button class="btn-link danger" data-act="notice-unlink" data-id="${n.id}">Non lo conosco, scollega</button></div></div>`).join("");
  }

  function tabTrips() {
    const L = sportOf(S.team);
    const cut = Date.now(); // dall'ora di inizio la trasferta passa tra quelle passate
    // filtro per categoria (solo con più squadre): ricordato su questo telefono
    const tids = S.multi && S.teamOrder ? S.teamOrder.slice().sort((a, b) => teamById(a).name.localeCompare(teamById(b).name)) : [];
    let sel = store("it-cat"); if (sel && !tids.includes(sel)) sel = null;
    const evs = sel ? S.events.filter((e) => e.team_id === sel) : S.events;
    const up = evs.filter((e) => new Date(e.starts_at).getTime() >= cut);
    const past = evs.filter((e) => new Date(e.starts_at).getTime() < cut).reverse();
    const admin = isAdmin();
    const catBar = tids.length > 1 ? `<div class="pill-group cat-bar noprint" role="radiogroup" aria-label="Categoria">
        <button class="pill" role="radio" aria-checked="${!sel}" data-act="cat-filter" data-v="">Tutte</button>
        ${tids.map((tid) => `<button class="pill" role="radio" aria-checked="${sel === tid}" data-act="cat-filter" data-v="${tid}" title="${esc(teamById(tid).name)}">${esc(teamById(tid).category || teamById(tid).name)}</button>`).join("")}</div>` : "";
    return `${sponsorBanner()}
      ${noticeCards()}${wizardTrips()}${firstSteps()}${parentTips()}${catBar}
      ${adminTeamIds().length && wizStep() !== 2 ? `<div class="row noprint">
        ${S.ui.newEvent ? "" : `<button class="btn-primary" data-act="new-event">+ Aggiungi trasferta</button>`}
        ${adminTeamIds().some((tid) => premium(teamById(tid))) ? `<button class="btn-ghost" data-act="ai-open">Importa calendario con l'AI</button>` : ""}
      </div>` : ""}
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

  // banner sponsor: ridimensiona al massimo a 1600 px di larghezza (nitida anche sugli schermi retina,
  // il banner è largo al più 760 px) e ricodifica in WEBP/JPEG di alta qualità; tiene l'originale se è già più leggero
  const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  async function optimizeImage(file) {
    const MAXW = 1600, Q = 0.88;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { return file; }
    const k = Math.min(1, MAXW / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(bmp, 0, 0, w, h);
    // trasparenza (loghi PNG/WEBP): va conservata
    let alpha = false;
    if (file.type !== "image/jpeg") { const d = cx.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; } }
    const enc = (type, q) => new Promise((r) => cv.toBlob((b) => r(b && b.type === type ? b : null), type, q));
    let out = await enc("image/webp", Q);
    if (!out) out = alpha ? await enc("image/png") : await enc("image/jpeg", Q);
    if (!out) return file;
    // se l'originale non andava ridimensionato ed è già più leggero, si tiene quello
    if (k === 1 && file.size <= out.size) return file;
    return new File([out], "banner." + (out.type.split("/")[1] || "jpg"), { type: out.type });
  }
  function sponsorForm(sp, scope) {
    const sports = sp?.sports || [];
    return `<form class="card form" data-form="sponsor" data-scope="${scope}" data-id="${sp ? sp.id : ""}">
      <h3 class="full">${sp ? "Modifica sponsor" : "Nuovo sponsor"}</h3>
      <label class="full">Nome<input name="name" required minlength="2" maxlength="80" value="${esc(sp?.name || "")}" placeholder="Es. Pizzeria Da Mario"></label>
      <label class="full">Messaggio breve (facoltativo)<input name="message" maxlength="140" value="${esc(sp?.message || "")}" placeholder="Es. Sconto 10% per le famiglie della squadra"></label>
      <label class="full">Sito o pagina (facoltativo)<input name="link" type="url" maxlength="300" value="${esc(sp?.link_url || "")}" placeholder="https://…"></label>
      <label class="full">Banner: immagine orizzontale<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div class="full small muted">Formato consigliato 3:1, per esempio 1500×500 pixel. JPG, PNG o WEBP: la ottimizziamo noi per caricarsi veloce sul telefono, senza perdere qualità visibile.</div>
      ${sp?.logo_path ? `<div class="full small muted">Banner attuale: ${isVideo(sp) ? `<video src="${esc(logoUrl(sp.logo_path))}" muted preload="metadata" class="sp-prev"></video>` : `<img src="${esc(logoUrl(sp.logo_path))}" alt="" class="sp-prev">`} (carica un file solo per sostituirlo)</div>` : ""}
      <label>Secondi di visualizzazione<input name="seconds" type="number" min="3" max="60" step="1" value="${esc(String(sp?.seconds || 6))}"></label>
      ${scope === "platform" ? `<div class="full stack sp-sport" style="gap:8px"><div class="label">In quali sport mostrarlo</div>
        <div class="pill-group" role="radiogroup"><label class="pill check-pill"><input type="radio" name="sp_all" value="all" ${sports.length ? "" : "checked"}> 🌍 Tutti gli sport</label><label class="pill check-pill"><input type="radio" name="sp_all" value="some" ${sports.length ? "checked" : ""}> 🎯 Solo alcuni sport</label></div>
        <div class="pill-group sp-sports" ${sports.length ? "" : "hidden"}>${SPORT_ORDER.map((k) => `<label class="pill check-pill"><input type="checkbox" name="sports" value="${k}" ${sports.includes(k) ? "checked" : ""}> ${esc(SPORTS[k].label)}</label>`).join("")}</div>
        <div class="small muted sp-sports" ${sports.length ? "" : "hidden"}>Spunta uno o più sport: lo vedranno solo le squadre di quegli sport.</div></div>` : ""}
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
    return `<div class="notice small">Gli sponsor della società compaiono solo ai membri di questa squadra, a rotazione nel banner in cima alla pagina Trasferte. Puoi inserirne fino a 10. Finché ne hai almeno uno attivo, sostituiscono quelli di geniGO.</div>
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
    const free = Math.max(0, tot - seatsOf(bk));
    const booked = new Set(bk.map((b) => b.athlete_name.toLowerCase()));
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
        ${!isPast ? `<div class="row noprint">
          <button class="btn-ghost" data-act="offer" data-id="${e.id}">🚗 Offro un passaggio</button>
          <button class="btn-ghost" data-act="req" data-id="${e.id}">🙋 Cerco un passaggio</button>
          ${admin ? `<button class="btn-ghost" data-act="club" data-id="${e.id}">+ Mezzo della società</button>` : ""}
        </div>` : ""}
        ${rides.length ? `<div class="offers"><div class="reqs-head"><span aria-hidden="true">🚗</span><b>Offrono un passaggio</b><span class="offers-n">${rides.length}</span></div>${(rides.length > 3 && !(S.ui.allRides || {})[e.id] ? rides.slice(0, 3) : rides).map((r) => rideBlock(r, e, isPast)).join("")}${rides.length > 3 ? `<button class="btn-link" data-act="all-rides" data-id="${e.id}">${(S.ui.allRides || {})[e.id] ? "Mostra meno" : `Mostra altri ${rides.length - 3} mezzi`}</button>` : ""}</div>` : ""}
        ${!isPast && reqs.length ? reqBox(e, reqs) : ""}
        ${canEditEvent(e) ? `<div class="row noprint">${confirming
          ? `<span class="confirm">Eliminare la trasferta con tutti i passaggi? <button class="btn-link danger" data-act="del-event" data-id="${e.id}">Sì, elimina</button><button class="btn-link" data-act="cancel">Annulla</button></span>`
          : `<button class="btn-link" data-act="edit-event" data-id="${e.id}">Modifica</button><button class="btn-link" data-act="ask-del-event" data-id="${e.id}">Elimina</button>`}</div>` : ""}
      </div></article>`;
  }

  function rideBlock(r, e, isPast) {
    const rs = S.bookings.filter((b) => b.ride_id === r.id);
    const usedN = seatsOf(rs);
    const free = Math.max(0, r.seats - usedN);
    const mine = r.created_by === S.user.id;
    const admin = isAdmin();
    const veh = r.vehicle_id ? S.vehicles.find((v) => v.id === r.vehicle_id) : null;
    const who = r.kind === "club" ? ([veh ? esc(veh.name) : "", r.driver_name ? "autista " + esc(r.driver_name) : ""].filter(Boolean).join(" · ") || "pulmino") : esc(r.driver_name);
    const dots = Array.from({ length: Math.min(r.seats, 20) }, (_, i) => `<span class="seat ${i < usedN ? "taken" : ""}"></span>`).join("");
    const canBook = !isPast && free > 0 && (r.assignment === "booking" || admin);
    const confirming = S.ui.confirm === "ride:" + r.id;
    const open = !!(S.ui.rideOpen || {})[r.id];
    const details = [
      r.km_to_venue ? `≈ ${fmt(r.km_to_venue)} km fino a destinazione` : "",
      r.depart_from && e.place ? `<a href="${esc(mapsRoute(r.depart_from, e.place))}" target="_blank" rel="noopener">percorso in Maps</a>` : "",
      !mine && driverPhone(r) ? `<a href="tel:${esc(waNum(driverPhone(r)) ? "+" + waNum(driverPhone(r)) : driverPhone(r))}">📞 ${esc(driverPhone(r))}</a>` : "",
      r.notes ? esc(r.notes) : "",
      r.assignment === "convocation" ? "posti assegnati dalla società" : ""
    ].filter(Boolean);
    return `<div class="ride ${r.kind === "club" ? "club" : ""}">
      <div class="ride-top"><span class="driver">${who}</span><span class="chip ${free ? "ok" : "warn"}">${free ? free + (free === 1 ? " libero" : " liberi") : "Pieno"}</span></div>
      <div class="meta">${r.depart_time ? `🕔 <b>${esc(r.depart_time)}</b> · ` : ""}${esc(r.depart_from || "—")} · ${r.return_trip ? "andata e ritorno" : "solo andata"}${details.length ? ` · <button class="btn-link" data-act="ride-more" data-id="${r.id}">${open ? "meno" : "dettagli"}</button>` : ""}</div>
      ${open ? `<div class="meta">${details.join(" · ")}</div>` : ""}
      ${rs.length ? `<ul class="pax">${rs.map((b) => `<li><span>${paxName(b, b.booked_by)}${adultsTag(Number(b.adults) || 0, b.no_athlete)}${b.pickup ? ` <small>· sale a ${esc(b.pickup)}</small>` : ""}</span>${!isPast && (b.booked_by === S.user.id || mine || admin) ? `<button class="btn-link danger" data-act="unbook" data-id="${b.id}">Libera</button>` : ""}</li>`).join("")}</ul>` : ""}
      ${!isPast ? `<div class="row noprint">
        ${canBook ? `<button class="btn-primary btn-sm" data-act="book" data-id="${r.id}">${r.assignment === "convocation" ? "Assegna un posto" : "Prenota"}</button>` : ""}
        ${mine || admin ? (confirming
          ? `<span class="confirm">Ritirare questo mezzo? Le prenotazioni verranno cancellate. <button class="btn-link danger" data-act="del-ride" data-id="${r.id}">Sì</button><button class="btn-link" data-act="cancel">No</button></span>`
          : `<button class="btn-link" data-act="ask-del-ride" data-id="${r.id}">${r.kind === "club" ? "Togli mezzo" : "Ritira la mia auto"}</button>`) : ""}
      </div>` : ""}
    </div>`;
  }

  // posti occupati: 1 per atleta + gli adulti che viaggiano con lui
  const seatsOf = (list) => list.reduce((a, b) => a + (b.no_athlete ? 0 : 1) + (Number(b.adults) || 0), 0);
  // nome mostrato: le righe di soli adulti mostrano chi le ha chieste
  const paxName = (b, by) => b.no_athlete ? `👤 ${b.adults === 1 ? "1 adulto" : b.adults + " adulti"} <small>· con ${esc(firstName(member(by).name) || "un genitore")}</small>` : esc(b.athlete_name);
  const adultsTag = (n, solo) => n && !solo ? ` <span class="chip ad">+ ${n} ${n === 1 ? "adulto" : "adulti"}</span>` : "";
  const adultsField = () => `<div class="full adults-row"><div><div class="label">Adulti / accompagnatori</div><div class="small muted">genitori, nonni, dirigenti…</div></div>
      <div class="stepper"><button type="button" class="step-btn" data-act="adults-dec" aria-label="Meno">−</button><input name="adults" type="number" min="0" max="8" value="0" readonly aria-label="Adulti"><button type="button" class="step-btn" data-act="adults-inc" aria-label="Più">+</button></div></div>
    <div class="full seats-sum" data-seats-sum hidden></div>`;
  function updSeatsSum(f) {
    if (!f) return;
    const box = f.querySelector("[data-seats-sum]"); if (!box) return;
    const ath = f.querySelectorAll('input[name="athlete"]:checked').length || (f.querySelector('input[name="athlete"]:not([type=checkbox])')?.value.trim() ? 1 : 0);
    const ad = Number(f.elements.adults?.value) || 0;
    const tot = ath + ad;
    const free = f.dataset.free != null ? Number(f.dataset.free) : null;
    const over = free != null && tot > free;
    box.hidden = !ad && !over;
    box.classList.toggle("over", over);
    box.innerHTML = over ? `Troppe persone: ${tot} su <b>${free} ${free === 1 ? "posto libero" : "posti liberi"}</b>. Togli qualcuno.`
      : `Servono <b>${tot} ${tot === 1 ? "posto" : "posti"}</b>: ${ath ? `${ath} ${ath === 1 ? "atleta" : "atleti"} + ` : "solo "}${ad} ${ad === 1 ? "adulto" : "adulti"}`;
    // con i posti già esauriti non si possono aggiungere altre persone
    if (free != null) {
      const full = tot >= free;
      const inc = f.querySelector('[data-act="adults-inc"]'); if (inc) inc.disabled = full;
      f.querySelectorAll('input[name="athlete"][type=checkbox]').forEach((c) => { if (!c.checked) { c.disabled = full; c.closest("label")?.classList.toggle("is-off", full); } });
      const sub = f.querySelector('button[type="submit"]'); if (sub) sub.disabled = over || !tot;
    }
  }
  const driverPhone = (r) => r.driver_phone || (r.kind === "parent" ? member(r.created_by).phone : "") || "";

  function reqBox(e, reqs) {
    return `<div class="reqs">
      <div class="reqs-head"><span aria-hidden="true">🙋</span><b>Cercano un passaggio</b><span class="reqs-n">${reqs.length}</span></div>
      <ul>${(reqs.length > 3 && !(S.ui.allReqs || {})[e.id] ? reqs.slice(0, 3) : reqs).map((q) => {
        const mineQ = q.requested_by === S.user.id;
        const dir = DIR[q.direction] || "";
        const qa = Number(q.adults) || 0;
        const qn = (q.no_athlete ? 0 : 1) + qa;
        return `<li class="req"><div class="req-main"><b>${paxName(q, q.requested_by)}</b>${adultsTag(qa, q.no_athlete)}
            <div class="req-meta">${qn > 1 ? `<span class="tag">${qn} posti</span>` : ""}${dir ? `<span class="tag">${esc(dir.charAt(0).toUpperCase() + dir.slice(1))}</span>` : ""}${q.depart_from ? `<span class="tag">da ${esc(q.depart_from)}</span>` : ""}<span>chiesto da ${mineQ ? "te" : esc(firstName(member(q.requested_by).name))}</span></div></div>
          <div class="req-act">${!mineQ ? `<button class="btn-ok btn-sm" data-act="take" data-id="${q.id}">Lo porto io</button>` : ""}${mineQ || isAdmin() ? `<button class="btn-link danger" data-act="del-req" data-id="${q.id}">Ritira</button>` : ""}</div></li>`;
      }).join("")}</ul>${reqs.length > 3 ? `<button class="btn-link" data-act="all-reqs" data-id="${e.id}">${(S.ui.allReqs || {})[e.id] ? "Mostra meno" : `Mostra altre ${reqs.length - 3} richieste`}</button>` : ""}</div>`;
  }

  // scelta dei propri figli con le spunte, invece di scrivere il nome
  const kidPicker = (names, title) => `<div class="full"><div class="label" style="margin-bottom:6px">${title}</div><div class="pill-group">${names.map((n) => `<label class="pill check-pill"><input type="checkbox" name="athlete" value="${esc(n)}" ${names.length === 1 ? "checked" : ""}> ${esc(n)}</label>`).join("")}</div></div>`;
  function reqForm(e) {
    const booked = new Set(S.bookings.filter((b) => b.event_id === e.id).map((b) => b.athlete_name.toLowerCase()));
    const asked = new Set(S.requests.filter((q) => q.event_id === e.id).map((q) => q.athlete_name.toLowerCase()));
    const names = myAthletes().filter((n) => !booked.has(n.toLowerCase()) && !asked.has(n.toLowerCase()));
    const kidsDone = S.athletesOk && myAthletes().length && !names.length;
    return `<form class="form" data-form="req" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      ${names.length ? kidPicker(names, "Per chi?") : kidsDone ? `<div class="full small muted">I tuoi atleti hanno già un posto o una richiesta: puoi chiedere un passaggio per uno o più adulti.</div>` : `<label>Atleta (facoltativo se viaggiano solo adulti)<input name="athlete" maxlength="60" placeholder="Nome e cognome"></label>`}
      ${adultsField()}
      <label>Serve per<select name="direction"><option value="ar">andata e ritorno</option><option value="andata">solo andata</option><option value="ritorno">solo ritorno</option></select></label>
      <label class="full">Da dove parte<input name="from" maxlength="120" placeholder="Es. Buccinasco"></label>
      <div class="actions"><button class="btn-primary" type="submit">Pubblica la richiesta</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  // «Lo porto io» senza aver ancora offerto l'auto: si pubblica l'auto e si porta subito chi ha chiesto
  function takeNewForm(q, e) {
    const need = (q.no_athlete ? 0 : 1) + (Number(q.adults) || 0);
    const who = q.no_athlete ? (need === 1 ? "1 adulto" : need + " adulti") : esc(q.athlete_name) + (Number(q.adults) ? ` e ${q.adults === 1 ? "1 adulto" : q.adults + " adulti"}` : "");
    return `<form class="form take-new" data-form="take-new" data-id="${q.id}" data-event="${e.id}">
      <div class="full"><b>Porti ${who}</b><div class="small muted">Pubblichiamo la tua auto per questa trasferta e ci mettiamo subito dentro chi ha chiesto.</div></div>
      <label>Posti in auto<select name="seats">${[1, 2, 3, 4, 5, 6, 7, 8].filter((n) => n >= need).map((n) => `<option ${n === need ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Orario partenza<input name="time" type="time" required></label>
      <label class="full">Punto di partenza<input name="from" required maxlength="120" value="${esc(q.depart_from || "")}" placeholder="Es. parcheggio del palazzetto"></label>
      ${S.profile.phone ? "" : `<label class="full">Il tuo cellulare (per WhatsApp)<input name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="333 1234567"></label>`}
      <label class="full check"><input name="back" type="checkbox" ${q.direction === "andata" ? "" : "checked"}> Faccio anche il ritorno</label>
      ${driverOk() ? "" : `<label class="full check declare"><input name="driver" type="checkbox" required> <span>Dichiaro di avere patente valida, auto con assicurazione RC in corso e revisione regolare, e di trasportare gli atleti rispettando il codice della strada, con cinture o seggiolini e senza superare i posti omologati. Il passaggio è gratuito e sotto la mia responsabilità. <small class="muted">Te lo chiediamo una volta a stagione · <a href="#/termini" target="_blank">Termini</a></small></span></label>`}
      <div class="actions"><button class="btn-ok" type="submit">Lo porto io</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function offerForm(e) {
    return `<form class="form" data-form="offer" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <label>Posti liberi<select name="seats">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Orario partenza<input name="time" type="time" required></label>
      <label class="full">Punto di partenza<input name="from" required maxlength="120" placeholder="Es. parcheggio del palazzetto"></label>
      <label class="full">Note<input name="notes" maxlength="200" placeholder="Es. posso fare una tappa lungo la strada"></label>
      <label class="full">Telefono (per WhatsApp, visibile ai genitori della squadra)<input name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="333 1234567" value="${esc(S.profile.phone || "")}"></label>
      <label class="full check"><input name="back" type="checkbox" checked> Faccio anche il ritorno</label>
      ${driverOk() ? "" : `<label class="full check declare"><input name="driver" type="checkbox" required> <span>Dichiaro di avere patente valida, auto con assicurazione RC in corso e revisione regolare, e di trasportare gli atleti rispettando il codice della strada, con cinture o seggiolini e senza superare i posti omologati. Il passaggio è gratuito e sotto la mia responsabilità. <small class="muted">Te lo chiediamo una volta a stagione · <a href="#/termini" target="_blank">Termini</a></small></span></label>`}
      <div class="actions"><button class="btn-primary" type="submit">Pubblica il passaggio</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div>
    </form>`;
  }

  function clubForm(e) {
    const vs = S.vehicles.filter((v) => v.active);
    if (!vs.length) return `<div class="notice small">Prima registra i mezzi della società nella sezione <a href="#/t/${S.team.id}/mezzi">Mezzi</a>.</div>`;
    return `<form class="form" data-form="club" data-id="${e.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <label class="full">Mezzo<select name="vehicle">${vs.map((v) => `<option value="${v.id}" data-seats="${v.seats}">${esc(v.name)} · ${v.seats} posti</option>`).join("")}</select></label>
      <label>Posti disponibili<input name="seats" type="number" min="1" max="60" value="${vs[0].seats}"></label>
      <label>Orario partenza<input name="time" type="time" required></label>
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
    const mine = myAthletes().filter((n) => !booked.has(n.toLowerCase()));
    const all = roster().map((a) => a.name).filter((n) => !booked.has(n.toLowerCase()));
    const pick = !conv && mine.length;
    const kidsDone = !conv && !isAdmin() && S.athletesOk && myAthletes().length && !mine.length;
    const freeN = Math.max(0, r.seats - seatsOf(S.bookings.filter((b) => b.ride_id === r.id)));
    return `<form class="form" data-form="book" data-id="${r.id}" data-free="${freeN}">
      <div class="full small muted">Posti liberi su questo mezzo: <b>${freeN}</b></div>
      ${kidsDone ? `<div class="full small muted">I tuoi atleti hanno già un posto: puoi prenotare per uno o più adulti.</div>` : ""}
      ${kidsDone ? "" : pick ? kidPicker(mine, "Chi sale?") + (isAdmin() ? `<label class="full">Altro atleta della squadra (facoltativo)<input name="athlete" maxlength="60" list="dl-${r.id}" placeholder="Nome e cognome"><datalist id="dl-${r.id}">${all.filter((n) => !mine.includes(n)).map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label>` : "") : `<label>Atleta (facoltativo se salgono solo adulti)<input name="athlete" maxlength="60" list="dl-${r.id}" placeholder="Nome e cognome"><datalist id="dl-${r.id}">${(conv || isAdmin() ? all : mine).map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label>`}
      ${adultsField()}
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
      ${S.athletesOk ? `<div class="card"><div class="between"><div><div class="label">I tuoi atleti in questa squadra</div><div>${esc(myAthletes().join(", ") || "Nessuno indicato")}</div></div><a class="btn btn-ghost" href="#/profilo">Gestisci</a></div></div>`
        : `<form class="card form" data-form="my-athletes">
        <label class="full">I miei atleti in questa squadra<input name="athletes" maxlength="200" value="${esc(S.me.athletes)}" placeholder="Più nomi separati da virgola"></label>
        <div class="actions"><button class="btn-primary" type="submit">Salva</button></div>
      </form>`}
      <div class="card"><div class="label">Membri · ${act.length}</div>
        ${act.map((m) => {
          const me = m.user_id === S.user.id;
          const c = S.ui.confirm === "member:" + m.user_id;
          return `<div class="member"><div class="avatar">${esc(initials(m.name))}</div>
            <div style="flex:1;min-width:0"><b>${esc(m.name)}${me ? " (tu)" : ""}</b><div class="small muted">${kidsOf(m.user_id).length ? "genitore di " + esc(kidsOf(m.user_id).join(", ")) : "nessun atleta indicato"}</div>
              ${admin && !me ? `<div class="row">${c ? `<span class="confirm">Togliere dalla squadra? <button class="btn-link danger" data-act="remove-member" data-id="${m.user_id}">Sì</button><button class="btn-link" data-act="cancel">No</button></span>`
                : `<button class="btn-link" data-act="toggle-admin" data-id="${m.user_id}">${m.role === "admin" ? "Togli amministratore" : "Rendi amministratore"}</button><button class="btn-link danger" data-act="ask-remove-member" data-id="${m.user_id}">Togli</button>`}</div>` : ""}
            </div>
            <span class="chip ${m.role === "admin" ? "navy" : ""}">${m.role === "admin" ? "Admin" : "Genitore"}</span></div>`;
        }).join("")}
      </div>
      ${S.athletesOk && roster().length ? `<div class="card"><div class="label">Atleti · ${roster().length}</div>
        ${roster().map((a) => `<div class="member"><div style="flex:1;min-width:0"><b>${esc(a.name)}</b><div class="small muted">${esc(a.parents.join(" · ") || "—")}</div></div></div>`).join("")}</div>` : ""}
      <div>${S.ui.confirm === "leave" ? `<span class="confirm">Vuoi davvero lasciare la squadra? <button class="btn-link danger" data-act="leave">Sì, esci</button><button class="btn-link" data-act="cancel">No</button></span>` : `<button class="btn-link danger" data-act="ask-leave">Lascia la squadra</button>`}</div>`;
  }

  // ----- tab invita -----
  // squadre incluse nell'invito: di default quella aperta; l'amministratore di più squadre può aggiungerne
  const inviteTeams = () => { const sel = (S.ui.invSel || []).filter((tid) => adminTeamIds().includes(tid) && teamById(tid)); return sel.length ? sel.map(teamById) : [S.team]; };
  // con più squadre: un solo codice di gruppo (creato al volo e ricordato)
  const groupKey = () => inviteTeams().map((t) => t.id).sort().join(",");
  function inviteCode() {
    const ts = inviteTeams();
    if (ts.length === 1) return ts[0].invite_code;
    const g = (S.ui.grpCodes || {})[groupKey()];
    if (g) return g;
    if (!S.ui.grpLoading) {
      S.ui.grpLoading = true; const key = groupKey();
      sb.rpc("group_invite", { p_teams: ts.map((t) => t.id) }).then((r) => {
        S.ui.grpLoading = false;
        if (r.data) { S.ui.grpCodes = { ...(S.ui.grpCodes || {}), [key]: r.data }; if (currentTab === "invita") renderTeam(); }
      }, () => { S.ui.grpLoading = false; });
    }
    return ts.map((t) => t.invite_code).join(","); // finché il codice di gruppo non è pronto
  }
  const inviteUrl = () => location.origin + location.pathname + "#/join/" + inviteCode();
  const inviteText = () => {
    const ts = inviteTeams(); const names = ts.length === 1 ? ts[0].name : ts.slice(0, -1).map((t) => t.name).join(", ") + " e " + ts[ts.length - 1].name;
    const c = inviteCode();
    return `Ciao! Per organizzare i passaggi alle trasferte di ${names} usiamo geniGO. Apri il link e indica ${ts.length > 1 ? "i tuoi atleti e le squadre in cui giocano" : "il nome del tuo atleta"}: ${inviteUrl()}${c.includes(",") ? "" : ` (oppure su ${location.host || "genigo.it"} scrivi il codice ${c})`}`;
  };
  function tabInvite() {
    const admin = isAdmin();
    const adm = adminTeamIds();
    const multiInv = admin && adm.length > 1;
    const selIds = inviteTeams().map((t) => t.id);
    return `${wizardInvite()}${multiInv ? `<div class="card"><div class="label">Squadre incluse nell'invito</div>
        <div class="pill-group">${adm.map((tid) => `<label class="pill check-pill"><input type="checkbox" data-act="inv-toggle" data-id="${tid}" ${selIds.includes(tid) ? "checked" : ""}> ${esc(teamById(tid).name)}</label>`).join("")}</div>
        <div class="small muted">Con più squadre l'app crea un solo codice valido per tutte: il genitore lo usa una volta e indica in quali squadre gioca ciascun atleta.</div></div>` : ""}
      <div class="card">
        <div class="qr" id="qr" role="img" aria-label="QR code dell'invito"></div>
        <div style="text-align:center;display:grid;gap:2px"><div class="small muted">${selIds.length > 1 ? `Codice unico per ${selIds.length} squadre` : "Codice della squadra"}</div>
          <div class="big-code">${inviteCode().includes(",") ? "…" : esc(inviteCode())}</div>
          ${selIds.length > 1 ? `<div class="small muted">${esc(inviteTeams().map((t) => t.name).join(" · "))}</div>` : ""}</div>
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
  const closeForms = () => { S.ui.offer = S.ui.book = S.ui.club = S.ui.editEvent = S.ui.newEvent = S.ui.confirm = S.ui.req = S.ui.takeNew = null; };

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    const simple = {
      "login-restart": () => { S.ui.loginEmail = null; viewLogin(); },
      "pw-show": () => { const i = b.parentElement.querySelector("input"); const show = i.type === "password"; i.type = show ? "text" : "password"; b.textContent = show ? "Nascondi" : "Mostra"; },
      "pw-forgot": () => { S.ui.lastEmail = document.querySelector('[data-form="login-pw"] input[name=email]')?.value || S.ui.lastEmail; S.ui.otpPurpose = "reset"; S.ui.landing = "email"; viewLogin(); },
      "pw-send-code": async () => {
        const inp = document.querySelector('[data-form="login-pw"] input[name=email]');
        const email = (inp && inp.value.trim()) || S.ui.lastEmail || "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Scrivi prima la tua email"); inp?.focus(); return; }
        S.ui.lastEmail = email;
        b.disabled = true;
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
        if (error) { b.disabled = false; return toast(errMsg(error)); }
        store("it-forcepw", "1"); S.ui.otpPurpose = "reset"; S.ui.loginFailed = false; S.ui.loginEmail = email; viewLogin();
      },
      "otp-login": () => { S.ui.lastEmail = document.querySelector('[data-form="login-pw"] input[name=email]')?.value || S.ui.lastEmail; S.ui.otpPurpose = "login"; S.ui.landing = "email"; viewLogin(); },
      "wiz-next": () => { store("it-wizard-" + S.team.id, "3"); location.hash = "#/t/" + S.team.id + "/invita"; },
      "wiz-done": () => { store("it-wizard-" + S.team.id, null); location.hash = "#/t/" + S.team.id + "/trasferte"; toast("Tutto pronto!"); },
      "steps-hide": () => { store("it-steps-hide-" + S.team.id, "1"); renderTeam(); },
      "tips-ok": () => { store("it-tips", "1"); renderTeam(); },
      "legal-open": () => { S.ui.legalOpen = b.dataset.v; viewConsents(); document.querySelector(".modal")?.scrollTo(0, 0); },
      "legal-close": () => { S.ui.legalOpen = null; viewConsents(); },
      "data-export": () => exportMyData(),
      "del-ask": () => { S.ui.confirmDelete = true; viewProfile(); },
      "del-cancel": () => { S.ui.confirmDelete = false; viewProfile(); },
      "landing-create": () => { store("it-next", "#/new"); pendSet("it-pend", null); S.ui.landing = "signup"; viewLogin(); },
      "onb-to-code": () => { S.ui.landing = "code"; viewLogin(); },
      "onb-login-back": () => { const p = pendGet("it-pend"), nx = store("it-next") || ""; S.ui.landing = nx.startsWith("#/genitore/") ? "kidinv" : p && (p.kids || []).length ? "almost" : "welcome"; viewLogin(); },
      "onb-login": () => { S.ui.verifyEmail = null; S.ui.landing = "login"; viewLogin(); },
      "onb-loginpw": () => { S.ui.landing = "loginpw"; viewLogin(); },
      "onb-to-kidinv": () => { S.ui.landing = "kidinv"; viewLogin(); },
      "onb-to-kids": () => { S.ui.landing = "kids"; viewLogin(); },
      "onb-to-almost": () => { S.ui.landing = pendGet("it-pend") ? "almost" : "welcome"; viewLogin(); },
      "onb-signup": () => { S.ui.landing = "signup"; viewLogin(); },
      "onb-kid-add": () => { const f = document.querySelector('[data-form="onb-kids"]'); const p = pendGet("it-pend"); p.kids = onbReadKids(f); const last = (p.kids[p.kids.length - 1] || {}).last || ""; p.kids.push({ first: "", last }); pendSet("it-pend", p); viewLogin(); document.querySelector(`.onb-kid[data-i="${p.kids.length - 1}"] input`)?.focus(); },
      "onb-kid-del": () => { const f = document.querySelector('[data-form="onb-kids"]'); const p = pendGet("it-pend"); p.kids = onbReadKids(f); p.kids.splice(Number(b.dataset.i), 1); pendSet("it-pend", p); viewLogin(); },
      "onb-resend": async () => {
        const email = S.ui.verifyEmail || (pendGet("it-acct") || {}).email; if (!email) return;
        b.disabled = true; const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: !S.ui.verifyEmail } });
        b.disabled = false; toast(error ? errMsg(error) : "Codice inviato di nuovo");
      },
      "landing-join": () => { store("it-next", null); S.ui.landing = pendGet("it-pend") ? "kids" : "code"; viewLogin(); },
      "landing-login": () => { store("it-splash", "1"); S.ui.otpPurpose = null; S.ui.loginFailed = false; S.ui.landing = "login"; viewLogin(); },
      "splash-go": () => { store("it-splash", "1"); S.ui.landing = "welcome"; viewLogin(); },
      "landing-back": () => { if (S.ui.otpPurpose) { S.ui.otpPurpose = null; S.ui.landing = "login"; return viewLogin(); } store("it-next", null); pendSet("it-pend", null); S.ui.landing = "welcome"; S.ui.inviteName = null; viewLogin(); },
      "wait-refresh": () => viewHome(),
      "adults-inc": () => { const f = b.form, i = f.elements.adults; const free = f.dataset.free != null ? Number(f.dataset.free) : 99; const ath = f.querySelectorAll('input[name="athlete"]:checked').length; i.value = Math.min(8, Math.max(0, free - ath), (Number(i.value) || 0) + 1); updSeatsSum(f); },
      "adults-dec": () => { const f = b.form, i = f.elements.adults; i.value = Math.max(0, (Number(i.value) || 0) - 1); updSeatsSum(f); },
      "code-open": () => { S.ui.codeOpen = true; viewHome(); },
      "kid-more": () => { const box = b.closest(".kids"); const rows = box.querySelectorAll(".kid-row"); const last = rows[0]?.querySelector('input[name^="kl"]')?.value || ""; b.parentElement.insertAdjacentHTML("beforebegin", kidRow("", last, false)); box.querySelectorAll(".kid-row")[rows.length].querySelector("input").focus(); },
      "kid-more-multi": () => { const f = b.closest("form"); const box = f.querySelector(".kids-multi"); const i = box.querySelectorAll(".nk").length; const teams = f.dataset.codes.split(",").map((c) => ({ code: c, name: (S.ui.joinNames || {})[c] || c })); box.insertAdjacentHTML("beforeend", newKidCard(i, teams, S.profile.last_name, false)); box.querySelectorAll(".nk")[i].querySelector("input").focus(); },
      "ride-more": () => { S.ui.rideOpen = { ...(S.ui.rideOpen || {}), [id]: !(S.ui.rideOpen || {})[id] }; renderTeam(); },
      "all-rides": () => { S.ui.allRides = { ...(S.ui.allRides || {}), [id]: !(S.ui.allRides || {})[id] }; renderTeam(); },
      "all-reqs": () => { S.ui.allReqs = { ...(S.ui.allReqs || {}), [id]: !(S.ui.allReqs || {})[id] }; renderTeam(); },
      "code-open-p": () => { S.ui.codeOpen = true; viewProfile(); },
      "code-close-p": () => { S.ui.codeOpen = false; viewProfile(); },
      "kid-invite": () => { const gr = kidGroups().find((g) => g.key === id); if (gr) inviteParent(gr.recs.map((r) => r.id), [gr.first]); },
      "cat-filter": () => { store("it-cat", b.dataset.v || null); renderTeam(); },
      "kid-new": () => { S.ui.kidEdit = "new"; viewProfile(); },
      "kid-edit": () => { S.ui.kidEdit = id; viewProfile(); },
      "kid-cancel": () => { S.ui.kidEdit = null; viewProfile(); },
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

    b.disabled = true; if (b.tagName === "BUTTON") b.classList.add("is-busy");
    try {
      if (act === "logout-ask") { S.ui.confirmLogout = true; viewProfile(); return; }
      if (act === "logout-cancel") { S.ui.confirmLogout = false; viewProfile(); return; }
      if (act === "consent-toggle") { await saveConsent(b.dataset.k, b.checked); toast(b.checked ? "Consenso attivato" : "Consenso revocato"); return; }
      if (act === "del-account") {
        const { error } = await sb.rpc("delete_my_account"); if (error) throw error;
        S.ui = {}; try { localStorage.clear(); } catch (e) {}
        await sb.auth.signOut(); S.profile = null; location.hash = "#/"; toast("Account eliminato. Grazie per aver usato geniGO."); return;
      }
      if (act === "logout") { S.ui.confirmLogout = false; await sb.auth.signOut(); S.profile = null; location.hash = "#/"; return; }
      if (act === "kid-accept") {
        const { data, error } = await sb.rpc("accept_kid_invite", { p_token: id }); if (error) throw error;
        await loadMyKids(); S.myTeams = null; const t = data && data[0] && data[0].tid;
        toast("Benvenuto! Ora sei collegato come genitore"); if (t) store("it-last-team", t); location.hash = t ? "#/t/" + t + "/trasferte" : "#/"; return;
      }
      if (act === "unotice-ok") { const { error } = await sb.rpc("user_notice_seen", { p_id: Number(id) }); if (error) throw error; await reloadTeam(); return; }
      if (act === "notice-ok" || act === "notice-unlink") {
        const n = (S.notices || []).find((x) => String(x.id) === String(id));
        const { error } = act === "notice-ok" ? await sb.rpc("notice_seen", { p_id: Number(id) }) : await sb.rpc("unlink_parent", { p_athlete: n.athlete_id, p_user: n.new_parent });
        if (error) throw error;
        if (act === "notice-unlink") toast("Collegamento tolto");
        await reloadTeam(); return;
      }
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
        if (e && pax.length) { const L = tripLabel(e); S.ui.wa = pax.map((bk) => { const m = member(bk.booked_by); return { to: firstName(m.name), phone: m.phone, text: `Ciao ${firstName(m.name)}, purtroppo non posso più accompagnare ${bk.athlete_name} a ${L.trip} (${L.d}): il posto è di nuovo libero su geniGO.` }; }); }
      }
      if (act === "take") {
        const q = S.requests.find((x) => x.id === id), e = q && S.events.find((x) => x.id === q.event_id);
        const own = q && S.rides.some((r) => r.event_id === q.event_id && r.kind === "parent" && r.created_by === S.user.id);
        if (!own) { closeForms(); S.ui.takeNew = id; renderTeam(); return; }
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
      if (act === "regen") { const { error } = await sb.rpc("regenerate_invite", { p_team: S.team.id }); if (error) throw error; S.ui.grpCodes = {}; toast("Nuovo invito creato"); }
      if (act === "veh-toggle") { const v = S.vehicles.find((x) => x.id === id); const { error } = await sb.from("vehicles").update({ active: !v.active }).eq("id", id); if (error) throw error; }
      if (act === "veh-del") { const { error } = await sb.from("vehicles").delete().eq("id", id); if (error) throw error; toast("Mezzo eliminato"); }
      if (act === "del-team") { const { error } = await sb.from("teams").delete().eq("id", S.team.id); if (error) throw error; unsubscribe(); location.hash = "#/"; toast("Squadra eliminata"); return; }
      closeForms(); await reloadTeam();
    } catch (e) { toast(errMsg(e)); b.disabled = false; if (act === "toggle-approval") b.checked = !b.checked; }
  });

  // regole della password che si spuntano mentre si scrive
  document.addEventListener("input", (ev) => {
    const f = ev.target.form; if (!f || !f.elements.pw1) return;
    const rules = f.querySelector(".pw-rules"); if (!rules) return;
    const a = f.elements.pw1.value, b = f.elements.pw2 ? f.elements.pw2.value : "";
    const st = { len: a.length >= 8, mix: /[A-Za-zÀ-ÿ]/.test(a) && /\d/.test(a), eq: !!a && a === b };
    rules.querySelectorAll("[data-r]").forEach((x) => { const ok = st[x.dataset.r]; x.classList.toggle("ok", ok); x.textContent = (ok ? "✓ " : "○ ") + x.textContent.slice(2); });
  });

  document.addEventListener("change", (ev) => {
    if (ev.target.name === "athlete" && ev.target.form) updSeatsSum(ev.target.form);
    if (ev.target.name === "sp_all" && ev.target.form) ev.target.form.querySelectorAll(".sp-sports").forEach((x) => { x.hidden = ev.target.value !== "some"; });
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

  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && document.body.classList.contains("sheet-open")) { closeForms(); renderTeam(); } });
  document.addEventListener("submit", async (ev) => {
    const f = ev.target; ev.preventDefault();
    const kind = f.dataset.form; if (!kind) return;
    const fd = new FormData(f); const v = (k) => String(fd.get(k) ?? "").trim();
    const btn = f.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.classList.add("is-busy"); }
    try {
      if (kind === "onb-kids") {
        const kids = onbReadKids(f).filter((k) => k.first || k.last);
        const stop = (msg, sel) => { toast(msg); f.querySelector(sel)?.focus(); if (btn) btn.disabled = false; };
        if (!kids.length) return stop("Scrivi il nome del tuo atleta", "input");
        for (let i = 0; i < kids.length; i++) {
          if (!kids[i].first) return stop("Scrivi il nome", `[name="kf${i}"]`);
          if (!kids[i].last) return stop("Scrivi anche il cognome di " + kids[i].first, `[name="kl${i}"]`);
          if (!kids[i].codes.length) return stop("Spunta la squadra in cui gioca " + kids[i].first, `[name="kt${i}"]`);
        }
        const p = pendGet("it-pend"); p.kids = kids; pendSet("it-pend", p);
        S.ui.landing = "almost"; viewLogin(); return;
      }
      if (kind === "onb-signup") {
        const a = { first: v("first"), last: v("last"), email: v("email").toLowerCase(), terms: true, parent: true, news: fd.get("news") === "on", stats: fd.get("stats") === "on" };
        pendSet("it-acct", a); S.ui.lastEmail = a.email; S.ui.verifyEmail = null;
        // solo codice via email: se l'email ha già un account, il codice serve per entrare
        const { error } = await sb.auth.signInWithOtp({ email: a.email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true, data: { first_name: a.first, last_name: a.last } } });
        if (error) throw error;
        S.ui.landing = "verify"; viewLogin(); return;
      }
      if (kind === "onb-login") {
        const email = v("email").toLowerCase(); S.ui.lastEmail = email;
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
        if (error) {
          if (/signup|not allowed|not found/i.test(error.message || "")) { toast("Non troviamo un account con questa email: entra con il codice della squadra"); if (btn) btn.disabled = false; return; }
          throw error;
        }
        S.ui.verifyEmail = email; S.ui.landing = "verify"; viewLogin(); return;
      }
      if (kind === "onb-verify") {
        const email = S.ui.verifyEmail || (pendGet("it-acct") || {}).email, token = v("code").replace(/\s+/g, "");
        let r = await sb.auth.verifyOtp({ email, token, type: "email" });
        if (r.error) r = await sb.auth.verifyOtp({ email, token, type: "signup" });
        if (r.error) { toast("Codice non valido o scaduto"); if (btn) btn.disabled = false; return; }
        S.ui.landing = null; S.ui.verifyEmail = null; return; // il cambio di sessione apre l'app
      }
      if (kind === "login-pw") {
        S.ui.lastEmail = v("email");
        const { error } = await sb.auth.signInWithPassword({ email: v("email"), password: String(fd.get("password") || "") });
        if (error) { S.ui.loginFailed = true; viewLogin(); toast(/Invalid login/i.test(error.message || "") ? "Email o password non corretti." : errMsg(error)); return; }
        S.ui.loginFailed = false;
        store("it-forcepw", null); S.ui.landing = null; return; // il cambio di sessione apre l'app
      }
      if (kind === "login-email") {
        const email = v("email"); S.ui.lastEmail = email;
        const redirect = location.origin + location.pathname;
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: S.ui.otpPurpose !== "reset" && S.ui.otpPurpose !== "login" } });
        if (error) throw error;
        store("it-forcepw", S.ui.otpPurpose === "reset" ? "1" : null); // vale anche se si apre il link nella mail
        S.ui.loginEmail = email; viewLogin(); return;
      }
      if (kind === "login-code") {
        const { error } = await sb.auth.verifyOtp({ email: S.ui.loginEmail, token: v("code"), type: "email" });
        if (error) { toast("Codice non valido o scaduto"); if (btn) btn.disabled = false; return; }
        S.ui.loginEmail = null; S.ui.otpPurpose = null; S.ui.landing = null; return;
      }
      if (kind === "set-pw" || kind === "change-pw") {
        const r = await savePassword(fd);
        if (r === "nonce") {
          toast("Ti abbiamo mandato un codice via email");
          if (kind === "set-pw") viewSetPassword(); else { await viewProfile(); document.getElementById("sicurezza")?.scrollIntoView(); }
          const nf = document.querySelector(`[data-form="${kind}"]`); // non far riscrivere la password
          if (nf) { nf.elements.pw1.value = fd.get("pw1"); nf.elements.pw2.value = fd.get("pw2"); nf.elements.nonce?.focus(); nf.elements.pw1.dispatchEvent(new Event("input", { bubbles: true })); }
          return;
        }
        store("it-forcepw", null);
        toast(kind === "set-pw" ? "Password salvata" : "Password cambiata");
        if (kind === "set-pw") route(); else viewProfile();
        return;
      }
      if (kind === "profile-name") {
        if (!telOk(v("phone"))) { toast("Scrivi un numero di cellulare valido"); if (btn) btn.disabled = false; return; }
        const upd = { first_name: v("first"), last_name: v("last"), display_name: fullName(v("first"), v("last")) }; if (fd.has("phone")) upd.phone = v("phone");
        if (S.myKids === null) { delete upd.first_name; delete upd.last_name; } // database non ancora aggiornato
        const { error } = await sb.from("profiles").update(upd).eq("id", S.user.id); if (error) throw error;
        Object.assign(S.profile, upd); toast("Salvato");
        if ((location.hash || "#/").startsWith("#/profilo")) location.hash = "#/"; else route();
        return;
      }
      if (kind === "fill-names") {
        if (fd.has("first")) {
          const upd = { first_name: v("first"), last_name: v("last"), display_name: fullName(v("first"), v("last")) };
          const { error } = await sb.from("profiles").update(upd).eq("id", S.user.id); if (error) throw error; Object.assign(S.profile, upd);
        }
        for (const [k, val] of fd.entries()) {
          if (!k.startsWith("kidf-")) continue;
          const ids = k.slice(5).split(","), last = String(fd.get("kidl-" + k.slice(5)) || "").trim();
          for (const aid of ids) { const { error } = await sb.rpc("update_athlete", { p_id: aid, p_first: String(val).trim(), p_last: last }); if (error) throw error; }
        }
        await loadMyKids(); toast("Grazie!"); route(); return;
      }
      if (kind === "kid") {
        const first = v("first"), last = v("last"), want = fd.getAll("team");
        const gr = f.dataset.key ? kidGroups().find((g) => g.key === f.dataset.key) : null;
        if (!gr && !want.length) { toast("Scegli almeno una squadra"); if (btn) btn.disabled = false; return; }
        if (gr) {
          for (const r of gr.recs) {
            if (!want.includes(r.team_id)) { const { error } = await sb.rpc("remove_my_athlete", { p_id: r.id }); if (error) throw error; }
            else if (r.first_name !== first || r.last_name !== last) { const { error } = await sb.rpc("update_athlete", { p_id: r.id, p_first: first, p_last: last }); if (error) throw error; }
          }
        }
        for (const tid of want) {
          if (gr && gr.recs.some((r) => r.team_id === tid)) continue;
          const kid = { first, last };
          const link = await resolveKid(kid, { team: tid });
          await addKids(tid, [kid], [link]);
        }
        S.ui.kidEdit = null; toast(gr && !want.length ? "Tolto" : "Salvato"); await loadKidsCtx(); viewProfile(); offerParentInvite(); return;
      }
      if (kind === "consents") {
        if (!fd.get("terms") || !fd.get("parent")) { toast("Per continuare servono le due spunte obbligatorie"); if (btn) btn.disabled = false; return; }
        await saveConsent("terms", true); await saveConsent("parent", true);
        for (const k of ["news", "stats"]) { const want = fd.get(k) === "on"; if (want !== hasConsent(k) || !(S.consents && S.consents[k])) await saveConsent(k, want); }
        S.ui.legalOpen = null; route(); return;
      }
      if (kind === "landing-code") {
        const code = v("code").toUpperCase().replace(/\s+/g, "");
        const all = await expandCodes([code]);
        const ts = (await Promise.all(all.map((c) => sb.rpc("preview_invite", { p_code: c }).then((r) => (r.data && r.data[0]) || null, () => null)))).filter(Boolean);
        if (!ts.length) { toast(ERRORS.invalid_code); if (btn) btn.disabled = false; return; }
        await loadInvitePend(code); S.ui.landing = "kids"; viewLogin(); return;
      }
      if (kind === "code-join") { S.ui.codeOpen = false; location.hash = "#/join/" + encodeURIComponent(v("code").toUpperCase().replace(/\s+/g, "")); return; }
      if (kind === "join-any") {
        const codes = f.dataset.codes.split(","), multi = codes.length > 1, G = S.ui.joinGroups || [], names = S.ui.joinNames || {};
        const stop = (msg, el) => { toast(msg); el?.focus(); if (btn) btn.disabled = false; };
        const entries = [];
        if (!multi) {
          fd.getAll("ek").forEach((i) => G[i] && entries.push({ first: G[i].first, last: G[i].last, codes: [codes[0]], existing: true }));
          const nk = readKids(fd);
          if (kidsMissingSurname(nk)) return stop("Scrivi anche il cognome dell'atleta");
          nk.forEach((k) => entries.push({ ...k, codes: [codes[0]] }));
        } else {
          G.forEach((g, i) => { const cs = fd.getAll("ek-" + i); if (cs.length) entries.push({ first: g.first, last: g.last, codes: cs, existing: true }); });
          for (let i = 0; f.elements["nf" + i]; i++) {
            const first = v("nf" + i), last = v("nl" + i); if (!first) continue;
            if (!last) return stop("Scrivi anche il cognome di " + first, f.elements["nl" + i]);
            const cs = fd.getAll("nt" + i); if (!cs.length) return stop("Spunta le squadre in cui gioca " + first);
            entries.push({ first, last, codes: cs });
          }
        }
        if (!entries.length) return stop(multi ? "Indica almeno un atleta e le squadre in cui gioca" : "Indica almeno un atleta");
        return doJoin(entries, codes, names, multi);
      }
      if (kind === "new-team") {
        const kids = readKids(fd);
        if (kidsMissingSurname(kids)) { toast("Scrivi anche il cognome dell'atleta"); if (btn) btn.disabled = false; return; }
        const { data, error } = await sb.rpc("create_team", { p_name: v("name"), p_sport: S.ui.newSport || "basket", p_category: v("category"), p_season: v("season"), p_athletes: "" });
        if (error) throw error;
        try { await addKids(data.id, kids, []); await loadMyKids(); offerParentInvite(); } catch (e) { toast(errMsg(e)); }
        S.ui.newSport = null; try { await saveConsent("club", true, data.id); } catch (e) { /* registro facoltativo */ } store("it-wizard-" + data.id, "2"); store("it-last-team", data.id); toast("Squadra creata"); location.hash = "#/t/" + data.id + "/trasferte"; return;
      }
      if (kind === "event") {
        const row = { team_id: f.dataset.id ? evTeam(f.dataset.id) : targetTeam(false).id, title: v("title"), starts_at: toISO(v("date"), v("time")), place: v("place"), notes: v("notes"), km_round_trip: v("km") ? Number(v("km")) : null };
        const q = f.dataset.id ? sb.from("events").update(row).eq("id", f.dataset.id) : sb.from("events").insert({ ...row, created_by: S.user.id });
        const { error } = await q; if (error) throw error; toast(f.dataset.id ? "Trasferta aggiornata" : "Trasferta aggiunta");
      }
      if (kind === "offer" || kind === "club") {
        if (!v("time")) { toast("Indica l'orario di partenza"); f.elements.time?.focus(); if (btn) btn.disabled = false; return; }
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
      if (kind === "take-new") {
        const q = S.requests.find((x) => x.id === f.dataset.id), e = S.events.find((x) => x.id === f.dataset.event);
        if (!q) { toast("La richiesta non c'è più"); S.ui.takeNew = null; await reloadTeam(); return; }
        const phone = v("phone") || S.profile.phone || "";
        if (!telOk(phone)) { toast("Scrivi un numero di cellulare valido"); if (btn) btn.disabled = false; return; }
        if (!driverOk()) { if (fd.get("driver") !== "on") { toast("Per offrire un passaggio serve la dichiarazione del conducente"); if (btn) btn.disabled = false; return; } await saveConsent("driver", true, season()); }
        const { data: nr, error } = await sb.from("rides").insert({ event_id: q.event_id, team_id: q.team_id, kind: "parent", driver_user_id: S.user.id, driver_name: S.profile.display_name, driver_phone: phone, seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), notes: "", return_trip: fd.get("back") === "on", created_by: S.user.id }).select("id").single();
        if (error) throw error;
        if (v("phone") && !S.profile.phone) { S.profile.phone = v("phone"); sb.from("profiles").update({ phone: v("phone") }).eq("id", S.user.id).then(() => {}); }
        const t = await sb.rpc("take_request", { p_request: q.id });
        S.ui.takeNew = null;
        if (t.error) { toast("Auto pubblicata, ma la richiesta non è più disponibile"); await reloadTeam(); return; }
        toast("Fatto: la tua auto è pubblicata e porti tu " + (q.no_athlete ? "gli adulti" : q.athlete_name));
        if (e) { const L = tripLabel(e), m = member(q.requested_by); S.ui.wa = [{ to: firstName(m.name), phone: m.phone, text: `Ciao ${firstName(m.name)}, porto io ${q.no_athlete ? "voi" : q.athlete_name} a ${L.trip} (${L.d}). Parto da ${v("from") || "—"}${v("time") ? " alle " + v("time") : ""}.` }]; }
        if (nr && e && e.place && v("from")) estimateKm(v("from"), e.place).then(async (km) => { if (km != null) { await sb.rpc("set_ride_km", { p_ride: nr.id, p_km: km }); } });
        await reloadTeam(); return;
      }
      if (kind === "req") {
        const who = fd.getAll("athlete").map((x) => String(x).trim()).filter(Boolean);
        const adQ = Math.max(0, Math.min(8, Number(v("adults")) || 0));
        if (!who.length && !adQ) { toast("Scegli per chi chiedi il passaggio, o indica quanti adulti"); if (btn) btn.disabled = false; return; }
        if (!who.length) {
          // solo adulti
          const { error } = await sb.from("ride_requests").insert({ event_id: f.dataset.id, team_id: evTeam(f.dataset.id), athlete_name: ("Adulti di " + (S.profile.display_name || "un genitore")).slice(0, 60), no_athlete: true, adults: adQ, depart_from: v("from"), direction: v("direction") || "ar", requested_by: S.user.id });
          if (error) { if (/duplicate|unique/i.test(error.message || "")) { toast("Hai già chiesto un passaggio per adulti su questa trasferta"); if (btn) btn.disabled = false; return; } throw error; }
          toast("Richiesta pubblicata"); S.ui.req = null; await reloadTeam(); return;
        }
        for (const [i, a] of who.entries()) {
          const row = { event_id: f.dataset.id, team_id: evTeam(f.dataset.id), athlete_name: a, depart_from: v("from"), direction: v("direction") || "ar", requested_by: S.user.id };
          if (adQ && i === 0) row.adults = adQ; // gli adulti viaggiano con il primo atleta
          const { error } = await sb.from("ride_requests").insert(row);
          if (error) { if (/duplicate|unique/i.test(error.message || "")) { toast("Per " + a + " c'è già una richiesta"); if (btn) btn.disabled = false; return; } throw error; }
        }
        toast(who.length > 1 ? "Richieste pubblicate" : "Richiesta pubblicata");
      }
      if (kind === "club") {
        const { error } = await sb.from("rides").insert({ event_id: f.dataset.id, team_id: evTeam(f.dataset.id), kind: "club", vehicle_id: v("vehicle"), driver_name: v("driver"), seats: Number(v("seats")), depart_time: v("time"), depart_from: v("from"), return_trip: fd.get("back") === "on", assignment: v("assignment"), created_by: S.user.id });
        if (error) throw error; toast("Mezzo aggiunto");
      }
      if (kind === "book") {
        S.ui.wa = null;
        const who = fd.getAll("athlete").map((x) => String(x).trim()).filter(Boolean);
        const adB = Math.max(0, Math.min(8, Number(v("adults")) || 0));
        if (!who.length && !adB) { toast("Scegli chi sale, o indica quanti adulti"); if (btn) btn.disabled = false; return; }
        const freeB = f.dataset.free != null ? Number(f.dataset.free) : 99;
        if (who.length + adB > freeB) { toast(`Posti insufficienti: ${who.length + adB} persone su ${freeB} ${freeB === 1 ? "posto libero" : "posti liberi"}`); if (btn) btn.disabled = false; return; }
        if (!who.length) who.push(""); // solo adulti
        const done = [];
        try { for (const a of who) { const args = { p_ride: f.dataset.id, p_athlete: a, p_pickup: v("pickup") }; if (adB && !done.length) args.p_adults = adB; const { error } = await sb.rpc("book_seat", args); if (error) throw error; done.push(a); } }
        catch (err) { if (!done.length) throw err; toast(errMsg(err)); }
        if (done.length === who.length) toast(done.length > 1 ? "Posti confermati" : "Posto confermato");
        const r = S.rides.find((x) => x.id === f.dataset.id), e = r && S.events.find((x) => x.id === r.event_id);
        const names = done.join(" e ");
        if (r && e && r.kind === "parent" && r.created_by !== S.user.id) { const L = tripLabel(e); S.ui.wa = [{ to: firstName(r.driver_name), phone: driverPhone(r), text: `Ciao ${firstName(r.driver_name)}, ho prenotato ${done.filter(Boolean).length + adB > 1 ? (done.filter(Boolean).length + adB) + " posti per" : "un posto per"} ${done.filter(Boolean).length ? done.filter(Boolean).join(" e ") + (adB ? ` e ${adB} ${adB === 1 ? "adulto" : "adulti"}` : "") : `${adB} ${adB === 1 ? "adulto" : "adulti"}`} nella tua auto per ${L.trip} (${L.d}).${v("pickup") ? " Sale" + (done.length > 1 ? "no" : "") + " a " + v("pickup") + "." : ""} Grazie!` }]; }
      }
      if (kind === "sponsor") {
        const scope = f.dataset.scope, file = fd.get("logo");
        const vid = false;
        if (file && file.size && !/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Formato non supportato: usa un'immagine JPG, PNG o WEBP"); if (btn) btn.disabled = false; return; }
        if (file && file.size > 25 * 1048576) { toast("Immagine troppo grande (max 25 MB)"); if (btn) btn.disabled = false; return; }
        const link = v("link");
        if (link && !/^https?:\/\//i.test(link)) { toast("Il link deve iniziare con https://"); if (btn) btn.disabled = false; return; }
        const secs = Math.min(60, Math.max(3, Math.round(Number(v("seconds")) || 6)));
        const row = { name: v("name"), message: v("message"), link_url: link, starts_on: v("from") || null, ends_on: v("to") || null, active: fd.get("active") === "on", seconds: secs };
        if (scope === "platform") {
          const sp = fd.get("sp_all") === "some" ? fd.getAll("sports") : [];
          if (fd.get("sp_all") === "some" && !sp.length) { toast("Spunta almeno uno sport, oppure scegli «Tutti gli sport»"); if (btn) btn.disabled = false; return; }
          row.sports = sp.length ? sp : null;
        }
        if (file && file.size) {
          if (btn) { btn.classList.remove("is-busy"); btn.textContent = "Ottimizzo l'immagine…"; }
          const img = await optimizeImage(file);
          if (img.size > 2 * 1048576) { toast("Immagine ancora troppo pesante dopo l'ottimizzazione: prova con una più piccola"); if (btn) { btn.disabled = false; btn.textContent = f.dataset.id ? "Salva" : "Aggiungi sponsor"; } return; }
          const ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[img.type] || "jpg";
          const path = (scope === "platform" ? "platform" : S.team.id) + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "." + ext;
          const up = await sb.storage.from("sponsor-logos").upload(path, img, { contentType: img.type, upsert: false });
          if (img !== file) toast(`Immagine ottimizzata: da ${fmtSize(file.size)} a ${fmtSize(img.size)}`);
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
        if (btn) { btn.classList.remove("is-busy"); btn.textContent = "Sto leggendo…"; }
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
