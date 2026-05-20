# PMO Horistic — Plataforma multi-tenant

Painel de PMO da consultoria Sales Consulting (Gabriel Heringer).
Mesma estética do `PMO Horistic.html` original, agora multi-tenant:
um login admin gerencia múltiplos clientes; cada cliente vê só o seu projeto
e só as seções permitidas.

## Stack
- **Frontend**: HTML + JS vanilla, sem bundler. `@supabase/supabase-js` via CDN.
- **Backend**: Supabase (Auth + Postgres + Row Level Security + Realtime).
- **Hospedagem**: GitHub Pages.

## Estrutura

```
pmo-horistic/
├── public/                     # raiz do site (GitHub Pages publica daqui)
│   ├── login.html
│   ├── index.html              # router pós-login
│   ├── selector.html           # admin com 2+ projetos
│   ├── pmo.html                # painel principal (porta do HTML original)
│   ├── results.html            # operação / resultados
│   ├── admin.html              # CRUD orgs/projetos/convites
│   └── js/
│       ├── config.js           # SUPABASE_URL + ANON_KEY (público, RLS protege)
│       ├── supabase-client.js
│       ├── pmo-auth.js
│       ├── pmo-data.js
│       └── pmo-render.js
├── sql/
│   ├── 001_init.sql
│   ├── 002_rls.sql
│   └── 003_seed_horistic.sql
└── .github/workflows/deploy.yml
```

## Setup (uma vez)

### 1. Criar projeto Supabase
1. https://supabase.com → New Project
2. Settings → API → copie `URL` e `anon public` key
3. Cole em `js/config.js`

### 2. Rodar migrations
No Supabase Dashboard → SQL Editor, rode na ordem:
1. `sql/001_init.sql`
2. `sql/002_rls.sql`
3. `sql/003_seed_horistic.sql`  *(opcional — só se quiser pré-carregar a Horistic)*

### 3. Criar usuário admin
Authentication → Users → Add user → email + senha.
Depois, no SQL Editor:
```sql
insert into memberships (user_id, org_id, role)
select u.id, o.id, 'admin'
from auth.users u, organizations o
where u.email = 'voce@example.com' and o.slug = 'horistic';
```

### 4. Convidar cliente
Authentication → Users → Add user (com senha temporária ou magic link).
Depois:
```sql
insert into memberships (user_id, org_id, role)
select u.id, o.id, 'client'
from auth.users u, organizations o
where u.email = 'cliente@horistic.com' and o.slug = 'horistic';
```

> Versão futura: tela `admin.html` faz isso via Edge Function (com `service_role`)
> sem precisar entrar no SQL Editor.

## Rodar local
Qualquer servidor estático:
```bash
cd pmo-horistic/public
python3 -m http.server 8080
# abre http://localhost:8080/login.html
```

## Deploy
Push pra `main` → GitHub Actions publica `/public` no GitHub Pages.

## Modelo de permissões
| Tabela              | Admin | Client                          |
|---------------------|-------|---------------------------------|
| organizations       | RW    | R (apenas onde tem membership)  |
| projects            | RW    | R                               |
| phases              | RW    | R                               |
| deliverables        | RW    | R                               |
| subtasks            | RW    | R + U (apenas `done`)           |
| project_state       | RW    | R                               |
| operation_metrics   | RW    | R                               |
| closers             | RW    | —                               |
| actions             | RW    | —                               |
| finance             | RW    | —                               |
| notes               | RW    | —                               |
| closer_performance  | RW    | —                               |

RLS está habilitado em todas as tabelas. Cliente que tentar ler `finance`
recebe array vazio — não é só esconder no CSS.
