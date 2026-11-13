/* EllencoCheck - tema claro/escuro
   - Por padrão segue o tema do dispositivo (e acompanha mudanças dele).
   - Se o usuário clicar no botão de tema, a escolha fica salva e passa a valer. */
(function () {
    var CHAVE = "ellencocheck_tema";
    var raiz = document.documentElement;
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    function salvo() {
        try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
    }

    function aplicar() {
        var t = salvo();
        var escuro = t === "dark" || (t !== "light" && !!(mq && mq.matches));
        raiz.classList.toggle("dark", escuro);
    }

    window.alternarTema = function () {
        var escuro = raiz.classList.toggle("dark");
        try { localStorage.setItem(CHAVE, escuro ? "dark" : "light"); } catch (e) { }
    };

    aplicar();

    if (mq) {
        if (mq.addEventListener) mq.addEventListener("change", aplicar);
        else if (mq.addListener) mq.addListener(aplicar);
    }
})();
