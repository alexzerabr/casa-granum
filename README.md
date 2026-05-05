# Casa Granum

Sistema integrado para a Casa Granum (loja de granéis e produtos naturais).

Três funcionalidades principais:

1. **Consulta por Objetivo** — recomendação de produtos por necessidade do cliente, usando IA (Gemini) sobre o catálogo do Nutify PDV.
2. **Lista de Reabastecimento** — monitoramento contínuo de estoque mínimo no Firebird (Nutify PDV) com alerta no Telegram.
3. **Pedidos de Clientes** — CRUD para registro de pedidos pontuais.

## Stack

- **Backend:** Python 3.12 + FastAPI + APScheduler + SQLite (aiosqlite) + firebird-driver (libfbclient nativo)
- **Frontend:** Next.js 14 (App Router) + Tailwind v3
- **Banco origem (somente leitura):** Firebird 3.0 com WireCrypt — Nutify PDV
- **Persistência local:** SQLite (cache de IA, lista de reabastecimento, pedidos)
- **Deploy:** Docker Compose

## Como rodar

```bash
cp .env.example .env
# Preencher: FB_HOST, FB_USER, FB_PASSWORD, GEMINI_API_KEY,
#            TELEGRAM_BOT_TOKEN (opcional), TELEGRAM_CHAT_ID (opcional).

docker compose up -d --build
```

- Frontend: `http://localhost:3000`
- Backend:  `http://localhost:8000` — docs em `/docs`, healthcheck em `/health`

## Estrutura

```
backend/    FastAPI app, scheduler, módulos de monitor/recomendações
frontend/   Next.js (App Router) com 3 abas
data/       SQLite local (volume bind, não versionado)
scripts/    utilitários (validação Firebird, etc.)
```

## Segurança

- `.env` nunca é versionado (ver `.gitignore`).
- O usuário Firebird usado pela aplicação **deve ser somente leitura**.
- O Telegram bot token e a Gemini API key ficam apenas em `.env`.
