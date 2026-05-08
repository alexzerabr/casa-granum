# Prompt de Planejamento — Sistema Casa Granum

## Visão Geral do Projeto

Desenvolver um sistema web integrado para a **Casa Granum**, loja de produtos a granel. A aplicação possui três módulos principais, acessíveis por abas:

| Aba | Nome | Público | Função |
|---|---|---|---|
| 1ª | **Consultar por Objetivo** | Clientes / Atendentes | IA recomenda produtos com base em objetivo informado |
| 2ª | **Lista de Reabastecimento** | Equipe interna | Produtos com estoque abaixo do mínimo aguardando reposição |
| 3ª | **Pedidos de Clientes** | Funcionários | Registro manual de pedidos solicitados por clientes |

O backend integra com o banco **Firebird 3.0** (sistema Nutify PDV, Delphi/Windows) para leitura de estoque e benefícios dos produtos. Toda a escrita de dados da aplicação (cache, listas, pedidos) é feita em banco **SQLite local**, pois o acesso ao Firebird é **somente leitura**.

---

## Acesso ao Banco de Dados Firebird

- **SGBD:** Firebird 3.0 com `WireCrypt` habilitado
- **Host:** ver `.env` (variável `FB_HOST` — IP/host do servidor Nutify PDV na rede local)
- **Porta:** `3050`
- **Database:** caminho do `.FDB` no servidor — ver `.env` (`FB_DATABASE`)
- **Usuário/Senha:** ver `.env` (`FB_USER` / `FB_PASSWORD`) — usuário dedicado, somente leitura
- **Charset:** `ISO8859_1` → converter sempre para UTF-8 na aplicação
- **Acesso:** somente leitura — toda persistência da aplicação usa SQLite local
- **Driver:** `python-firebird-driver` com `libfbclient.so` nativo (suporte a WireCrypt)

> Conexão WSL2 → Firebird já validada e funcional com cliente nativo Linux.

---

## Mapeamento do Banco de Dados

### Tabela `PRODUTO` — campos utilizados

| Campo | Tipo | Descrição |
|---|---|---|
| `PRO_COD` | INTEGER | Código único do produto |
| `PRO_DES` | VARCHAR(80) | Nome do produto |
| `PRO_SIT` | CHAR(1) | `'A'` = Ativo |
| `PRO_IDB` | CHAR(1) | **Integração com balança:** `'S'` = sim — 463 produtos ativos |
| `PRO_MIX` | CHAR(1) | **Flag de estoque mínimo configurado:** `'S'` = sim (configurado no Nutify PDV) |
| `PRO_MIA` | VARCHAR(255) | **Valor do estoque mínimo em KG** (ex: `"1.500"`) — gerenciado pelo Nutify PDV |
| `PRO_PMC` | INT64 | Quantidade mínima sugerida de reposição |
| `PRO_QTD` | NUMERIC(15,5) | **Estoque atual em KG** |
| `PRO_VLC` | NUMERIC(15,5) | Preço de venda por KG |
| `PRO_GRU` | INTEGER | FK → `GRUPO.GRU_COD` |
| `PRO_UND` | VARCHAR(10) | Unidade de medida (ex: `'KG'`) |
| `PRO_BCO` | BLOB TEXT | **Benefícios e descrição** (texto livre em ISO8859-1) — base para a IA |

### Tabela `GRUPO`

| Campo | Descrição |
|---|---|
| `GRU_COD` | PK |
| `GRU_DES` | Nome do grupo (ex: `'GRANEL'`, `'CHÁS'`) |

### Validação real no banco — Gengibre em Pó (`PRO_COD = 4`)

```
PRO_COD  = 4
PRO_DES  = GENGIBRE EM PÓ
PRO_QTD  = 3.600 KG          ← estoque atual
PRO_MIX  = 'N'               ← mínimo ainda não configurado no Nutify PDV
PRO_MIA  = NULL              ← valor mínimo (preencher no Nutify para ativar monitoramento)
PRO_PMC  = 0
PRO_IDB  = 'S'               ← integrado à balança ✓
PRO_UND  = 'KG'
PRO_VLC  = 37.40
PRO_BCO  = "O gengibre em pó é obtido da raiz do Zingiber officinale...
             Ação anti-inflamatória... Propriedade termogênica...
             Pode auxiliar no alívio de enjoos, náuseas e desconfortos digestivos..."
```

> **Nota operacional:** `PRO_MIX`, `PRO_MIA` e `PRO_PMC` possuem tela de configuração no Nutify PDV. Para ativar o monitoramento de um produto, o operador deve habilitar o flag e informar o valor mínimo no cadastro do produto. A aplicação monitora automaticamente todos os produtos onde `PRO_IDB = 'S'` AND `PRO_MIX = 'S'` AND `PRO_MIA IS NOT NULL`.

### Exemplos reais de `PRO_BCO` (base para IA)

- **Ginseng em Pó:** "Ação adaptógena... melhora do foco, concentração e desempenho cognitivo... Ação imunomoduladora..."
- **Guaraná em Pó:** "Ação estimulante do sistema nervoso central... Propriedade termogênica... Ação antioxidante..."
- O campo `PRO_BCO` está preenchido para ~200-300 produtos ativos. Produtos sem esse campo não participam das recomendações por IA.

### Queries base

**Monitor de estoque mínimo:**
```sql
SELECT
  p.PRO_COD,
  p.PRO_DES,
  p.PRO_QTD                        AS estoque_atual_kg,
  CAST(p.PRO_MIA AS DECIMAL(10,3)) AS estoque_minimo_kg,
  p.PRO_PMC                        AS qtd_reposicao,
  g.GRU_DES                        AS grupo
FROM PRODUTO p
JOIN GRUPO g ON g.GRU_COD = p.PRO_GRU
WHERE p.PRO_SIT = 'A'
  AND p.PRO_IDB = 'S'
  AND p.PRO_MIX = 'S'
  AND p.PRO_MIA IS NOT NULL
  AND CAST(p.PRO_MIA AS DECIMAL(10,3)) > 0
ORDER BY p.PRO_DES
```

**Catálogo para IA:**
```sql
SELECT
  p.PRO_COD,
  p.PRO_DES       AS nome,
  p.PRO_VLC       AS preco_kg,
  p.PRO_QTD       AS estoque_kg,
  g.GRU_DES       AS grupo,
  p.PRO_BCO       AS beneficios
FROM PRODUTO p
JOIN GRUPO g ON g.GRU_COD = p.PRO_GRU
WHERE p.PRO_SIT = 'A'
  AND p.PRO_BCO IS NOT NULL
ORDER BY p.PRO_DES
```

---

## Aba 1 — Consultar por Objetivo (IA)

### Objetivo
O usuário informa um objetivo em linguagem natural e a IA cruza as informações de benefícios dos produtos (`PRO_BCO`) para retornar as melhores recomendações com justificativa.

### Fluxo
1. Usuário digita objetivo: _"quero emagrecer"_, _"tenho ansiedade"_, _"melhorar memória"_
2. Backend carrega catálogo com benefícios do Firebird (com cache)
3. Claude API (`claude-sonnet-4-6`) analisa o catálogo e retorna produtos relevantes
4. Frontend exibe cards: nome do produto, benefícios relacionados ao objetivo, preço por 100g, disponibilidade em estoque

### Regras de Negócio
- Objetivos iguais ou similares retornam do cache SQLite (TTL: 24h)
- Cache é invalidado quando o catálogo de produtos for atualizado no banco (verificar via hash do catálogo)
- Produtos sem estoque (`PRO_QTD = 0`) são marcados como indisponíveis, mas ainda aparecem na recomendação
- Usar **prompt caching** da Anthropic para o catálogo — o bloco de produtos fica em cache no modelo, reduzindo custo em até 90% nas chamadas repetidas

### Schema SQLite
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

---

## Aba 2 — Lista de Reabastecimento

### Objetivo
Exibir em tempo real os produtos com estoque abaixo do mínimo configurado. Quando um produto entra na lista, um alerta é enviado via Telegram. O produto sai da lista automaticamente quando o estoque for reposto.

### Regras de Negócio
1. **Critério de entrada na lista:** `PRO_QTD <= CAST(PRO_MIA AS DECIMAL) * fator_alerta`
   - Fator padrão: `1.1` (alerta com 10% de margem acima do mínimo)
   - Exemplo: mínimo = 1,000 kg → alerta quando `PRO_QTD <= 1,100 kg`
2. **Alerta único:** ao entrar na lista, envia alerta Telegram uma única vez. Nenhum novo alerta até reposição.
3. **Critério de saída da lista:** `PRO_QTD > CAST(PRO_MIA AS DECIMAL) * fator_reposicao`
   - Fator padrão: `1.5`
4. **Verificação periódica:** a cada 5 minutos (configurável via `MONITOR_INTERVAL_MINUTES`); cooldown de 24 h por produto evita re-disparo de Telegram em restarts
5. A lista exibe apenas os itens **atualmente pendentes**, sem histórico

### O que exibir na interface (por produto)
- Nome do produto
- Grupo (ex: CHÁS, GRANEL)
- **Estoque atual em KG** — campo `PRO_QTD` atualizado a cada polling
- Estoque mínimo configurado (`PRO_MIA`)
- Data e hora em que entrou na lista
- Status visual: 🔴 Crítico (abaixo do mínimo) / 🟡 Alerta (abaixo do limite com margem)
- Atualização automática da interface a cada 60 segundos (polling)

### Mensagem Telegram
```
🔴 *Estoque Mínimo Atingido — Casa Granum*

📦 Produto: GENGIBRE EM PÓ
📁 Grupo: CHÁS/ERVAS
⚖️ Estoque atual: 0,950 kg
🎯 Estoque mínimo: 1,000 kg
🛒 Qtd. sugerida de reposição: 2,000 kg

➡️ Item incluído na Lista de Reabastecimento.
```

### Schema SQLite
```sql
CREATE TABLE lista_reabastecimento (
  pro_cod        INTEGER PRIMARY KEY,
  pro_des        TEXT NOT NULL,
  grupo          TEXT,
  estoque_min_kg REAL NOT NULL,
  qtd_reposicao  REAL DEFAULT 0,
  estado         TEXT DEFAULT 'ok',   -- 'ok' | 'alerta_enviado'
  alerta_em      DATETIME,
  reposto_em     DATETIME,
  ultima_verif   DATETIME
);
```

---

## Aba 3 — Pedidos de Clientes

### Objetivo
Permitir que funcionários registrem pedidos de produtos solicitados por clientes que não estão disponíveis no momento ou que precisam ser encomendados. Exemplo: cliente solicita "Ipê Roxo" → funcionário adiciona o pedido na aba 3.

### Casos de uso
- Produto fora de estoque e cliente deseja quando chegar
- Produto não cadastrado no sistema (novo item a considerar)
- Cliente quer quantidade específica separada quando disponível

### Funcionalidades da Interface
- **Formulário de novo pedido:** campo de texto para nome do produto/item, campo para nome do cliente (opcional), campo para observação (opcional), botão "Adicionar Pedido"
- **Lista de pedidos abertos:** exibe todos os pedidos pendentes com data de registro
- **Ações por pedido:** marcar como "Atendido" (remove da lista ativa) ou "Cancelado"
- **Busca:** filtrar pedidos por nome do produto ou cliente
- Sem integração com Firebird — 100% gerenciado em SQLite local da aplicação

### Regras de Negócio
- Pedidos não têm vínculo obrigatório com `PRO_COD` — o produto pode ser um item não cadastrado
- Campo de produto é texto livre (o funcionário digita o nome como o cliente pediu)
- Se o produto existir no banco, pode exibir sugestão de autocomplete buscando em `PRODUTO.PRO_DES`
- Pedidos não expiram automaticamente — devem ser encerrados manualmente pelo funcionário
- Sem envio de Telegram para esta aba (somente operação interna)

### Schema SQLite
```sql
CREATE TABLE pedidos_clientes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_nome TEXT NOT NULL,          -- texto livre (como o cliente pediu)
  pro_cod      INTEGER,                -- FK opcional para PRODUTO.PRO_COD
  cliente_nome TEXT,                   -- nome do cliente (opcional)
  observacao   TEXT,
  status       TEXT DEFAULT 'aberto',  -- 'aberto' | 'atendido' | 'cancelado'
  criado_em    DATETIME NOT NULL,
  encerrado_em DATETIME,
  criado_por   TEXT                    -- nome do funcionário (opcional)
);
```

---

## Identidade Visual — Casa Granum

> Informações extraídas do **Manual da Marca (05/03/26)** e análise pixel-a-pixel dos arquivos de logo oficiais (`CasaGranum (2).png` e `CasaGranumSF (3).png`).

### Logotipo

O logo é composto por um **ícone de casa com espiga de grão integrada** ao lado esquerdo, e o nome **"CASA GRANUM"** em duas linhas com uma linha horizontal de base. Existe em duas versões:

| Versão | Arquivo | Uso |
|---|---|---|
| **Escura** (fundo verde-floresta) | `CasaGranum (2).png` | Fundos escuros, materiais premium |
| **Clara** (fundo branco) | `CasaGranumSF (3).png` | Fundos claros, interfaces digitais, impressão |

### Paleta de Cores

Cores extraídas por amostragem direta de pixels dos arquivos oficiais:

| Nome | HEX | RGB | Uso |
|---|---|---|---|
| **Verde Floresta** | `#16201A` | rgb(22, 32, 26) | Cor primária — fundo escuro, textos sobre fundo claro |
| **Cobre / Terracota** | `#A96132` | rgb(169, 97, 50) | Cor de destaque — "GRANUM", telhado do ícone, CTAs, destaques |
| **Branco** | `#FFFFFF` | rgb(255, 255, 255) | Fundos claros, textos sobre verde escuro |
| **Preto Suave** | `#1C2120` | rgb(28, 33, 32) | Textos de corpo, variação escura próxima ao verde |

**Gradiente de apoio (observado no manual):** o manual usa gradiente radial suave sobre fundo escuro — verde floresta com leve variação para verde ainda mais escuro no centro.

#### Uso das cores no frontend

```css
:root {
  --color-primary:    #16201A;   /* verde floresta — background escuro, nav */
  --color-accent:     #A96132;   /* cobre — botões, destaques, badges */
  --color-white:      #FFFFFF;   /* branco — texto sobre escuro, cards */
  --color-text-dark:  #1C2120;   /* texto de corpo sobre fundo claro */
  --color-surface:    #F5F0EA;   /* creme suave — fundo de cards/seções claras */
  --color-border:     #D4C4A8;   /* linha/borda sutil em tons quentes */
}
```

### Tipografia

Fontes identificadas no arquivo PDF do manual da marca:

| Fonte | Classificação | Uso no Manual | Equivalente Web (Google Fonts) |
|---|---|---|---|
| **Elizabeth** | Serif clássica elegante | Logo, títulos principais | **Playfair Display** ou **Libre Baskerville** |
| **Swiss 721 BT Condensed** | Sans-serif condensada | Corpo de texto, legendas | **Barlow Condensed** ou **Work Sans** |
| **Swiss 721 BT Bold Condensed** | Sans-serif condensada negrito | Subtítulos, ênfase | **Barlow Condensed 700** |

**Recomendação de implementação web:**
```html
<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet">
```

```css
/* Tipografia */
font-family-heading: 'Playfair Display', Georgia, serif;    /* títulos, logo text */
font-family-body:    'Barlow Condensed', sans-serif;        /* corpo, labels, UI */
```

### Personalidade e Tom da Marca

Com base no visual do manual e da identidade da loja:

- **Natural e artesanal** — produtos a granel, saudáveis, sem processamento
- **Premium acessível** — qualidade com proximidade e calor humano
- **Clássico e confiável** — tipografia serif, cores terrosas, estética atemporal
- **Próximo da natureza** — verde floresta, cobre/âmbar, tons de terra e grão

### Diretrizes de Aplicação no Frontend

#### Layout geral
- **Fundo da aplicação (modo claro):** branco `#FFFFFF` ou creme `#F5F0EA`
- **Navbar/Header:** verde floresta `#16201A` com logo na versão clara (`CasaGranumSF`)
- **Fundo da aplicação (modo escuro opcional):** `#16201A` com logo escuro (`CasaGranum`)
- **Cards de produto:** fundo branco ou creme, borda sutil `#D4C4A8`, sombra leve
- **Botão primário (CTA):** fundo `#A96132` (cobre), texto branco, hover com variação mais escura `#8B4E28`
- **Abas ativas:** indicador em cobre `#A96132`, texto em verde floresta

#### Ícones e elementos visuais
- Usar ícones de linha simples (Lucide ou Phosphor Icons) — estilo orgânico e limpo
- Evitar elementos muito tecnológicos ou frios (sem azuis corporativos, sem gradientes neon)
- Preferir cantos levemente arredondados (`border-radius: 6-8px`) — warm, não duro

#### Estados de alerta (Aba 2 — Reabastecimento)
- 🔴 Crítico: badge vermelho escuro `#C0392B`
- 🟡 Alerta: badge âmbar `#D4A017` (complementa a paleta terrosa)
- ✅ OK: badge verde `#2E7D32`

#### Aba 1 — Consultar por Objetivo
- Campo de busca centralizado, amplo, com placeholder acolhedor: *"Qual é o seu objetivo hoje?"*
- Botões de atalho (tags): `"Emagrecer"`, `"Energia"`, `"Ansiedade"`, `"Imunidade"`, `"Sono"` — fundo creme com borda cobre
- Cards de resultado: foto/ícone do produto, nome em Playfair Display, resumo do benefício, preço por 100g, badge de disponibilidade

#### Aba 3 — Pedidos de Clientes
- Interface limpa e operacional — foco em eficiência para o funcionário
- Formulário com campos claros, botão de ação em cobre
- Lista de pedidos abertos com data, produto, cliente e status

### Assets Disponíveis

```
/home/alexzera/homelab/Logo-Casa Granum/
├── CasaGranum (2).png       # Logo versão escura (2363×2363px) — fundo verde floresta
└── CasaGranumSF (3).png     # Logo versão clara (2363×2363px) — fundo transparente/branco
```

> Para uso no frontend, converter os logos para `.svg` ou usar os `.png` com compressão adequada (`webp`). A versão clara (`SF`) é a recomendada para uso em interfaces digitais sobre fundo branco.

---

## Decisão de Tecnologia e Deploy

### Análise do Ambiente
| Fator | Situação |
|---|---|
| OS de produção | Windows (Nutify PDV roda em Windows) |
| WSL2 | Disponível e funcional na mesma máquina |
| Firebird WireCrypt | Requer cliente nativo — já validado via WSL2 + `libfbclient.so` |
| Acesso Firebird | Somente leitura — escrita apenas via SQLite local |

### Stack

#### Backend: Python 3.12 + FastAPI
| Pacote | Uso |
|---|---|
| `python-firebird-driver` | Conexão Firebird 3.0 com WireCrypt via `libfbclient.so` |
| `anthropic` | Claude API com prompt caching |
| `python-telegram-bot` v21+ | Alertas Telegram assíncronos |
| `APScheduler` | Loop periódico do monitor de estoque |
| `aiosqlite` | Persistência local (cache IA, lista reabastecimento, pedidos clientes) |
| `fastapi` + `uvicorn` | API REST |
| `pydantic-settings` | Leitura de variáveis de ambiente tipadas |

#### Frontend: Next.js 14 + Tailwind CSS
| Pacote | Uso |
|---|---|
| `shadcn/ui` | Componentes acessíveis e modernos |
| `Framer Motion` | Animações suaves |
| `SWR` ou `TanStack Query` | Polling automático e cache de requisições |
| Identidade visual Casa Granum | Cores, tipografia e assets a fornecer |

#### Deploy: Docker Compose no WSL2 ✅
- Solução recomendada: isolamento de dependências, fácil atualização, sem instalações adicionais no Windows
- Containers reiniciam automaticamente via `restart: unless-stopped`
- Configurar WSL2 para iniciar Docker no boot do Windows (`/etc/wsl.conf` + `systemd`)

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    volumes:
      - ./data:/app/data    # SQLite persistente
    env_file: .env
    ports:
      - "8000:8000"
    restart: unless-stopped

  frontend:
    build: ./frontend
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped
```

---

## Estrutura de Pastas

```
casa-granum-system/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── firebird.py           # Conexão, pool, encoding BLOB ISO8859-1→UTF-8
│   │   │   └── sqlite.py             # Setup tabelas e helpers
│   │   ├── modules/
│   │   │   ├── monitor/
│   │   │   │   ├── scheduler.py      # APScheduler
│   │   │   │   ├── checker.py        # Lógica estoque mínimo
│   │   │   │   └── telegram.py       # Envio de alerta
│   │   │   └── recommendations/
│   │   │       ├── catalog.py        # Carrega PRO_BCO, decodifica BLOBs
│   │   │       ├── ai.py             # Claude API + prompt caching
│   │   │       └── cache.py          # Hash objetivo + catálogo, TTL, invalidação
│   │   └── routers/
│   │       ├── recomendacoes.py      # POST /recomendacoes
│   │       ├── reabastecimento.py    # GET /reabastecimento
│   │       └── pedidos.py            # CRUD /pedidos
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # Aba 1: Consultar por Objetivo
│   │   ├── reabastecimento/
│   │   │   └── page.tsx              # Aba 2: Lista de Reabastecimento
│   │   └── pedidos/
│   │       └── page.tsx              # Aba 3: Pedidos de Clientes
│   ├── components/
│   │   ├── ObjectiveSearch.tsx
│   │   ├── ProductCard.tsx
│   │   ├── RestockTable.tsx          # Exibe PRO_QTD atual + mínimo + status
│   │   └── OrderForm.tsx             # Formulário de pedido manual
│   ├── Dockerfile
│   └── package.json
├── data/                             # Volume persistente SQLite
├── docker-compose.yml
├── .env
└── .env.example
```

---

## Variáveis de Ambiente (`.env`)

Veja o arquivo [`.env.example`](./.env.example) na raiz do projeto. Copie para `.env`
e preencha com os valores reais do seu ambiente. **Nunca commite `.env`.**

> Nota: o stack atual usa **Gemini** (`google-genai`) em vez de Anthropic Claude.
> A chave é `GEMINI_API_KEY` e o modelo padrão é `gemini-2.5-flash`.

---

## Skills do Claude Code para Ativar no Desenvolvimento

### Instrução de contexto (incluir no início de cada sessão)

```
# Contexto — Sistema Casa Granum

Stack: Python 3.12 + FastAPI (backend), Next.js 14 + Tailwind + shadcn/ui (frontend).
Deploy: Docker Compose no WSL2.

Banco principal: Firebird 3.0 com WireCrypt (host/porta configurados via `.env`).
Driver: python-firebird-driver com libfbclient.so nativo (suporte a WireCrypt).
Charset Firebird: ISO8859_1 — converter SEMPRE para UTF-8 ao ler strings e BLOBs.
Acesso: SOMENTE LEITURA. Nunca tentar INSERT/UPDATE/DELETE no Firebird.

Campos-chave da tabela PRODUTO:
  PRO_IDB = 'S'  → integração com balança (463 produtos ativos)
  PRO_MIX = 'S'  → estoque mínimo configurado no Nutify PDV
  PRO_MIA        → valor do estoque mínimo em KG (VARCHAR, ex: "1.500")
  PRO_QTD        → estoque atual em KG (NUMERIC)
  PRO_BCO        → benefícios do produto (BLOB TEXT, ISO8859-1)

Banco local: SQLite via aiosqlite.
Tabelas SQLite: lista_reabastecimento, recomendacao_cache, pedidos_clientes.

IA: Claude Sonnet 4.6 via Anthropic SDK com prompt caching habilitado para o catálogo.
O catálogo (~200-300 produtos com PRO_BCO) deve ser enviado como bloco cached no system prompt.

Três abas principais:
  1. Consultar por Objetivo — IA recomenda produtos por objetivo do usuário
  2. Lista de Reabastecimento — produtos com estoque abaixo do mínimo (mostra PRO_QTD atual)
  3. Pedidos de Clientes — registro manual de pedidos feitos por clientes para funcionários

Nunca commitar .env. Sempre usar variáveis de ambiente via pydantic-settings.
```

### Skills recomendadas

| Skill | Quando ativar |
|---|---|
| `frontend-design` | Implementação do frontend — identidade visual Casa Granum, qualidade visual das 3 abas |
| `claude-api` | Implementação de `ai.py` — garantir uso correto de prompt caching, streaming e tratamento de erros da Anthropic SDK |
| `security-review` | Antes de cada deploy — checar CORS, endpoints sem autenticação, credenciais expostas |
| `simplify` | Após cada módulo — remover abstrações desnecessárias, código duplicado |

---

## Fases de Desenvolvimento

### Fase 1 — Infraestrutura Base
- [ ] Repositório Git com `.gitignore`, `.env.example`, `README.md`
- [ ] `docker-compose.yml` base com backend e frontend
- [ ] `firebird.py` — pool de conexões, tratamento WireCrypt, decodificação BLOB ISO8859-1→UTF-8
- [ ] `sqlite.py` — criação das tabelas `lista_reabastecimento`, `recomendacao_cache`, `pedidos_clientes`
- [ ] Teste de conexão e query no produto Gengibre em Pó (`PRO_COD = 4`)

### Fase 2 — Monitor de Estoque + Aba 2
- [ ] `checker.py` — lê `PRO_MIX='S'` + `PRO_IDB='S'` + `PRO_MIA`, compara com `PRO_QTD`
- [ ] `telegram.py` — alerta único por produto com estoque atual + mínimo
- [ ] `scheduler.py` — loop APScheduler com intervalo configurável
- [ ] `routers/reabastecimento.py` — `GET /reabastecimento` com `PRO_QTD` atual
- [ ] Frontend Aba 2 — tabela com polling 60s, exibindo estoque atual, mínimo e status 🔴/🟡

### Fase 3 — Pedidos de Clientes + Aba 3
- [ ] `routers/pedidos.py` — `GET /pedidos`, `POST /pedidos`, `PATCH /pedidos/{id}` (status)
- [ ] Frontend Aba 3 — formulário de novo pedido, lista de pedidos abertos, ações de encerramento
- [ ] Autocomplete opcional: busca em `PRODUTO.PRO_DES` ao digitar o nome do produto

### Fase 4 — Motor de IA + Aba 1
- [ ] `catalog.py` — carrega catálogo do Firebird, decodifica BLOBs, normaliza texto
- [ ] `ai.py` — system prompt com catálogo como bloco cached + instrução de análise por objetivo
- [ ] `cache.py` — hash objetivo + hash catálogo, persistência SQLite, invalidação por TTL e mudança
- [ ] `routers/recomendacoes.py` — `POST /recomendacoes` com `{"objetivo": "emagrecer"}`
- [ ] Frontend Aba 1 — busca por objetivo, botões de atalho, cards de produtos recomendados

### Fase 5 — Identidade Visual e Polimento
- [ ] Aplicar identidade visual Casa Granum (cores, tipografia — a fornecer)
- [ ] Responsividade mobile
- [ ] Animações e transições suaves entre abas
- [ ] Testes visuais e funcionais nas 3 abas

### Fase 6 — Deploy e Produção
- [ ] Configurar `systemd` no WSL2 para iniciar Docker no boot do Windows
- [ ] Logs estruturados com `structlog`
- [ ] Health checks: `GET /health`
- [ ] Documentação operacional: como configurar estoque mínimo no Nutify PDV, como registrar pedidos

---

## Notas Técnicas Críticas

### WireCrypt no Docker
```dockerfile
# Instalar cliente Firebird com suporte a WireCrypt
RUN apt-get install -y firebird3.0-utils
```

### Leitura de BLOB no Python (PRO_BCO)
```python
cursor.execute("SELECT PRO_COD, PRO_DES, PRO_BCO FROM PRODUTO WHERE ...")
for row in cursor:
    blob = row[2]
    texto = blob.read().decode('iso-8859-1') if blob else None
```

### Prompt Caching com Catálogo (Anthropic SDK)
```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    system=[
        {
            "type": "text",
            "text": catalogo_formatado,           # ~200-300 produtos
            "cache_control": {"type": "ephemeral"} # mantido em cache pelo modelo
        },
        {
            "type": "text",
            "text": "Analise os produtos acima e recomende os mais adequados para o objetivo informado..."
        }
    ],
    messages=[{"role": "user", "content": objetivo}]
)
```

### Configurar Estoque Mínimo no Nutify PDV
Para que um produto seja monitorado pela aplicação:
1. Abrir cadastro do produto no Nutify PDV
2. Habilitar flag de estoque mínimo → `PRO_MIX = 'S'`
3. Preencher o valor mínimo em KG → `PRO_MIA = "1.500"` (por exemplo)
4. Salvar — na próxima verificação (até 5 minutos por padrão), o produto já entra no monitoramento; o catálogo da IA também é atualizado em até 60 s
