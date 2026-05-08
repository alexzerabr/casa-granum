# Casa Granum

Sistema integrado para a Casa Granum (loja de granéis e produtos naturais).

Três funcionalidades:

1. **Consulta por Objetivo** — recomendação de produtos por necessidade do cliente, usando IA (Gemini) sobre o catálogo do Nutify PDV.
2. **Lista de Reabastecimento** — monitoramento contínuo de estoque mínimo no Firebird (Nutify PDV) com alerta no Telegram.
3. **Pedidos de Clientes** — CRUD para registro de pedidos pontuais.

## Stack

- **Backend:** Python 3.12 + FastAPI + APScheduler + SQLite (aiosqlite) + firebird-driver (libfbclient nativo)
- **Frontend:** Next.js 14 (App Router) + Tailwind v3
- **Banco origem (somente leitura):** Firebird 3.0 com WireCrypt — Nutify PDV
- **Persistência local:** SQLite (cache de IA, lista de reabastecimento, pedidos)
- **Deploy:** Docker Compose; imagens publicadas em GHCR via GitHub Actions

## Sincronização em tempo real

Mudanças no Nutify PDV propagam para a aplicação automaticamente, sem ação manual:

| Aspecto | Frequência | Configurável via |
|---|---|---|
| Catálogo da IA | a cada **60 s** | `CATALOG_REFRESH_SECONDS` |
| Monitor de reabastecimento (alertas Telegram + lista) | a cada **5 min** | `MONITOR_INTERVAL_MINUTES` |
| Limpeza de itens desativados na lista | em cada **GET /reabastecimento** (live) | — |

**Garantias contra ruído:**

- Telegram tem cooldown de 24 h por produto (coluna `notificado_em`): mesmo que o estado SQLite seja perdido entre restarts, o alerta não é re-disparado para um produto que já foi notificado nas últimas 24 h.
- O monitor é idempotente: só dispara Telegram na transição `ok → alerta_enviado`. Itens já em alerta não geram nova notificação a cada scan.

## Como rodar (dev)

```bash
cp .env.example .env
# Preencher: FB_HOST, FB_USER, FB_PASSWORD, GEMINI_API_KEY,
#            TELEGRAM_BOT_TOKEN (opcional), TELEGRAM_CHAT_ID (opcional).

docker compose up -d --build
```

- Frontend: `http://localhost:8080` (configurável via `FRONTEND_PORT`)
- Backend:  `http://localhost:8000` — docs em `/docs`, healthcheck em `/health`

## Como rodar (produção, imagem do GHCR)

Não precisa do código-fonte; só do `docker-compose.prod.yml` + `.env`. O SQLite vive no volume nomeado `casagranum_data` — Docker cria automaticamente.

```bash
mkdir -p ~/casa-granum && cd ~/casa-granum
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/alexzerabr/casa-granum/main/docker-compose.prod.yml
# crie .env com os segredos reais (use .env.example como base)
docker compose pull
docker compose up -d
```

Atualizar pra última imagem publicada (preserva o volume):

```bash
docker compose pull && docker compose up -d
```

## Persistência

O SQLite local fica em um **volume nomeado do Docker** (`casagranum_data`). Sobrevive a:

- Reboot do PC
- `docker compose down`
- `docker compose pull` + `docker compose up -d` (atualização de imagem)

Só é apagado por `docker compose down -v` (flag explícita).

### Backup

```bash
# snapshot tar.gz no diretório atual
docker run --rm \
  -v casagranum_data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/casa-granum-$(date +%F).tar.gz -C /data .
```

### Restore

```bash
docker compose down
docker run --rm \
  -v casagranum_data:/data \
  -v "$(pwd)":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/casa-granum-2026-05-08.tar.gz -C /data"
docker compose up -d
```

### Inspecionar SQLite ao vivo

```bash
docker compose exec backend sqlite3 /app/data/casa_granum.db \
  "SELECT estado, COUNT(*) FROM lista_reabastecimento GROUP BY estado"
```

## Estrutura

```
backend/    FastAPI app, scheduler, módulos de monitor/recomendações
frontend/   Next.js (App Router) com 3 abas
scripts/    utilitários (validação Firebird, etc.)
.github/    workflow de build+publish para GHCR
```

## Segurança

- `.env` nunca é versionado (ver `.gitignore`).
- O usuário Firebird **deve ser somente leitura**.
- Telegram bot token e Gemini API key ficam apenas em `.env`.
- CORS lê de `CORS_ORIGINS` — em produção LAN, apontar para o IP/host real do frontend.
