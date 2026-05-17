# Sistema Casa Granum — Documento Técnico

> Documento de referência do estado atual do sistema. Para instruções operacionais
> (rodar, deploy, backup), ver [`README.md`](./README.md). Para variáveis de ambiente,
> ver [`.env.example`](./.env.example).
>
> Última atualização: 2026-05-17 — após Round 2 de robustez do módulo Remessas.

---

## Visão Geral

Sistema web integrado para a **Casa Granum** (loja de granéis e produtos naturais),
composto por **5 abas**:

| Aba | Nome | Público | Função |
|---|---|---|---|
| 1 | **Consulta por Objetivo** | Clientes / Atendentes | LLM recomenda produtos por necessidade descrita em linguagem natural |
| 2 | **Lista de Reabastecimento** | Equipe interna | Produtos com estoque abaixo do mínimo, com alerta Telegram |
| 3 | **Remessas** | Equipe interna | Controle de "estoque antigo" quando chega mercadoria com custo diferente; sugere preço novo e alerta quando é hora de atualizar |
| 4 | **Pedidos de Clientes** | Funcionários | Registro de pedidos pontuais; cada pedido aceita vários solicitantes |
| 5 | **Rank** | Equipe interna | Produtos mais vendidos a partir do histórico do Nutify; filtros, gráfico, export CSV |

Backend lê do **Firebird 3.0** (Nutify PDV, Windows) em **modo somente-leitura**.
Toda a escrita acontece em **SQLite local** (cache da IA, lista de reabastecimento,
pedidos, remessas).

---

## Stack

### Backend — Python 3.12 + FastAPI
| Pacote | Uso |
|---|---|
| `firebird-driver` | Conexão Firebird 3.0 com WireCrypt via `libfbclient.so` nativo |
| `google-genai` | Provider primário da Aba 1 (Gemini) |
| `openai` / `anthropic` | Providers alternativos (carregados sob demanda) |
| `python-telegram-bot` v21+ | Alertas das abas 2 e 3 |
| `APScheduler` | Schedulers: monitor de estoque (5 min) e verificador de remessas (5 min) |
| `aiosqlite` | Persistência local |
| `fastapi` + `uvicorn` | API REST (docs em `/docs`, health em `/health`) |
| `pydantic-settings` | Configuração tipada via `.env` |

### Frontend — Next.js 14 + Tailwind v3
- App Router, modo standalone para deploy em container
- Proxy `/api/*` via Route Handler (não `next.config rewrites` — em standalone esses são bakeados em build time)
- Polling: 30 s normal; 5 s quando há alerta ativo (Remessas)

### App Android
- Kotlin + Jetpack Compose envelopando WebView
- Build via GitHub Actions disparado por tag `android-v*`
- Detalhes em [`android/README.md`](android/README.md)

### Deploy
- Docker Compose; imagens publicadas em **GHCR** via GitHub Actions (`docker-publish.yml`)
- Serviço opcional `cloudflared` (profile `tunnel`) para acesso remoto sem abrir portas
- SQLite em **volume nomeado** (`casagranum_data`) — sobrevive a `down`/`pull`/`up`

---

## Banco Firebird — campos reais

> ⚠️ **Correção importante:** versões iniciais deste documento mapearam `PRO_MIX` /
> `PRO_MIA` como flags de estoque mínimo. **Inspeção direta no banco mostrou que esse
> não é o caso.** Os campos reais são abaixo.

### `PRODUTO` — campos utilizados

| Campo | Tipo | Descrição |
|---|---|---|
| `PRO_COD` | INTEGER | Código único do produto |
| `PRO_DES` | VARCHAR(80) | Nome do produto |
| `PRO_SIT` | CHAR(1) | `'A'` = Ativo |
| `PRO_IDB` | CHAR(1) | `'S'` = integração com balança (463 produtos ativos) |
| `PRO_EMN` | DECIMAL | **Estoque mínimo** — campo real (449 produtos com `PRO_EMN > 0`) |
| `PRO_QTD` | NUMERIC(15,5) | Estoque atual (na unidade de venda) |
| `PRO_VLC` | NUMERIC(15,5) | Custo unitário atual |
| `PRO_UND` | VARCHAR(10) | Unidade de **venda** (KG / UN / CAPS) — `PRO_EMN`, `PRO_QTD`, `MOI_QTD` estão nesta unidade |
| `PRO_UNDE` | VARCHAR(10) | Unidade de **compra** (KG / UN / CX) — pode diferir de `PRO_UND` |
| `PRO_GRU` | INTEGER | FK → `GRUPO.GRU_COD` |
| `PRO_BCO` | BLOB TEXT (ISO8859-1) | Benefícios — base para a IA (~168 produtos preenchidos) |

### `PAUTA` / `PAUTAPRODUTO` — preço de venda

- Apenas **uma pauta ativa**: `PTA_COD = 1` ("PAUTA PADRÃO (PREÇO LOJA)").
- `PAUTAPRODUTO` (PK composta `PTP_PTA + PTP_PRO`):
  - `PTP_VLR` = preço de venda (segue padrão *par + ,01* — ex.: 88.01, 110.01).
  - `PTP_PRC` = markup % sobre custo.

### `MOVIMENTOITENS` + `MOVIMENTO` — vendas

- Indicador confiável de venda confirmada: `MOI_SIT='S' AND MOV_SIT='S'`.
- ⚠️ `MOVIMENTOTIPO.MVT_TIP` está inconsistente nesta instalação (todos 'E', mesmo
  em vendas). **Não usar** essa coluna para distinguir entrada/saída.
- `MOI_QTD` está na **unidade de venda** do produto (`PRO_UND`).
- `MOI_DTE` é DATE (sem hora) — para baseline de vendas usar `acumulado_agora −
  baseline_no_inicio` em vez de filtro por data (evita vazamento no dia da criação).

### Conexão
- WireCrypt obrigatório — só `libfbclient.so` nativo conecta (pure-JS é rejeitado).
- Charset Firebird `ISO8859_1` → converter sempre para UTF-8 na aplicação.
- BLOB decode: `bytes.decode('iso-8859-1')` direto.

---

## Aba 1 — Consulta por Objetivo

**Status:** implementado.

### Fluxo
1. Usuário descreve objetivo em linguagem natural ("emagrecer", "ansiedade",
   "imunidade").
2. Backend carrega catálogo (produtos com `PRO_BCO` preenchido) com refresh a cada
   60 s (`CATALOG_REFRESH_SECONDS`).
3. LLM analisa e retorna recomendações com justificativa.
4. Resposta volta como JSON estruturado e é cacheada em SQLite por 24 h
   (`CACHE_TTL_HOURS`).

### LLM multi-provider
Provider configurável + fallback opcional:

| Variável | Default | Notas |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `openai` \| `anthropic` |
| `LLM_FALLBACK` | *(vazio)* | Usado se o primário falhar (5xx, rate limit, chave ausente) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Structured output via `json_schema` strict |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Tool_use + prompt caching do catálogo |

Os SDKs `openai`/`anthropic` são carregados sob demanda — provider não configurado
não impede o startup.

### Cache
```sql
CREATE TABLE recomendacao_cache (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  objetivo_hash  TEXT NOT NULL,
  objetivo_texto TEXT NOT NULL,
  catalogo_hash  TEXT NOT NULL,
  resposta_json  TEXT NOT NULL,
  gerado_em      DATETIME NOT NULL,
  valido_ate     DATETIME NOT NULL
);
```

Invalidação: mudança no `catalogo_hash` (produto novo, edição de `PRO_BCO`).

### Endpoints
- `GET /recomendacoes/info` — tamanho do catálogo e provider configurado
- `POST /recomendacoes` — body `{ "objetivo": "..." }`

---

## Aba 2 — Lista de Reabastecimento

**Status:** implementado.

### Critério de entrada/saída
| Transição | Condição |
|---|---|
| `ok → alerta_enviado` | `PRO_QTD <= PRO_EMN * STOCK_ALERT_FACTOR` (default 1.1) |
| `alerta_enviado → ok` | `PRO_QTD > PRO_EMN * STOCK_RESTORE_FACTOR` (default 1.5) |

### Schedulers e garantias
- Verificação a cada `MONITOR_INTERVAL_MINUTES` (default 5).
- Telegram **único** por transição (idempotente). Cooldown de 24 h por produto via
  `notificado_em` — sobrevive a restart.
- Lista vista pela UI sempre filtra produtos ainda monitorados no Firebird
  (auto-limpeza de produtos desativados).

### Schema
```sql
CREATE TABLE lista_reabastecimento (
  pro_cod           INTEGER PRIMARY KEY,
  pro_des           TEXT NOT NULL,
  grupo             TEXT,
  unidade           TEXT,
  unidade_venda     TEXT,
  estoque_min_kg    REAL NOT NULL,
  estoque_atual_kg  REAL,
  qtd_reposicao     REAL DEFAULT 0,
  estado            TEXT DEFAULT 'ok',  -- 'ok' | 'alerta_enviado'
  alerta_em         DATETIME,
  reposto_em        DATETIME,
  ultima_verif      DATETIME,
  notificado_em     DATETIME
);
```

### Endpoints
- `GET /reabastecimento` — lista atual
- `POST /reabastecimento/run` — força ciclo (debug)
- `GET /reabastecimento/status` — última execução e próxima agendada

---

## Aba 3 — Remessas

**Status:** implementado (incluindo Round 2 de robustez em 2026-05-17).

### Conceito
Quando chega mercadoria com **custo diferente**, registra-se um snapshot do
"estoque antigo" (qtd / custo / preço / markup). O sistema acompanha o consumo
via vendas no PDV e dispara alerta quando estiver na hora de revisar o preço.

### Fluxo
1. Usuário cria remessa informando produto + novo custo.
2. Sistema captura snapshot do estoque atual e da pauta atual; calcula preço sugerido
   (markup constante, arredondado pra próximo par+,01).
3. Scheduler verifica a cada `REMESSA_CHECK_MINUTES` (default 5):
   - **Auto-conclusão:** se o preço no Firebird mudar (comparação por centavos),
     a remessa fecha automaticamente.
   - **Alerta:** se consumo do estoque antigo ≥ `1 − STOCK_PRECO_ALERT_PCT`
     (default 80%), marca `alerta_preco` e dispara Telegram (cooldown 24 h).
   - **Auto-revert:** se consumo cair **5pp abaixo** do limiar (histerese), volta
     `alerta_preco → ativa`. Cobre devoluções / entradas que reduzem o consumo
     calculado.
4. Usuário pode concluir manualmente (lê preço atual do Firebird), cancelar
   (preserva no histórico) ou apagar registros do histórico.

### Schema
```sql
CREATE TABLE remessas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_cod               INTEGER NOT NULL,
  pro_des               TEXT NOT NULL,
  unidade               TEXT NOT NULL,
  estoque_antigo        REAL NOT NULL,
  custo_antigo          REAL NOT NULL,
  preco_antigo          REAL NOT NULL,
  markup_pct            REAL NOT NULL,
  custo_novo            REAL NOT NULL,
  preco_sugerido        REAL NOT NULL,
  alerta_threshold_pct  REAL NOT NULL DEFAULT 0.20,
  estado                TEXT NOT NULL DEFAULT 'ativa',
  iniciada_em           DATETIME NOT NULL,
  alertada_em           DATETIME,
  notificada_em         DATETIME,
  concluida_em          DATETIME,
  cancelada_em          DATETIME,
  motivo_cancelamento   TEXT,
  preco_final           REAL,
  vendas_baseline       REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX uq_remessa_ativa_por_produto
  ON remessas (pro_cod) WHERE estado IN ('ativa', 'alerta_preco');
```

Estados: `ativa` → `alerta_preco` (e volta com histerese) → `concluida` /
`cancelada`. O UNIQUE INDEX parcial garante no máximo uma remessa ativa por
produto.

### Endpoints
- `GET /remessas/produtos?q=...` — busca de produtos monitoráveis
- `GET /remessas/produtos/{pro_cod}/snapshot` — snapshot ao vivo (inclui
  `tem_pauta` e `tem_remessa_ativa`)
- `POST /remessas/preview-preco` — preview do preço sugerido
- `GET /remessas` — lista (com `vendido` e `consumo_pct` ao vivo)
- `POST /remessas` — cria; 422 se produto fora da pauta padrão; 409 se já tem
  ativa (tratado via `IntegrityError` do UNIQUE INDEX — resolve corrida entre
  requests simultâneas)
- `POST /remessas/{id}/cancelar`
- `POST /remessas/{id}/concluir-manual`
- `POST /remessas/run` — força ciclo (debug)
- `DELETE /remessas/historico` — limpa concluídas + canceladas
- `DELETE /remessas/{id}` — apaga registro individual em estado terminal

### Histórico de melhorias

**2026-05-17 — Round 2 (robustez)**
- Tratamento de corrida no `POST /remessas` via `IntegrityError` do UNIQUE INDEX.
- Bloqueio de produto fora de `PTA=1` (422) com mensagem clara.
- Comparação de preço por centavos (`round(x,2) != round(y,2)`) em vez de
  epsilon — elimina ruído de ponto flutuante.
- `DELETE /remessas/{id}` individual + ícone Trash2 nos cards de histórico.

**2026-05-17 — Round 3 (custo descendo)**
- `pricing.arredondar_par_01_baixo` (anterior par+,01 ≤ valor) e `sugerir_preco`
  com direção opcional (param `custo_antigo`). Quando `novo_custo < custo_antigo`,
  o preço sugerido é arredondado pra baixo — reflete a intenção real de reduzir
  preço quando a mercadoria veio mais barata.
- Badge "↓ sugere reduzir" no card e no modal de Nova remessa; preço sugerido
  tinge em verde (`good`) em vez de cobre.

**2026-05-17 — Round 4 (threshold ajustável)**
- `RemessaCreate.alerta_threshold_pct` opcional (0 < x < 1); persistência por
  linha em vez de só o default do `.env`.
- Modal de Nova remessa expõe campo "% consumido → alerta" em `<details>`
  recolhido. Conversão automática: input em % consumido, persistência em %
  restante.

**2026-05-17 — Round 5 (observabilidade + SSE)**
- `GET /remessas/saude`: estado do checker (em_execucao, ultima_execucao,
  ultimo_sumario, ultimo_erro, próxima execução agendada), contagens por
  estado, health Firebird (latência) e Telegram (configurado?).
- `GET /remessas/metricas`: tempo médio/min/max entre `iniciada_em` e
  `concluida_em` (via `julianday`), + top 10 produtos por nº de conclusões.
- `GET /remessas/stream` (SSE): emite `tick` com sumário ao fim de cada
  ciclo e `erro` em caso de exceção. Heartbeat 20 s pra atravessar proxies
  (testado por Cloudflare Tunnel-like layout via Route Handler do Next).
- Frontend escuta `tick` via `EventSource` em paralelo ao polling (que
  segue como fallback).

**Round anterior**
- Histerese de 5pp para `alerta_preco → ativa` (evita oscilação na borda).
- Substituição de `window.prompt/confirm/alert` por modais (`ConfirmDialog`) e
  toasts; botão "Limpar logs" no histórico.

---

## Aba 4 — Pedidos de Clientes

**Status:** implementado.

### Funcionalidades
- Formulário com texto livre do produto (com autocomplete via `PRODUTO.PRO_DES`).
- Cada pedido aceita **múltiplos clientes** (nome + telefone). A busca de
  cliente bate no cadastro do Nutify e autopreenche o telefone.
- Ações: marcar como atendido / cancelado / reabrir / remover.

### Schema
```sql
CREATE TABLE pedido (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_nome  TEXT NOT NULL,        -- texto livre
  pro_cod       INTEGER,              -- FK opcional para PRODUTO.PRO_COD
  unidade       TEXT,
  observacao    TEXT,
  status        TEXT NOT NULL DEFAULT 'aberto',  -- 'aberto'|'atendido'|'cancelado'
  criado_em     DATETIME NOT NULL,
  atualizado_em DATETIME NOT NULL,
  encerrado_em  DATETIME
);

CREATE TABLE pedido_cliente (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id          INTEGER NOT NULL,
  nome               TEXT NOT NULL,
  telefone           TEXT,
  cliente_externo_id INTEGER,         -- referência ao Nutify (snapshot)
  criado_em          DATETIME NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE CASCADE
);
```

### Endpoints
- `GET /pedidos` / `POST /pedidos` / `PATCH /pedidos/{id}` / `DELETE /pedidos/{id}`
- `POST /pedidos/{id}/clientes` / `DELETE /pedidos/{id}/clientes/{cliente_id}`
- `GET /clientes/buscar?q=...` — autocomplete via Firebird

---

## Aba 5 — Rank

**Status:** implementado.

### Funcionalidades
- Top produtos por **quantidade vendida**, **valor total** ou **nº de vendas**.
- Filtros: período (data início/fim), grupo, paginação `+50` (limite até 100k —
  fix aplicado em 2026-05-17, antes quebrava no terceiro "Ver mais").
- Variação vs. período anterior (mesma janela deslizada para trás).
- Gráfico de série temporal por produto.
- Export CSV.

### Endpoints
- `GET /rank` — lista paginada
- `GET /rank/grupos` — opções do filtro
- `GET /rank/csv` — export
- `GET /rank/{pro_cod}/serie` — série temporal para gráfico

100% leitura direta no Firebird (sem cache local — é consulta ad-hoc).

---

## Identidade Visual

| Token | HEX | Uso |
|---|---|---|
| `forest` / `forestdeep` | `#16201A` / `#0D1411` | Cor primária — fundo escuro, headers |
| `copper` / `copperdark` / `copperglow` | `#A96132` / `#8B4E28` / `#C77845` | CTAs, destaques, badges |
| `cream` / `creamdeep` | `#F5F0EA` / `#EBE3D8` | Fundos claros, cards |
| `ink` / `inkdim` / `inkmuted` | `#1C2120` / `#3D3935` / `#5C5853` | Texto |
| `wheat` / `wheatlight` | `#D4C4A8` / `#E5D8C0` | Bordas e linhas sutis |
| `danger` / `dangersoft` | `#B7261A` / `#FBEAE7` | Erro / destrutivo |
| `warn` / `warnsoft` | `#9C6B0F` / `#FBF1DC` | Aviso |
| `good` / `goodsoft` | `#3F6A3A` / `#EAF2E8` | Sucesso |

Tokens definidos em [`frontend/tailwind.config.ts`](frontend/tailwind.config.ts).

**Tipografia:** uma única fonte sans-serif via `--font-sans`, usada nas três
slots (`sans` / `display` / `body`).

**Ícones:** Lucide (`lucide-react`) — estilo linha simples, orgânico.

**Logos:** `CasaGranumSF.png` (versão clara) em uso no header; arquivos
referenciados na raiz do repo.

---

## Estrutura de Pastas

```
casagranum/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── firebird.py
│   │   │   └── sqlite.py
│   │   ├── modules/
│   │   │   ├── backup.py
│   │   │   ├── monitor/         # Aba 2 (scheduler, checker, telegram)
│   │   │   ├── rank/            # Aba 5 (repository)
│   │   │   ├── recommendations/ # Aba 1 (catalog, ai, cache, llm/*)
│   │   │   └── remessas/        # Aba 3 (checker, nutify, pricing, repository)
│   │   └── routers/
│   │       ├── clientes.py
│   │       ├── pedidos.py
│   │       ├── rank.py
│   │       ├── reabastecimento.py
│   │       ├── recomendacoes.py
│   │       └── remessas.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Aba 1
│   │   ├── reabastecimento/      # Aba 2
│   │   ├── remessas/             # Aba 3
│   │   ├── pedidos/              # Aba 4
│   │   ├── rank/                 # Aba 5
│   │   └── api/[...path]/        # Route Handler — proxy pra backend
│   ├── components/
│   │   ├── ConfirmDialog.tsx     # Modal genérico (variant danger, input opcional)
│   │   ├── Toast.tsx             # Auto-dismiss
│   │   ├── RemessaCard.tsx
│   │   ├── NovaRemessaModal.tsx
│   │   ├── PedidoList.tsx
│   │   └── ...
│   ├── lib/
│   ├── tailwind.config.ts
│   ├── Dockerfile
│   └── package.json
├── android/                      # WebView wrapper (Kotlin + Compose)
├── .github/workflows/
│   ├── docker-publish.yml        # GHCR no push de main + tags v*
│   └── android-release.yml       # APK release em tags android-v*
├── docker-compose.yml            # Dev (build local)
├── docker-compose.prod.yml       # Produção (pull do GHCR)
├── .env.example
└── README.md
```

---

## Sincronização em Tempo Real

| Aspecto | Frequência | Configurável via |
|---|---|---|
| Catálogo da IA | 60 s | `CATALOG_REFRESH_SECONDS` |
| Monitor de reabastecimento | 5 min | `MONITOR_INTERVAL_MINUTES` |
| Verificador de remessas | 5 min | `REMESSA_CHECK_MINUTES` |
| Limpeza de itens desativados na lista | live (a cada GET) | — |
| Polling UI (Remessas em alerta) | 5 s | hard-coded |
| Polling UI (Remessas normal) | 30 s | hard-coded |

---

## Deploy

Ver [`README.md`](./README.md) para o passo-a-passo. Resumo:

- **Dev:** `docker compose up -d --build`
- **Produção:** `docker compose -f docker-compose.prod.yml pull && up -d` (puxa de
  GHCR; preserva o volume `casagranum_data`)
- **Tunnel:** `docker compose --profile tunnel up -d` com
  `CLOUDFLARE_TUNNEL_TOKEN`
- **Android:** push de tag `android-v*` dispara `android-release.yml`; APK
  publicado nas releases do GitHub

---

## Próximos Passos

Backlog priorizado de melhorias (não bloqueante para uso atual):

### Remessas — P2
- `#9` Cache curto (15-30 s) em `vendas_acumuladas` se notar lentidão

### Remessas — P3
- ~~`#11` Alerta de consumo lento (overstock)~~ — fora do escopo do negócio

### Operacional
- Logs estruturados (`structlog`)
- Healthchecks granulares por dependência (Firebird, Telegram, LLM)
- Documentação operacional do lojista (como configurar `PRO_EMN` no Nutify)

---

## Notas Técnicas

### Decodificação BLOB Firebird
```python
cursor.execute("SELECT PRO_COD, PRO_DES, PRO_BCO FROM PRODUTO WHERE ...")
for row in cursor:
    blob = row[2]
    texto = blob.decode("iso-8859-1") if blob else None
```

### Configurar Estoque Mínimo no Nutify
1. Abrir cadastro do produto.
2. Preencher o **estoque mínimo** (campo `PRO_EMN` — em KG / UN / CAPS conforme `PRO_UND`).
3. Salvar. Na próxima verificação (até 5 min), o produto entra no monitoramento.

### Proxy `/api/*`
Frontend faz proxy via Route Handler em `app/api/[...path]/route.ts` apontando
para `BACKEND_INTERNAL_URL` (runtime). Não usar `next.config rewrites` em
standalone — o destino é fixado em build time.
