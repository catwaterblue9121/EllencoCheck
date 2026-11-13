# EllencoCheck + Supabase

Sistema de inspeção (checklist) de equipamentos, com autenticação, banco de dados e fotos no **Supabase** e **relatório em PDF** com a identidade visual da Ellenco.

## Novidades da versão 2.1

- **Relatório em PDF de cada inspeção** (`pdf-checklist.js`): cabeçalho com a marca EllencoCheck, resultado (aprovado / com observação / reprovado), dados do equipamento e do inspetor, checklist por categoria, observações, **fotos das avarias** e campos de assinatura. Paginado, com rodapé e numeração.
- **Histórico de inspeções** (`historico.html`): lista com filtros (resultado, período, busca) e botões **Baixar PDF** / **Visualizar**. Usuários comuns veem as próprias inspeções; administradores veem todas.
- Após finalizar uma inspeção, a tela mostra o painel **Baixar PDF / Visualizar PDF / Nova inspeção**.
- **Fotos das avarias** agora são enviadas ao Supabase Storage (bucket privado `inspecao-fotos`), reduzidas antes do envio.
- Vários bugs corrigidos (veja `CHANGELOG` abaixo).

## Configuração

### 1. Crie um projeto no Supabase

Acesse o painel do Supabase e crie um projeto.

### 2. Crie / atualize o banco

**SQL Editor → New query**

**Correção do erro “o banco precisa do v4”:** no banco já existente, execute `supabase_corrigir_v4.sql` no SQL Editor. Esse arquivo garante as colunas do horímetro inicial/final, a função usada pelo Histórico, a sincronização do horímetro do equipamento e solicita a recarga do cache da API. Veja `INSTRUCOES_ATUALIZACAO.txt` para os passos e consultas de conferência.

- **Instalação nova:** execute todo o `supabase_schema.sql`, depois o `supabase_update_v3.sql` (checklist da empresa: tipos, itens e EPIs, campo prefixo) depois o `supabase_update_v4.sql` (horímetro inicial/final e itens obrigatórios) e por fim o `supabase_update_v5.sql` (painel admin e foto de perfil).
- **Banco que já estava em uso (versão anterior):** execute, em ordem, `supabase_update_v2.sql`, `v3`, `v4` e `v5`.
  As atualizações são cumulativas. Se a tela ainda informar que faltam campos do horímetro, execute também `supabase_corrigir_v4.sql` (reparo idempotente) e recarregue o site. As migrações não apagam seus dados.

> Não rode o `supabase_schema.sql` novamente num banco em uso: os dados iniciais (equipamentos/itens de ID 1 a 7) seriam sobrescritos.

### 3. Configure o frontend

Edite `supabase-config.js` com a URL e a chave **Publishable/anon** (Project Settings → API).
**Nunca coloque a `service_role` key no frontend.**

### 4. Crie a primeira conta e torne-a administradora

Abra `login.html`, cadastre uma conta (confirme o e-mail, se a confirmação estiver ativa) e, no SQL Editor:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'seu@email.com';
```

### 5. Rode o projeto

Sirva a pasta por HTTP (não abra os HTML com `file://`):

```bash
npm install
npm start
```

Ou use qualquer servidor estático. Com Docker:

```bash
docker build -t ellencocheck .
docker run -p 8080:80 ellencocheck
```

### 6. URLs de autenticação

**Authentication → URL Configuration**: adicione a URL onde o site roda (Site URL) e, em *Redirect URLs*, `https://seu-dominio.com/reset-password.html` e `https://seu-dominio.com/login.html`.

## Estrutura

| Arquivo | Função |
|---|---|
| `login.html` | Login e cadastro |
| `index.html` | Nova inspeção (checklist) |
| `historico.html` | Histórico e geração de PDF |
| `usuarios.html` | Administração de usuários (somente admin) |
| `forgot-password.html` / `reset-password.html` | Recuperação de senha |
| `pdf-checklist.js` | Gerador do PDF (jsPDF + AutoTable via CDN) |
| `ellenco-base.css` | Estilos compartilhados, tema claro fixo |
| `supabase-config.js` | URL e chave do Supabase |
| `supabase_schema.sql` | Banco completo (instalação nova) |
| `supabase_update_v2.sql` | Atualização para quem já usa o sistema |
| `supabase_update_v4.sql` | Horímetro inicial/final e itens obrigatórios |
| `supabase_corrigir_v4.sql` | Reparo seguro dos campos/função do horímetro e recarga do cache do Supabase |

## Como o PDF é gerado

Tudo acontece no navegador: `EllencoPDF.gerar(supabase, idDaInspecao)` busca a inspeção (equipamento, inspetor, respostas e itens), baixa as fotos do Storage e monta o PDF. As regras de acesso (RLS) valem também para o PDF: cada usuário só gera relatório das próprias inspeções; administradores, de todas.

Para ajustar o visual (cores, textos, logotipo), edite as constantes `COR` e as funções `cabecalhoPrimeiraPagina` / `decorarPaginas` em `pdf-checklist.js`.

## Observações sobre usuários

O Supabase Auth guarda as senhas; a tabela `profiles` guarda nome, status e função. Em `usuarios.html`, o administrador cria contas com `auth.signUp()` usando um cliente separado, então **a sessão do administrador não é trocada**. Se a confirmação de e-mail estiver ativa, o novo usuário precisa confirmar o endereço.

## Aparência

- O modo escuro e o botão de alternância foram removidos. Todas as telas permanecem no tema claro, independentemente da preferência do dispositivo.

## Versão 2.3

- **Painel do administrador (`admin.html`):** aba **Veículos** (cadastrar, editar, buscar, desativar/reativar; não há exclusão para preservar o histórico) e aba **Usuários** (a antiga `usuarios.html`, que agora redireciona para cá). Acesso só para administradores.
- **Foto de perfil:** cada usuário troca a própria foto em *Meu Perfil*; o administrador troca a de qualquer usuário na edição. A imagem é recortada em quadrado e reduzida no navegador antes do envio (bucket público `avatares`).
- Requer o `supabase_update_v5.sql`.

## Versão 2.2

- **Horímetro inicial e final:** a inspeção grava o horímetro inicial (obrigatório) e, opcionalmente, o final; as **horas utilizadas** (final − inicial) são calculadas e aparecem no histórico e no PDF. Se o final ainda não foi lido, ele é registrado depois em **Histórico → "pendente · registrar"**. O horímetro final também atualiza o horímetro do equipamento, que vem como sugestão do inicial da próxima inspeção.
- **Itens obrigatórios:** itens marcados como obrigatórios (`itens_inspecao.obrigatorio = true`) aparecem com o selo "Obrigatório" (e com `*` no PDF). Problema em item obrigatório **reprova** a inspeção (equipamento não liberado); problema em item não obrigatório resulta em "aprovado com observação". Todos os itens atuais continuam obrigatórios; o `supabase_update_v4.sql` traz modelos para alterar ou adicionar itens.

## CHANGELOG (correções)

**Banco (`supabase_schema.sql`)**
- O gatilho `protect_profile_fields` bloqueava o `UPDATE ... SET role='admin'` do próprio README quando executado no SQL Editor; agora libera quando não há usuário logado (SQL Editor / service_role).
- Itens, equipamentos e tipos desativados sumiam do histórico do usuário (RLS); agora continuam visíveis para quem já os usou.
- Nova coluna `respostas_checklist.foto_path`, bucket privado `inspecao-fotos` e políticas de Storage.
- Criação de perfis faltantes (contas anteriores ao gatilho) e novos índices.

**`index.html`**
- O checklist carregava os itens de **todos** os tipos de equipamento ao abrir; agora só carrega após escolher o equipamento (e ignora respostas antigas se a pessoa trocar rápido de equipamento).
- Era possível clicar duas vezes e gravar a mesma inspeção duplicada; após salvar, o formulário é bloqueado e aparece o painel de PDF / nova inspeção.
- Horímetro vazio era salvo como 0; agora é obrigatório.
- Foto anexada a um item que depois virava "OK" ainda era enviada; agora só vale para itens com problema.
- A numeração dos itens exibia o ID do banco; agora é sequencial (igual ao PDF), e as mensagens de validação citam o nome do item.
- Cores da marca unificadas com as demais telas (`#113A6E` e `#EE3237`); CSS compartilhado mantido em `ellenco-base.css`.
- Links para Histórico e (admin) Usuários — a tela de usuários não tinha nenhum link de acesso.

**`usuarios.html`**
- O cabeçalho da tabela tinha 5 colunas para 6 dados (faltava "Função").
- Os botões usavam `onclick` com `JSON.stringify` dentro de aspas duplas, o que quebrava o HTML para nomes/e-mails com aspas; agora usam `addEventListener`.
- Cadastrar usuário com `signUp` no mesmo cliente podia **trocar a sessão do administrador** para a do novo usuário; agora usa um cliente separado.
- Nova edição de função/status, reativação de usuários e proteção contra o admin se desativar ou rebaixar.

**`login.html` / `forgot-password.html` / `reset-password.html`**
- Título "FrotaCheck" corrigido; link de "Voltar" apontava para o arquivo duplicado `loginecadastro.html` (removido).
- Perfil ausente (conta antiga) agora é criado automaticamente em vez de dar erro.
- Usuário já logado (ou vindo do link de confirmação) é enviado direto ao sistema.
- `reset-password.html` usava variáveis globais implícitas, não tratava link vencido e podia perder o evento de recuperação; corrigido.
- `emailRedirectTo` apontava para a própria URL (ex.: `usuarios.html`); agora sempre `login.html`.

**Projeto**
- `README.md` continha marcadores de conflito de merge (`<<<<<<< HEAD`); reescrito.
- `dockerfile` (Python/Flask, porta 5000) e `Manual Execução.txt` (MySQL/XAMPP) eram da versão antiga; substituídos por um `Dockerfile` estático (nginx).
- Removidos `tailwind.config.js` e `src/*.css`, que não eram usados (o site usa o Tailwind via CDN) e o pacote `@supabase/supabase-js` do `package.json` (também carregado via CDN).
