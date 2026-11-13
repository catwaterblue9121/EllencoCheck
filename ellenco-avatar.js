/* EllencoCheck - foto de perfil (Supabase Storage, bucket público "avatares") */
(function () {
    var BUCKET = "avatares";

    function url(sb, path) {
        return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
    }

    // Mostra a foto no elemento; sem foto, mostra a inicial do nome.
    function pintar(sb, el, nome, path) {
        if (!el) return;
        var u = url(sb, path);
        el.textContent = "";
        el.style.backgroundImage = "";
        if (u) {
            el.style.backgroundImage = 'url("' + u + '")';
            el.style.backgroundSize = "cover";
            el.style.backgroundPosition = "center";
        } else {
            el.textContent = (String(nome || "").trim().charAt(0) || "?").toUpperCase();
        }
    }

    // Recorte quadrado central, 400x400, JPEG
    async function reduzir(file, lado) {
        lado = lado || 400;
        if (!file || !file.type || file.type.indexOf("image/") !== 0) {
            throw new Error("O arquivo selecionado não é uma imagem.");
        }
        var obj = URL.createObjectURL(file);
        try {
            var img = await new Promise(function (ok, erro) {
                var i = new Image();
                i.onload = function () { ok(i); };
                i.onerror = function () { erro(new Error("Não foi possível ler a imagem.")); };
                i.src = obj;
            });
            var menor = Math.min(img.naturalWidth, img.naturalHeight);
            var sx = (img.naturalWidth - menor) / 2, sy = (img.naturalHeight - menor) / 2;
            var c = document.createElement("canvas");
            c.width = c.height = lado;
            var ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, lado, lado);
            ctx.drawImage(img, sx, sy, menor, menor, 0, 0, lado, lado);
            var blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.85); });
            if (!blob) throw new Error("Falha ao processar a imagem.");
            return blob;
        } finally {
            URL.revokeObjectURL(obj);
        }
    }

    function traduzir(e) {
        var m = (e && e.message) || String(e);
        if (/avatar_path|bucket|not found|row-level security|policy/i.test(m)) {
            return "o banco ainda não está preparado para fotos. Execute o arquivo supabase_update_v5.sql no SQL Editor do Supabase.";
        }
        return m;
    }

    // Envia a nova foto, grava no perfil e apaga a anterior. Devolve o novo caminho.
    async function enviar(sb, userId, file, antigo) {
        try {
            var blob = await reduzir(file);
            var novo = userId + "/" + Date.now() + ".jpg";
            var up = await sb.storage.from(BUCKET).upload(novo, blob, { contentType: "image/jpeg", upsert: false });
            if (up.error) throw up.error;
            var upd = await sb.from("profiles").update({ avatar_path: novo }).eq("id", userId);
            if (upd.error) {
                await sb.storage.from(BUCKET).remove([novo]);
                throw upd.error;
            }
            if (antigo) { try { await sb.storage.from(BUCKET).remove([antigo]); } catch (e) { } }
            return novo;
        } catch (e) {
            throw new Error(traduzir(e));
        }
    }

    async function remover(sb, userId, antigo) {
        var r = await sb.from("profiles").update({ avatar_path: null }).eq("id", userId);
        if (r.error) throw new Error(traduzir(r.error));
        if (antigo) { try { await sb.storage.from(BUCKET).remove([antigo]); } catch (e) { } }
    }

    window.EllencoAvatar = { url: url, pintar: pintar, enviar: enviar, remover: remover };
})();
