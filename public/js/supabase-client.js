// js/supabase-client.js
// Singleton do cliente Supabase. Importa a lib via CDN no <head> de cada página.

(function () {
  if (!window.supabase) {
    console.error('[pmo] supabase-js não carregado. Adicione o <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    return;
  }
  const cfg = window.PMO_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    console.error('[pmo] window.PMO_CONFIG ausente ou não configurado — preencha js/config.js');
    return;
  }
  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
})();
