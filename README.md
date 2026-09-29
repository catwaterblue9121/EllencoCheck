# EllencoCheck + Supabase

O projeto foi migrado de **Flask + MySQL/XAMPP** para **Supabase**.

## O que foi alterado

- Login e cadastro usam **Supabase Auth**.
- Recuperação de senha usa o fluxo nativo de recuperação do Supabase.
- Equipamentos e itens de inspeção ficam no **Postgres do Supabase**.
- Inspeções e respostas são gravadas diretamente no Supabase.
- A antiga API Flask/MySQL foi removida do projeto.
- Foi removida a chamada de teste `http://localhost:5000/api/equipamentos`.
- Foi adicionada segurança com **RLS (Row Level Security)**.
- A página `usuarios.html` usa a tabela `profiles` e exige usuário com `role = admin`.

## Configuração

### 1. Crie um projeto no Supabase

Acesse o painel do Supabase e crie um projeto.

### 2. Crie as tabelas

No Supabase, abra:

**SQL Editor → New query**

Cole e execute todo o arquivo:

`supabase_schema.sql`

### 3. Configure o frontend

Abra:

`supabase-config.js`

Troque:

```js
window.ELLENCO_SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.ELLENCO_SUPABASE_ANON_KEY = "SUA_CHAVE_ANON_OU_PUBLISHABLE";
```

pelos valores do painel:

**Project Settings → API**

Use a URL do projeto e a chave **Publishable/anon**.

**Nunca coloque a `service_role` key no frontend.**

### 4. Crie a primeira conta

Abra `login.html`, cadastre uma conta e confirme o e-mail caso a confirmação esteja ativada.

Depois, no SQL Editor, transforme essa conta em administradora:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'seu@email.com';
```

### 5. Configure URLs de autenticação

No Supabase:

**Authentication → URL Configuration**

Adicione a URL usada para abrir o projeto.

Para desenvolvimento local, é melhor servir a pasta por HTTP em vez de abrir os HTMLs diretamente com `file://`.

Com Node.js:

```bash
npm install
npm start
```

Depois abra o endereço mostrado pelo `serve`.

Também é possível usar qualquer servidor HTTP estático.

### 6. Recuperação de senha

O endereço `reset-password.html` é usado como página de recuperação.

Se você publicar o projeto, configure a URL pública correspondente em:

**Authentication → URL Configuration → Redirect URLs**

Exemplo:

```text
https://seu-dominio.com/reset-password.html
```

## Estrutura principal

- `login.html` — login/cadastro
- `index.html` — nova inspeção
- `usuarios.html` — administração de usuários
- `forgot-password.html` — solicitar recuperação
- `reset-password.html` — definir nova senha
- `supabase-config.js` — configuração do Supabase
- `supabase_schema.sql` — tabelas, RLS, trigger e dados iniciais

## Observação sobre usuários

O Supabase Auth é o responsável pelas senhas. A tabela `profiles` guarda os dados de aplicação, como nome, status e função.

A senha **não é armazenada** na tabela `profiles`.

A criação de contas pelo formulário público usa `auth.signUp()`. A criação administrativa de usuários sem alterar a sessão do administrador exigiria uma Edge Function usando a API administrativa do Supabase; por segurança, essa chave não é colocada no navegador.

## Checklist

Cada inspeção cria um registro em `checklists` e depois seus registros correspondentes em `respostas_checklist`.

Se a gravação das respostas falhar, o frontend tenta remover o checklist criado para evitar registros incompletos.
