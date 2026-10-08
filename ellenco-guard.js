/* EllencoCheck - proteção de páginas internas (index, histórico, usuários)
 *
 * Objetivo: o conteúdo da página NUNCA aparece antes de a sessão ser
 * confirmada. Fluxo:
 *   1) Este script roda no <head>, antes de qualquer conteúdo ser desenhado,
 *      e esconde a página (classe "auth-pending").
 *   2) Se nem existe uma sessão salva neste navegador, redireciona para o
 *      login na hora (sem carregar nada).
 *   3) Se existe, a página confirma a sessão no servidor e só então chama
 *      ellencoLiberarPagina() para exibir o conteúdo. Se a sessão não valer,
 *      redireciona para o login e a página continua escondida.
 *
 * Importante: isto é proteção de interface. A proteção real dos dados deve
 * continuar nas regras de acesso (RLS) do Supabase.
 */
(function () {
    var LOGIN = "./login.html";
    var raiz = document.documentElement;

    // esconde tudo e mostra apenas um indicador de carregamento
    var css = document.createElement("style");
    css.id = "ellenco-guard-css";
    css.textContent =
        "html.auth-pending body{visibility:hidden!important}" +
        "html.auth-pending{background:#f1f5f9}" +
        "html.dark.auth-pending{background:#0c0c0d}" +
        "html.auth-pending::after{content:'';position:fixed;top:50%;left:50%;width:32px;height:32px;margin:-16px 0 0 -16px;" +
        "border:3px solid rgba(128,128,128,.35);border-top-color:#EE3237;border-radius:50%;" +
        "animation:ellencoSpin .8s linear infinite;visibility:visible}" +
        "@keyframes ellencoSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(css);
    raiz.classList.add("auth-pending");

    function irParaLogin() {
        location.replace(LOGIN); // replace: o botão "voltar" não reabre a página protegida
    }

    // sessão salva pelo supabase-js (chave sb-<projeto>-auth-token)
    function temSessaoLocal() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (/^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
            }
        } catch (e) { }
        return false;
    }

    if (!temSessaoLocal()) {
        irParaLogin();
        return;
    }

    window.ellencoLiberarPagina = function () {
        raiz.classList.remove("auth-pending");
    };

    // Falha segura: se a verificação não terminar em 20 s, não deixa a página aberta.
    var limite = setTimeout(function () {
        if (raiz.classList.contains("auth-pending")) irParaLogin();
    }, 20000);
    var liberarOriginal = window.ellencoLiberarPagina;
    window.ellencoLiberarPagina = function () {
        clearTimeout(limite);
        liberarOriginal();
    };

    // Voltar pelo histórico do navegador (cache) após sair: revalida a sessão.
    window.addEventListener("pageshow", function (e) {
        if (e.persisted) location.reload();
    });
})();
