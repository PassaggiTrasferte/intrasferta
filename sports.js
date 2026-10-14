// Etichette per sport: così ogni squadra vede le parole giuste
window.SPORTS = {
  basket:    { label: "Basket",              place: "Palestra / Palazzetto", time: "Palla a due",      event: "Partita" },
  calcio:    { label: "Calcio",              place: "Campo",                 time: "Calcio d’inizio",  event: "Partita" },
  volley:    { label: "Pallavolo",           place: "Palestra / Palazzetto", time: "Inizio partita",   event: "Partita" },
  rugby:     { label: "Rugby",               place: "Campo",                 time: "Calcio d’inizio",  event: "Partita" },
  futsal:    { label: "Calcio a 5",          place: "Palestra / Palazzetto", time: "Inizio partita",   event: "Partita" },
  waterpolo: { label: "Pallanuoto",          place: "Piscina",               time: "Inizio partita",   event: "Partita" },
  handball:  { label: "Pallamano",           place: "Palestra / Palazzetto", time: "Inizio partita",   event: "Partita" },
  hockey:    { label: "Hockey",              place: "Campo / Pista",         time: "Inizio partita",   event: "Partita" },
  baseball:  { label: "Baseball / Softball", place: "Campo",                 time: "Inizio partita",   event: "Partita" },
  altro:     { label: "Altro sport",         place: "Luogo",                 time: "Orario di inizio", event: "Evento"  }
};
window.SPORT_ORDER = ["basket","calcio","volley","rugby","futsal","waterpolo","handball","hockey","baseball","altro"];
