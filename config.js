// =====================================================================
// InTrasferta · configurazione
// Copia qui i due valori da Supabase › Project Settings › API.
// La "anon public key" è pensata per stare nel browser: i dati sono
// protetti dalle regole di sicurezza del database (schema.sql).
// =====================================================================
window.INTRASFERTA_CONFIG = {
  SUPABASE_URL: "https://msiivysibixilgpjtiua.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaWl2eXNpYml4aWxncGp0aXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzA3MTcsImV4cCI6MjEwNzU0NjcxN30.g81O3JsBMjNYmGFhyCqRTm_MPOY5HzsT2og7bCtomZo",

  // true dopo aver pubblicato la funzione "import-calendar" (vedi GUIDA.md)
  AI_IMPORT_ENABLED: false,

  // Testo mostrato nei piè di pagina e nei messaggi di invito
  APP_NAME: "InTrasferta",
  SUPPORT_EMAIL: "support@genigo.it"
};
