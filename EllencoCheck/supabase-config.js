/*
 * EllencoCheck - Configuração do Supabase
 *
 * Cole aqui a URL e a chave ANON/PUBLISHABLE do seu projeto Supabase.
 * A chave ANON/PUBLISHABLE pode ficar no frontend. NUNCA coloque a
 * service_role key neste arquivo.
 */
window.ELLENCO_SUPABASE_URL = "https://sjqnoqolvvzmobwyaevg.supabase.co";
window.ELLENCO_SUPABASE_ANON_KEY = "sb_publishable_LAqCbP38n-FLIjpX7njfLg_qsz8w_kK";

window.ellencoSupabase = supabase.createClient(
    window.ELLENCO_SUPABASE_URL,
    window.ELLENCO_SUPABASE_ANON_KEY
);
