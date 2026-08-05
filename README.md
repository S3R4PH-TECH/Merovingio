# Merovíngio

Plataforma self-hosted de automação de segurança ofensiva (purple team) e orquestração de reconhecimentos/varreduras baseada em n8n, FastAPI, OpenSearch e MinIO.

Documentação de arquitetura e decisões de projeto: [`ARCHITECTURE_AND_ROADMAP.md`](ARCHITECTURE_AND_ROADMAP.md) | Guia de próximos passos: [`NEXT_STEPS.md`](NEXT_STEPS.md).

---

## 🎯 Escopo de Uso & Decisões Operacionais

- **Ferramenta Interna de Purple Team**: Executada exclusivamente em ambiente de desenvolvimento/operação local (`localhost`), protegida por autenticação JWT e validação estrita de escopo via `scope_guard.py`.
- **Custódia Isolada de Ferramentas Ofensivas**: O n8n **nunca** executa binários ofensivos diretamente. Toda ferramenta senta atrás de um **Tool Execution Service (TES)** HTTP dedicado sob a custódia do `Pentesters-Team`.
- **Padrão de Callback Assíncrono (Sem Polling)**: O n8n utiliza o nó *Wait Webhook*. Quando um TES encerra a execução, ele chama o `/internal/tes-callback` no Gateway, que persiste os assets/findings no Postgres, indexa no OpenSearch e retoma a execução no n8n.

---

## 🏗️ Arquitetura da Stack Local (11 Contêineres)

### 1. Frontend Shell (SPA Web)
- **Tecnologias**: Vite + React + TypeScript + Vanilla CSS (Glassmorphism UI / Dark Mode).
- **Interface**: Dashboard de Execuções, Workflow Launcher, Gestor de Targets/Escopo e Monitoramento de TES.
- **Acesso Local**: `http://localhost:5173`

### 2. Backend Gateway (`backend-gateway/`)
- **Tecnologias**: Python 3.13, FastAPI, SQLAlchemy 2.0 (Async), Alembic, AsyncPG.
- **Porta**: `18000`
- **Funcionalidades**: RBAC (Workspace ➔ Program ➔ Target), Autenticação JWT, Registro de TES (`/admin/tes`), Webhooks n8n, Validação de Escopo e Auditoria.

### 3. Orquestrador n8n
- **Porta**: `15678` (Editor n8n em Queue Mode com Redis + Postgres).

### 4. Busca & Indexação (OpenSearch + Indexer)
- **OpenSearch 2.18**: Cluster single-node (`9200`).
- **`data-indexer`**: Microsserviço FastAPI (`8000`) com cliente `opensearch-py`, gerenciando os índices `assets_v1` e `findings_v1` com buscas full-text (`/search/assets`, `/search/findings`).

### 5. Pipeline de Dados & Versionamento (MinIO + Data Sync)
- **MinIO**: Object Storage S3 (`19000` API, `19001` Console).
- **`data-sync-svc`**: Ingestor e espelho de inteligência (`s3://wordlists`, `s3://resolvers`, `s3://cve`) com versionamento por snapshot (`s3://<bucket>/<timestamp>/` + `latest.json`).
- **Datasets**: SecLists, Trickest CVE, NVD API 2.0 e Pools de Resolvers DNS.

---

## 🛠️ Tool Execution Services (TES) Ativos

Todos os TES pertencem ao `Pentesters-Team` e operam com tokens estáticos de autenticação interna e concorrência controlada por semáforo:

| TES | Ferramentas Encapsuladas | Endereço Interno | Descrição |
|---|---|---|---|
| **`theharvester`** | theHarvester | `http://recon-runner:8000` | OSINT e enumeração de subdomínios/emails. |
| **`pd-recon`** | `subfinder`, `httpx`, `katana`, `naabu`, `cvemap` | `http://pd-recon:8000` | Recon DNS, HTTP probing, web crawling e port scan rápido. |
| **`pd-vuln`** | `nuclei` + `nuclei-templates` | `http://pd-vuln:8000` | Varredura ativa de vulnerabilidades web/infra. |
| **`net-scan`** | `nmap` | `http://net-scan:8000` | Varredura de serviços/portas com sanitização de flags. |
| **`web-utils`** | `cariddi`, `gmapsapiscanner` | `http://web-utils:8000` | Extração de segredos/endpoints JS e auditoria de chaves de API. |

---

## 🚀 Como Executar a Plataforma

### 1. Criar a Rede Externa e Subir a Stack
```bash
# Rede comum para comunicação entre contêineres TES e Gateway
docker network create recon_net || true

# Subir a stack inteira do Merovíngio + TES
cd Workspace/Merovingio && docker compose up -d --build
```

### 2. Seed Automático do Banco de Dados
```bash
# Rodar migrações Alembic
docker exec merovingio-backend-gateway python -m alembic upgrade head

# Popular os 5 TES no Postgres
docker exec merovingio-backend-gateway python3 scripts/seed_tes.py

# Seed do usuário administrador inicial
docker exec merovingio-backend-gateway python3 scripts/seed_user.py --email admin@example.com --password 'Password123!'
```

### 3. Iniciar o Frontend Web
```bash
cd Workspace/Merovingio/frontend && npm run dev
```
Acesse **`http://localhost:5173`** no navegador.

---

## 🧪 Testes Automatizados

```bash
# Backend Gateway (43 testes contra Postgres real)
cd backend-gateway && PLATFORM_TEST_DATABASE_URL=postgresql+asyncpg://gateway:gateway@localhost:15433/gateway_test .venv/bin/python -m pytest

# TES pd-recon (4 testes)
cd ../../Pentesters-Team/services/pd-recon && PYTHONPATH=. python3 -m pytest

# TES pd-vuln (4 testes)
cd ../pd-vuln && PYTHONPATH=. python3 -m pytest

# TES net-scan (4 testes)
cd ../net-scan && PYTHONPATH=. python3 -m pytest

# TES web-utils (4 testes)
cd ../web-utils && PYTHONPATH=. python3 -m pytest

# Serviço Data Indexer (2 testes)
cd ../../../Workspace/Merovingio/data-indexer && PYTHONPATH=. python3 -m pytest

# Serviço Data Sync (6 testes)
cd ../data-sync-svc && PYTHONPATH=. python3 -m pytest
```

---

## 📂 Estrutura de Diretórios

- [`backend-gateway/`](backend-gateway/) — API Gateway da Plataforma (FastAPI + SQLAlchemy/Alembic).
- [`frontend/`](frontend/) — SPA Web em React + TypeScript + Vite.
- [`data-indexer/`](data-indexer/) — Microsserviço de Busca e Indexação com OpenSearch.
- [`data-sync-svc/`](data-sync-svc/) — Microsserviço de Ingestão e Versionamento em MinIO.
- [`workflows/`](workflows/) — Definições de Workflows n8n em JSON exportado ([`recon-baseline.json`](workflows/recon-baseline.json)).
- [`docker-compose.yml`](docker-compose.yml) — Arquivo de orquestração dos 11 contêineres Docker.
