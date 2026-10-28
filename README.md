# CasaXP

Tarefas da casa viram XP. XP vira recompensa.

Aplicativo web instalável no celular (PWA), com um backend que guarda os dados.

## Como funciona

- **Administrador:** cria a casa, gera o código de convite, cadastra tarefas e recompensas, aprova ou recusa tarefas e exclui usuários e recompensas.
- **Usuário:** entra com o código de convite, vê as próprias tarefas, marca como feita e resgata recompensas com o XP.

Fluxo da tarefa: `Pendente` → `Em análise` (concluída pelo Usuário) → `Aprovada` (XP creditado). Se for recusada, volta para `Pendente`, sem XP.

Tarefa aprovada some no dia seguinte à aprovação. As demais continuam aparecendo até serem aprovadas.

As regras de negócio ficam em `backend/src/rules.ts`.

## Estrutura

```
CasaXP-/
├── backend/   API (Node 22 + Express + SQLite) e testes
├── web/       App web / PWA (React + Vite)
└── imgs/      Ícones usados no menu e nos cartões
```

## Como rodar no seu computador

Requer Node 22.13 ou superior (confira com `node -v`).

**1. Backend**

```bash
cd backend
npm install
npm test        # roda os testes
npm start       # sobe em http://localhost:3000
```

**2. App web**

Em outro terminal:

```bash
cd web
npm install
npm run build   # gera o app em web/dist
```

Depois de gerar o `web/dist`, o backend entrega o app em `http://localhost:3000`.

Durante o desenvolvimento, dá para rodar `npm run dev` dentro de `web/`, que usa o backend em `http://localhost:3000` automaticamente.

## Banco de dados

O banco fica em `backend/data/casaxp.db`, criado automaticamente. Para usar outro arquivo, defina a variável `DB_PATH`:

```bash
DB_PATH=/caminho/casaxp.db npm start
```

## Publicação

Na hospedagem (Railway), defina:

- Build: `cd web && npm install && npm run build && cd ../backend && npm install`
- Start: `cd backend && npm start`
- Variáveis: `DB_PATH=/data/casaxp.db` e `NIXPACKS_NODE_VERSION=22`
- Um volume montado em `/data`, para o banco não ser apagado a cada deploy.

## Antes de divulgar

- Revisar a parte de dados de menores (LGPD), com aviso de privacidade e consentimento do responsável.
- Revisar as dependências de desenvolvimento do app web (`npm audit`).
