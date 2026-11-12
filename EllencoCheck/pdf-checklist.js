/*
 * EllencoCheck - Gerador de PDF das inspeções (checklists)
 *
 * Requer (carregados antes deste arquivo):
 *   - jsPDF 2.5.x            (window.jspdf.jsPDF)
 *   - jspdf-autotable 3.8.x  (plugin: doc.autoTable)
 *
 * Uso na página:
 *   await EllencoPDF.gerar(window.ellencoSupabase, idDaInspecao);              // baixa o PDF
 *   await EllencoPDF.gerar(window.ellencoSupabase, idDaInspecao, { acao: "abrir" }); // abre em nova aba
 *
 * Identidade visual: azul #113A6E, vermelho #EE3237, títulos em itálico/negrito
 * e wordmark "Ellenco" + "Check", iguais aos das telas do sistema.
 */
(function (root) {
    "use strict";

    const BUCKET_FOTOS = "inspecao-fotos";
    const FUSO = "America/Sao_Paulo";

    const COR = {
        azul: [17, 58, 110],
        azulEscuro: [13, 46, 88],
        azulClaro: [230, 236, 245],
        vermelho: [238, 50, 55],
        vermelhoClaro: [254, 236, 236],
        verde: [5, 150, 105],
        verdeClaro: [220, 245, 234],
        ambar: [217, 119, 6],
        ambarClaro: [254, 243, 220],
        cinza: [100, 116, 139],
        cinzaClaro: [241, 245, 249],
        borda: [226, 232, 240],
        texto: [30, 41, 59],
        branco: [255, 255, 255]
    };

    const PAG = { w: 210, h: 297, ml: 14, mr: 14, topo: 24, rodape: 18 };
    const LARGURA = PAG.w - PAG.ml - PAG.mr; // 182 mm

    const STATUS_ITEM = {
        OK: { rotulo: "OK", cor: COR.verde, fundo: COR.verdeClaro },
        ATENCAO: { rotulo: "ATENÇÃO", cor: COR.ambar, fundo: COR.ambarClaro },
        PROBLEMA: { rotulo: "PROBLEMA", cor: COR.vermelho, fundo: COR.vermelhoClaro },
        NAO_APLICAVEL: { rotulo: "N/A", cor: COR.cinza, fundo: COR.cinzaClaro }
    };

    const STATUS_CHECKLIST = {
        APROVADO: { rotulo: "APROVADO PARA OPERAÇÃO", cor: COR.verde },
        APROVADO_COM_OBSERVACAO: { rotulo: "APROVADO COM OBSERVAÇÃO", cor: COR.ambar },
        REPROVADO: { rotulo: "REPROVADO - AVARIA / INCIDENTE", cor: COR.vermelho }
    };

    /* ------------------------------------------------------------------ */
    /* Utilitários                                                        */
    /* ------------------------------------------------------------------ */

    // Fontes padrão do PDF só aceitam Latin-1 + pontuação comum. Remove emojis etc.
    function limpar(valor) {
        return String(valor ?? "")
            .replace(/\r\n?/g, "\n")
            .replace(/[^\u0009\u000A\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "")
            .trim();
    }

    function fmtDataHora(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d)) return "—";
        return d.toLocaleString("pt-BR", {
            timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function fmtDataArquivo(iso) {
        const d = iso ? new Date(iso) : new Date();
        const partes = new Intl.DateTimeFormat("en-CA", {
            timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit"
        }).format(isNaN(d) ? new Date() : d);
        return partes; // AAAA-MM-DD
    }

    function fmtHorimetro(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return "—";
        return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " h";
    }

    function pad(n, tam) {
        return String(n ?? "").padStart(tam, "0");
    }

    function slug(texto) {
        return limpar(texto)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "equipamento";
    }

    function nomeArquivo(dados) {
        return `Inspecao-${pad(dados.id, 4)}-${slug(dados.equipamento.nome)}-${fmtDataArquivo(dados.realizado_em)}.pdf`;
    }

    function jsPDFClass() {
        const ctor = root.jspdf && root.jspdf.jsPDF;
        if (!ctor) throw new Error("Biblioteca jsPDF não foi carregada.");
        return ctor;
    }

    /* ------------------------------------------------------------------ */
    /* Busca de dados no Supabase                                          */
    /* ------------------------------------------------------------------ */

    async function buscarDados(sb, checklistId) {
        const { data, error } = await sb
            .from("checklists")
            .select(`
                id, horimetro, status, observacoes, realizado_em,
                equipamentos ( id, nome, patrimonio, prefixo, modelo, fabricante, placa, ano,
                               tipos_equipamentos ( nome ) ),
                profiles ( nome, email ),
                respostas_checklist ( id, status, observacao, foto_nome, foto_path, item_inspecao_id,
                                      itens_inspecao ( id, nome, descricao, categoria, ordem ) )
            `)
            .eq("id", checklistId)
            .single();

        if (error) throw error;
        if (!data) throw new Error("Inspeção não encontrada.");

        const eq = data.equipamentos || {};
        const respostas = (data.respostas_checklist || []).map(r => ({
            item_id: r.item_inspecao_id,
            ordem: r.itens_inspecao?.ordem ?? 0,
            categoria: r.itens_inspecao?.categoria || "Geral",
            nome: r.itens_inspecao?.nome || `Item ${r.item_inspecao_id}`,
            descricao: r.itens_inspecao?.descricao || "",
            status: r.status,
            observacao: r.observacao || "",
            foto_nome: r.foto_nome || null,
            foto_path: r.foto_path || null,
            foto: null
        }));

        respostas.sort((a, b) => (a.ordem - b.ordem) || (a.item_id - b.item_id));

        return {
            id: data.id,
            realizado_em: data.realizado_em,
            status: data.status,
            horimetro: data.horimetro,
            observacoes: data.observacoes || "",
            equipamento: {
                nome: eq.nome || "Equipamento não disponível",
                tipo: eq.tipos_equipamentos?.nome || "",
                modelo: eq.modelo || "",
                fabricante: eq.fabricante || "",
                patrimonio: eq.patrimonio || "",
                prefixo: eq.prefixo || "",
                placa: eq.placa || "",
                ano: eq.ano || ""
            },
            inspetor: {
                nome: data.profiles?.nome || "—",
                email: data.profiles?.email || ""
            },
            respostas
        };
    }

    function blobParaDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = () => resolve(leitor.result);
            leitor.onerror = () => reject(leitor.error);
            leitor.readAsDataURL(blob);
        });
    }

    // Baixa do Storage as fotos das avarias. Falha em uma foto não impede o PDF.
    async function carregarFotos(sb, dados) {
        const comFoto = dados.respostas.filter(r => r.foto_path);
        await Promise.all(comFoto.map(async r => {
            try {
                const { data, error } = await sb.storage.from(BUCKET_FOTOS).download(r.foto_path);
                if (error || !data) throw error || new Error("sem dados");
                r.foto = await blobParaDataUrl(data);
            } catch (e) {
                console.warn("Não foi possível carregar a foto do item", r.item_id, e);
                r.foto = null;
            }
        }));
        return dados;
    }

    /* ------------------------------------------------------------------ */
    /* Elementos visuais                                                   */
    /* ------------------------------------------------------------------ */

    function cor(doc, tipo, c) {
        if (tipo === "fill") doc.setFillColor(c[0], c[1], c[2]);
        else if (tipo === "draw") doc.setDrawColor(c[0], c[1], c[2]);
        else doc.setTextColor(c[0], c[1], c[2]);
    }

    // Marca: quadrado azul arredondado com o ícone do sistema
    function desenharLogo(doc, x, y, t) {
        cor(doc, "fill", COR.azul);
        doc.roundedRect(x, y, t, t, t * 0.22, t * 0.22, "F");

        const k = t / 24;
        cor(doc, "draw", COR.branco);
        doc.setLineWidth(0.5);
        [9, 15].forEach(px => {
            doc.line(x + px * k, y + 8 * k, x + px * k, y + 16 * k);
            doc.circle(x + px * k, y + 6 * k, 1.7 * k, "S");
            doc.circle(x + px * k, y + 18 * k, 1.7 * k, "S");
        });
    }

    function desenharWordmark(doc, x, y, tamanho) {
        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(tamanho);
        cor(doc, "text", COR.azul);
        doc.text("Ellenco", x, y);
        const larg = doc.getTextWidth("Ellenco");
        cor(doc, "text", COR.vermelho);
        doc.text("Check", x + larg, y);
    }

    function cabecalhoPrimeiraPagina(doc, d) {
        cor(doc, "fill", COR.vermelho);
        doc.rect(0, 0, PAG.w, 3.5, "F");

        desenharLogo(doc, PAG.ml, 9, 13);
        desenharWordmark(doc, PAG.ml + 16.5, 17.5, 20);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        cor(doc, "text", COR.cinza);
        doc.text("GESTÃO DE INSPEÇÕES", PAG.ml + 16.7, 21.6);

        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(13);
        cor(doc, "text", COR.azul);
        doc.text("RELATÓRIO DE INSPEÇÃO", PAG.w - PAG.mr, 14.5, { align: "right" });

        doc.setFontSize(11.5);
        cor(doc, "text", COR.vermelho);
        doc.text(`Nº ${pad(d.id, 4)}`, PAG.w - PAG.mr, 21, { align: "right" });

        cor(doc, "draw", COR.azul);
        doc.setLineWidth(0.7);
        doc.line(PAG.ml, 27.5, PAG.w - PAG.mr, 27.5);

        return 33;
    }

    function contar(respostas) {
        const c = { OK: 0, ATENCAO: 0, PROBLEMA: 0, NAO_APLICAVEL: 0 };
        respostas.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
        return c;
    }

    function faixaResultado(doc, y, d) {
        const info = STATUS_CHECKLIST[d.status] || { rotulo: String(d.status || "—"), cor: COR.azul };
        const c = contar(d.respostas);
        const h = 18;

        cor(doc, "fill", info.cor);
        doc.roundedRect(PAG.ml, y, LARGURA, h, 2, 2, "F");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        cor(doc, "text", COR.branco);
        doc.text("RESULTADO DA INSPEÇÃO", PAG.ml + 5, y + 5.8);

        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(13.5);
        doc.text(info.rotulo, PAG.ml + 5, y + 13);

        const colunas = [["OK", c.OK], ["PROBLEMAS", c.PROBLEMA]];
        if (c.ATENCAO > 0) colunas.splice(1, 0, ["ATENÇÃO", c.ATENCAO]);

        const largCol = 22;
        let x = PAG.w - PAG.mr - 4 - largCol * colunas.length;
        colunas.forEach(([rot, n]) => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(15);
            doc.text(String(n), x + largCol / 2, y + 9.5, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6);
            doc.text(rot, x + largCol / 2, y + 14, { align: "center" });
            x += largCol;
        });

        return y + h + 6;
    }

    // Bloco "rótulo: valor" com barra vermelha no topo (igual aos cartões do sistema)
    function medirBloco(doc, largura, linhas) {
        const pad = 3.5;
        const largRotulo = 26;
        const largValor = largura - pad * 2 - largRotulo;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        let h = 11.5; // barra + título
        const itens = linhas.map(([rotulo, valor]) => {
            const texto = limpar(valor) || "—";
            const partes = doc.splitTextToSize(texto, largValor);
            const alt = Math.max(partes.length * 4.1, 4.1) + 1.6;
            h += alt;
            return { rotulo, partes, alt };
        });
        return { h: h + 1.5, itens, pad, largRotulo };
    }

    function desenharBloco(doc, x, y, largura, titulo, medida, altura) {
        cor(doc, "fill", COR.cinzaClaro);
        cor(doc, "draw", COR.borda);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, largura, altura, 1.5, 1.5, "FD");
        cor(doc, "fill", COR.vermelho);
        doc.rect(x, y, largura, 1.1, "F");

        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(9.5);
        cor(doc, "text", COR.azul);
        doc.text(titulo.toUpperCase(), x + medida.pad, y + 6.8);

        let yy = y + 11.5;
        medida.itens.forEach(it => {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.2);
            cor(doc, "text", COR.cinza);
            doc.text(it.rotulo.toUpperCase(), x + medida.pad, yy + 3);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            cor(doc, "text", COR.azul);
            doc.text(it.partes, x + medida.pad + medida.largRotulo, yy + 3.1);
            yy += it.alt;
        });
    }

    function blocosInfo(doc, y, d) {
        const larg = (LARGURA - 4) / 2;
        const eq = d.equipamento;

        const linhasEq = [
            ["Equipamento", eq.nome],
            ["Tipo", eq.tipo],
            ["Modelo", eq.modelo],
            ["Fabricante", eq.fabricante],
            ["Patrimônio", eq.patrimonio],
            ["Prefixo", eq.prefixo],
            ["Placa", eq.placa]
        ];
        if (eq.ano) linhasEq.push(["Ano", eq.ano]);

        const linhasInsp = [
            ["Inspeção", `Nº ${pad(d.id, 4)}`],
            ["Data e hora", fmtDataHora(d.realizado_em)],
            ["Inspetor", d.inspetor.nome],
            ["E-mail", d.inspetor.email],
            ["Horímetro", fmtHorimetro(d.horimetro)],
            ["Itens", `${d.respostas.length} verificados`]
        ];

        const m1 = medirBloco(doc, larg, linhasEq);
        const m2 = medirBloco(doc, larg, linhasInsp);
        const altura = Math.max(m1.h, m2.h);

        desenharBloco(doc, PAG.ml, y, larg, "Equipamento", m1, altura);
        desenharBloco(doc, PAG.ml + larg + 4, y, larg, "Dados da inspeção", m2, altura);
        return y + altura + 8;
    }

    function tituloSecao(doc, y, texto) {
        cor(doc, "fill", COR.vermelho);
        doc.rect(PAG.ml, y - 4.6, 1.6, 6, "F");
        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(11);
        cor(doc, "text", COR.azul);
        doc.text(texto.toUpperCase(), PAG.ml + 4, y);
        return y + 4;
    }

    function garantirEspaco(doc, y, altura) {
        if (y + altura > PAG.h - PAG.rodape) {
            doc.addPage();
            return PAG.topo;
        }
        return y;
    }

    /* ------------------------------------------------------------------ */
    /* Tabela do checklist                                                 */
    /* ------------------------------------------------------------------ */

    function tabelaChecklist(doc, y, d) {
        if (typeof doc.autoTable !== "function") {
            throw new Error("Plugin jsPDF-AutoTable não foi carregado.");
        }

        const corpo = [];
        let categoriaAtual = null;
        let numero = 0;

        d.respostas.forEach(r => {
            if (r.categoria !== categoriaAtual) {
                categoriaAtual = r.categoria;
                corpo.push([{
                    content: limpar(categoriaAtual).toUpperCase(),
                    colSpan: 4,
                    styles: {
                        fillColor: COR.azulClaro, textColor: COR.azul,
                        fontStyle: "bolditalic", fontSize: 7.8, cellPadding: 1.8
                    }
                }]);
            }
            numero++;

            let obs = limpar(r.observacao);
            if (r.foto || r.foto_path) {
                obs += (obs ? "\n" : "") + "(foto anexada - ver registro fotográfico)";
            }

            const st = STATUS_ITEM[r.status] || { rotulo: String(r.status), cor: COR.texto, fundo: COR.branco };
            const problema = r.status === "PROBLEMA";
            const base = problema ? { fillColor: [255, 248, 248] } : {};

            corpo.push([
                { content: String(numero), styles: { ...base, halign: "center", textColor: COR.cinza } },
                { content: limpar(r.nome), styles: { ...base, fontStyle: "bold" } },
                { content: st.rotulo, styles: { halign: "center", fontStyle: "bold", textColor: st.cor, fillColor: st.fundo } },
                { content: obs || "—", styles: { ...base } }
            ]);
        });

        doc.autoTable({
            startY: y,
            margin: { left: PAG.ml, right: PAG.mr, top: PAG.topo, bottom: PAG.rodape },
            head: [["Nº", "Item de inspeção", "Resultado", "Observação"]],
            body: corpo,
            theme: "grid",
            rowPageBreak: "avoid",
            styles: {
                font: "helvetica", fontSize: 8.6, cellPadding: 2.3,
                lineColor: COR.borda, lineWidth: 0.2, textColor: COR.texto,
                valign: "middle", overflow: "linebreak"
            },
            headStyles: {
                fillColor: COR.azul, textColor: COR.branco, fontStyle: "bold",
                fontSize: 8.2, halign: "left"
            },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 68 },
                2: { cellWidth: 25 },
                3: { cellWidth: "auto" }
            }
        });

        return doc.lastAutoTable.finalY + 9;
    }

    /* ------------------------------------------------------------------ */
    /* Observações, fotos e assinaturas                                    */
    /* ------------------------------------------------------------------ */

    function observacoesGerais(doc, y, d) {
        const texto = limpar(d.observacoes);
        if (!texto) return y;

        y = garantirEspaco(doc, y, 24);
        y = tituloSecao(doc, y, "Observações gerais") + 3;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        cor(doc, "text", COR.texto);
        const linhas = doc.splitTextToSize(texto, LARGURA - 8);
        const alt = 4.6;

        let i = 0;
        while (i < linhas.length) {
            const disponivel = Math.floor((PAG.h - PAG.rodape - y - 4) / alt);
            if (disponivel < 2) { doc.addPage(); y = PAG.topo; continue; }
            const trecho = linhas.slice(i, i + disponivel);
            const h = trecho.length * alt + 4;
            cor(doc, "fill", COR.cinzaClaro);
            doc.rect(PAG.ml, y - 2, LARGURA, h, "F");
            cor(doc, "fill", COR.azul);
            doc.rect(PAG.ml, y - 2, 1.2, h, "F");
            cor(doc, "text", COR.texto);
            doc.text(trecho, PAG.ml + 5, y + 2.4);
            y += h + 1;
            i += trecho.length;
        }
        return y + 7;
    }

    function registroFotografico(doc, y, d) {
        const fotos = d.respostas
            .map((r, idx) => ({ r, idx }))
            .filter(({ r }) => r.foto);
        if (!fotos.length) return y;

        y = garantirEspaco(doc, y, 90);
        y = tituloSecao(doc, y, "Registro fotográfico") + 5;

        const gap = 6;
        const largCol = (LARGURA - gap) / 2;
        const altMaxImg = 66;

        // numeração igual à da tabela (posição do item na lista)
        for (let i = 0; i < fotos.length; i += 2) {
            const par = fotos.slice(i, i + 2);
            const alturaLinha = altMaxImg + 20;
            y = garantirEspaco(doc, y, alturaLinha);

            par.forEach(({ r, idx }, col) => {
                const x = PAG.ml + col * (largCol + gap);

                cor(doc, "fill", COR.cinzaClaro);
                cor(doc, "draw", COR.borda);
                doc.setLineWidth(0.25);
                doc.roundedRect(x, y, largCol, altMaxImg, 1.5, 1.5, "FD");

                try {
                    const props = doc.getImageProperties(r.foto);
                    const escala = Math.min((largCol - 4) / props.width, (altMaxImg - 4) / props.height);
                    const w = props.width * escala;
                    const h = props.height * escala;
                    doc.addImage(r.foto, props.fileType || "JPEG",
                        x + (largCol - w) / 2, y + (altMaxImg - h) / 2, w, h, undefined, "FAST");
                } catch (e) {
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(8);
                    cor(doc, "text", COR.cinza);
                    doc.text("Imagem indisponível", x + largCol / 2, y + altMaxImg / 2, { align: "center" });
                }

                // Legenda
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.4);
                cor(doc, "text", COR.vermelho);
                const legenda = doc.splitTextToSize(`Item ${idx + 1} - ${limpar(r.nome)}`, largCol);
                doc.text(legenda.slice(0, 2), x, y + altMaxImg + 4.5);

                const obs = limpar(r.observacao);
                if (obs) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7.8);
                    cor(doc, "text", COR.cinza);
                    const linhasObs = doc.splitTextToSize(obs, largCol).slice(0, 3);
                    doc.text(linhasObs, x, y + altMaxImg + 4.5 + legenda.slice(0, 2).length * 3.8 + 0.5);
                }
            });

            y += alturaLinha;
        }
        return y + 2;
    }

    function assinaturas(doc, y, d) {
        y = garantirEspaco(doc, y, 44);

        // Aviso do checklist em papel da empresa
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        cor(doc, "text", COR.vermelho);
        const aviso = doc.splitTextToSize(
            "OBS: COMUNICAR O ENCARREGADO IMEDIATAMENTE SOBRE ITENS NÃO CONFORMES PARA A REGULARIZAÇÃO.",
            LARGURA
        );
        doc.text(aviso, PAG.ml, y);
        y += aviso.length * 3.8;

        y += 8;
        const gap = 8;
        const larg = (LARGURA - gap * 2) / 3;
        cor(doc, "draw", COR.cinza);
        doc.setLineWidth(0.3);

        const campos = [
            { x: PAG.ml, titulo: "Motorista / Operador", nome: d.inspetor.nome },
            { x: PAG.ml + larg + gap, titulo: "Encarregado", nome: "" },
            { x: PAG.ml + (larg + gap) * 2, titulo: "Técnico de Segurança do Trabalho", nome: "" }
        ];
        campos.forEach(c => {
            doc.line(c.x, y + 12, c.x + larg, y + 12);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.8);
            cor(doc, "text", COR.azul);
            doc.text(c.titulo, c.x + larg / 2, y + 17, { align: "center", maxWidth: larg });
            if (c.nome) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                cor(doc, "text", COR.cinza);
                doc.text(limpar(c.nome), c.x + larg / 2, y + 21.2, { align: "center", maxWidth: larg });
            }
        });
        return y + 24;
    }

    /* ------------------------------------------------------------------ */
    /* Cabeçalho corrente e rodapé (todas as páginas)                      */
    /* ------------------------------------------------------------------ */

    function decorarPaginas(doc, d, geradoPor) {
        const total = doc.getNumberOfPages();
        const geradoEm = fmtDataHora(new Date().toISOString());

        for (let i = 1; i <= total; i++) {
            doc.setPage(i);

            if (i > 1) {
                cor(doc, "fill", COR.vermelho);
                doc.rect(0, 0, PAG.w, 2.2, "F");
                desenharWordmark(doc, PAG.ml, 11, 12);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                cor(doc, "text", COR.cinza);
                doc.text(
                    `Inspeção Nº ${pad(d.id, 4)}  -  ${limpar(d.equipamento.nome)}`,
                    PAG.w - PAG.mr, 11, { align: "right" }
                );
                cor(doc, "draw", COR.azul);
                doc.setLineWidth(0.4);
                doc.line(PAG.ml, 15, PAG.w - PAG.mr, 15);
            }

            const yRod = PAG.h - 11;
            cor(doc, "draw", COR.vermelho);
            doc.setLineWidth(0.5);
            doc.line(PAG.ml, yRod - 4.2, PAG.w - PAG.mr, yRod - 4.2);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.4);
            cor(doc, "text", COR.cinza);
            const origem = geradoPor ? ` por ${limpar(geradoPor)}` : "";
            doc.text(`EllencoCheck  |  Documento gerado em ${geradoEm}${origem}`, PAG.ml, yRod);
            doc.setFont("helvetica", "bold");
            cor(doc, "text", COR.azul);
            doc.text(`Página ${i} de ${total}`, PAG.w - PAG.mr, yRod, { align: "right" });
        }
    }

    /* ------------------------------------------------------------------ */
    /* Montagem do documento                                               */
    /* ------------------------------------------------------------------ */

    function construir(dados, opcoes) {
        const opts = opcoes || {};
        const JsPDF = jsPDFClass();
        const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

        const titulo = `Relatório de Inspeção Nº ${pad(dados.id, 4)} - ${limpar(dados.equipamento.nome)}`;
        doc.setProperties({
            title: titulo,
            subject: "Checklist de inspeção de equipamento",
            author: "EllencoCheck",
            creator: "EllencoCheck"
        });

        let y = cabecalhoPrimeiraPagina(doc, dados);
        y = faixaResultado(doc, y, dados);
        y = blocosInfo(doc, y, dados);

        y = tituloSecao(doc, y, "Checklist de inspeção") + 3;
        y = tabelaChecklist(doc, y, dados);

        y = observacoesGerais(doc, y, dados);
        y = registroFotografico(doc, y, dados);
        assinaturas(doc, y, dados);

        decorarPaginas(doc, dados, opts.geradoPor);
        return doc;
    }

    /* ------------------------------------------------------------------ */
    /* API pública                                                         */
    /* ------------------------------------------------------------------ */

    async function gerar(sb, checklistId, opcoes) {
        const opts = opcoes || {};
        // Abre a aba antes de qualquer await, senão o navegador bloqueia o pop-up.
        const janela = opts.acao === "abrir" ? window.open("", "_blank") : null;

        try {
            const dados = await buscarDados(sb, checklistId);
            if (opts.comFotos !== false) await carregarFotos(sb, dados);

            const doc = construir(dados, opts);
            const arquivo = nomeArquivo(dados);

            if (opts.acao === "blob") return { blob: doc.output("blob"), arquivo };

            if (opts.acao === "abrir") {
                const url = URL.createObjectURL(doc.output("blob"));
                if (janela) janela.location.href = url;
                else doc.save(arquivo);
                setTimeout(() => URL.revokeObjectURL(url), 120000);
            } else {
                doc.save(arquivo);
            }
            return { arquivo };
        } catch (e) {
            if (janela) janela.close();
            throw e;
        }
    }

    root.EllencoPDF = { gerar, construir, buscarDados, carregarFotos, nomeArquivo, BUCKET_FOTOS };

})(typeof window !== "undefined" ? window : globalThis);
