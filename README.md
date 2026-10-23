# CasaXP

Tarefas da casa viram XP. XP vira recompensa.

Monorepo com três partes:

```
casaxp/
├── backend/   API (Node 22 + Express + node:sqlite) e testes
├── mobile/    App Android (Expo / React Native)
└── site/      Landing page + pasta do APK para download
```

## Regras de negócio

| Ação | Responsável | Adolescente |
|---|---|---|
| Criar casa (gera código de convite) | ✅ | — |
| Entrar na casa com o código | — | ✅ |
| Criar tarefa e atribuir a um adolescente | ✅ | ❌ |
| Marcar tarefa como feita | ❌ | ✅ (só a própria, se pendente) |
| Aprovar / recusar tarefa | ✅ (só se aguardando aprovação) | ❌ |
| Criar recompensa | ✅ | ❌ |
| Resgatar recompensa | ❌ | ✅ (se tiver XP suficiente) |

Fluxo da tarefa: `PENDENTE` → `AGUARDANDO_APROVACAO` → `APROVADA` (XP creditado).
Se for recusada, volta para `PENDENTE` sem XP.

Limites: XP de tarefa entre 1 e 1000; custo de recompensa entre 1 e 10000; senha com pelo menos 6 caracteres.

As regras ficam em um único arquivo: `backend/src/rules.ts`.

## Como rodar

### 1. Backend

Requer Node 22.13 ou superior.

```bash
cd backend
npm install
npm test        # roda os testes
npm start       # sobe a API em http://localhost:3000
```

Para usar outro arquivo de banco: `DB_PATH=/caminho/casaxp.db npm start`.

### 2. App mobile

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://SEU_IP_NA_REDE:3000 npm start
```

Abra o Expo Go no Android e leia o QR code. O celular precisa alcançar o computador na mesma rede. Use o IP da sua máquina, não `localhost`.

### 3. Gerar o APK para distribuir

```bash
cd mobile
npx eas login
EXPO_PUBLIC_API_URL=https://sua-api.exemplo.com npm run build:apk
```

Quando o build terminar, baixe o `.apk` gerado, renomeie para `casaxp.apk` e coloque em `site/downloads/`.

### 4. Landing page

É um arquivo estático. Basta servir a pasta `site/`:

```bash
cd site
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Próximos passos

1. Publicar a API com HTTPS (Railway ou Fly.io, com disco persistente para o SQLite).
2. Gerar o APK com a URL pública da API e colocar em `site/downloads/casaxp.apk`.
3. Testar no celular Android real.
4. Revisar a parte de dados de menores (LGPD) antes de divulgar publicamente.
