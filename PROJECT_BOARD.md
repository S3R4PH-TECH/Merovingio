# 📋 QUADRO DE PROJETO, TO DO & TAXONOMIA DE TIPOS — MEROVÍNGIO
## Repositório: `S3R4PH-TECH/Merovingio`

Este documento consolida o estado do **Quadro de Tarefas (TO DO Board)** do projeto Merovíngio no GitHub, categorizado por **Status** (Concluídas, Em Andamento, Pendentes) e mapeado por **Tipos de Tarefa (`type:*`)**.

---

## 🏷️ Taxonomia de Tipos (`type:*`)

- 🔐 `type:security` — Segurança, Autenticação, RBAC, Scope Guard, Credenciais e Enforcement.
- ✨ `type:feature` — Funcionalidades Core, Microsserviços TES, Endpoints REST e Observabilidade.
- 🐳 `type:infra` — DevOps, Docker Compose, AWS EC2, Redes e Autonomia da Stack.
- 🎨 `type:ui` — Interface Frontend SPA, Telas React, Componentes Visuais e Wiring.
- ⚡ `type:workflow` — Orquestração n8n, Grafos de Execução, Callbacks e Error Workflows.
- 📊 `type:data` — Indexação de Busca, OpenSearch, Pipelines de Sync de Inteligência e Vulnerabilidades.
- 🗄️ `type:database` — Banco de Dados, Migrações Alembic, Schemas e Modelagem ORM.

---

## 🟢 CONCLUÍDAS (Done)

- [x] **[CONCLUÍDO] Autenticação JWT e RBAC Multi-tenant (`backend-gateway`)**
  - *Tipo:* `type:security` (🔐 Segurança & Autenticação)
  - *Descrição:* Implementação da autenticação JWT (`bcrypt` direto + PyJWT) e RBAC multi-tenant (`Workspace` ➔ `Program` ➔ `Target`) com audit log no `backend-gateway`.
  - *GitHub Issue:* `#1` | *Labels:* `status:concluido`, `type:security`

- [x] **[CONCLUÍDO] Scope Guard & Validação de Escopo FQDN/CIDR**
  - *Tipo:* `type:security` (🔐 Segurança & Escopo)
  - *Descrição:* Middleware e guard de escopo (`app/scope.py`) com suporte a matching de FQDNs, subdomínios, blocos CIDR e vetos out-of-scope.
  - *GitHub Issue:* `#2` | *Labels:* `status:concluido`, `type:security`

- [x] **[CONCLUÍDO] Ciclo de Vida Assíncrono TES Lease & Callbacks**
  - *Tipo:* `type:workflow` (⚡ Orquestração n8n & Callbacks)
  - *Descrição:* Endpoints `/internal/execution-started`, `/internal/tes-lease`, `/internal/tes-callback` e `/internal/n8n-callback` para orquestração de ferramentas sem polling.
  - *GitHub Issue:* `#3` | *Labels:* `status:concluido`, `type:workflow`

- [x] **[CONCLUÍDO] Registro Dinâmico de TES (`tes_registry`)**
  - *Tipo:* `type:security` (🔐 Segurança & Registry)
  - *Descrição:* Endpoints `/admin/tes` para cadastro e consulta de Tool Execution Services ocultando `static_token` através da flag `has_static_token`.
  - *GitHub Issue:* `#4` | *Labels:* `status:concluido`, `type:security`

- [x] **[CONCLUÍDO] PoC Vertical Recon Baseline (n8n + theHarvester)**
  - *Tipo:* `type:workflow` (⚡ Orquestração n8n & PoC)
  - *Descrição:* Validação end-to-end do workflow `recon-baseline.json` persistindo 83 subdomínios descobertos como `Asset` no Postgres da plataforma.
  - *GitHub Issue:* `#5` | *Labels:* `status:concluido`, `type:workflow`

- [x] **[CONCLUÍDO] Desacoplamento do Trickest SaaS & SaaS-Token**
  - *Tipo:* `type:security` (🔐 Segurança & Desacoplamento)
  - *Descrição:* Zerar dependências do SaaS Trickest comercial e tokens legados, garantindo autonomia self-hosted.
  - *GitHub Issue:* `#6` | *Labels:* `status:concluido`, `type:security`

- [x] **[CONCLUÍDO] Shell do Frontend SPA (React + Vite + Tailwind Glassmorphism)**
  - *Tipo:* `type:ui` (🎨 Frontend SPA & UI)
  - *Descrição:* Interface SPA moderna em React + TypeScript com navegação por hash, telas de Dashboard, Targets, Workflows, Runs e Findings.
  - *GitHub Issue:* `#7` | *Labels:* `status:concluido`, `type:ui`

- [x] **[CONCLUÍDO] Microserviços TES Base (`recon-runner`, `pd-recon`, `net-scan`)**
  - *Tipo:* `type:feature` (✨ Core Feature & TES)
  - *Descrição:* Executores TES em FastAPI para theHarvester, subfinder, httpx e nmap com scope guard embutido.
  - *GitHub Issue:* `#8` | *Labels:* `status:concluido`, `type:feature`

- [x] **[CONCLUÍDO] Indexador de Busca `data-indexer` com OpenSearch 2.18**
  - *Tipo:* `type:data` (📊 Dados & Indexação OpenSearch)
  - *Descrição:* Microserviço em FastAPI integrado ao OpenSearch para indexação e busca textual de Assets e Findings.
  - *GitHub Issue:* `#9` | *Labels:* `status:concluido`, `type:data`

- [x] **[CONCLUÍDO] Internalização do Scope Guard sem `sys.path` bridge**
  - *Tipo:* `type:security` (🔐 Segurança & Code Hardening)
  - *Descrição:* Internalização da lógica de escopo para dentro do repositório Merovíngio eliminando ponte externa com `Pentesters-Team`.
  - *GitHub Issue:* `#10` | *Labels:* `status:concluido`, `type:security`

---

## 🟡 EM ANDAMENTO (In Progress)

- [/] **[EM ANDAMENTO] Novos TES Microservices (`pd-scan`, `pd-crawler`, `fuzz-svc`)**
  - *Tipo:* `type:feature` (✨ Core Feature & TES Microservices)
  - *Descrição:* Criação e homologação dos TES para Nuclei, Katana, GoSpider, ffuf e dirsearch com init-containers para SecLists e Nuclei-Templates.
  - *GitHub Issue:* `#11` | *Labels:* `status:em-andamento`, `type:feature`

- [/] **[EM ANDAMENTO] Workflow Encadeado `recon-full-chain.json`**
  - *Tipo:* `type:workflow` (⚡ Orquestração n8n & Workflows)
  - *Descrição:* Homologação do workflow encadeado Subfinder ➔ Naabu ➔ Nuclei com n8n Native Credentials e callbacks de status dinâmico.
  - *GitHub Issue:* `#12` | *Labels:* `status:em-andamento`, `type:workflow`

- [/] **[EM ANDAMENTO] Endpoints de Listagem Paginados no Gateway (`GET /workspaces`, `/programs`, `/workflows`, `/runs`, `/assets`, `/findings`)**
  - *Tipo:* `type:feature` (✨ Core Feature & Gateway REST APIs)
  - *Descrição:* Finalização e testes das rotas `GET` de leitura com paginação e filtro por Workspace/Program no `backend-gateway`.
  - *GitHub Issue:* `#13` | *Labels:* `status:em-andamento`, `type:feature`

- [/] **[EM ANDAMENTO] Conexão da UI do Frontend com as APIs Dinâmicas do Gateway**
  - *Tipo:* `type:ui` (🎨 Frontend SPA & API Wiring)
  - *Descrição:* Substituição do mock visual do React SPA pelas requisições HTTP reais apontando para o `backend-gateway`.
  - *GitHub Issue:* `#14` | *Labels:* `status:em-andamento`, `type:ui`

- [/] **[EM ANDAMENTO] Migration Alembic `9f4a1c7d2b83` (coluna `resume_url`)**
  - *Tipo:* `type:database` (🗄️ Banco de Dados & Migração Alembic)
  - *Descrição:* Aplicação e validação da migration que adiciona a coluna `resume_url` em `tool_execution_jobs` prevenindo erros no `tes_lease`.
  - *GitHub Issue:* `#15` | *Labels:* `status:em-andamento`, `type:database`

---

## 🔴 PENDENTES (Todo)

- [ ] **[PENDENTE] Sanitização de Segredos Hardcoded nos JSONs dos Workflows n8n**
  - *Tipo:* `type:security` (🔐 Segurança & Credentials Hardening)
  - *Descrição:* Remover tokens `X-Internal-Token` hardcoded dos arquivos JSON de workflow e migrar para n8n Native Credentials.
  - *GitHub Issue:* `#16` | *Labels:* `status:pendente`, `type:security`

- [ ] **[PENDENTE] Implementação de Error Workflow Global no n8n**
  - *Tipo:* `type:workflow` (⚡ Orquestração n8n & Resiliência)
  - *Descrição:* Adicionar Error Workflow no n8n para capturar falhas no meio da execução e atualizar o `Run.status` para `failed` evitando estado órfão.
  - *GitHub Issue:* `#17` | *Labels:* `status:pendente`, `type:workflow`

- [ ] **[PENDENTE] Internalização Total e Autonomia dos TES no Repositório Merovíngio**
  - *Tipo:* `type:infra` (🐳 Infraestrutura & Autonomia Containerizada)
  - *Descrição:* Migrar os microsserviços TES do diretório `Pentesters-Team` para o repositório/compose do Merovíngio, permitindo execução 100% autônoma.
  - *GitHub Issue:* `#18` | *Labels:* `status:pendente`, `type:infra`

- [ ] **[PENDENTE] Validação de Escopo Estrita Fail-Closed nos TES**
  - *Tipo:* `type:security` (🔐 Segurança & Scope Enforcement)
  - *Descrição:* Tornar o escopo obrigatório em todos os TES no momento do lease, retornando `403 Forbidden` caso ausente e eliminando fallback local `scope.json`.
  - *GitHub Issue:* `#19` | *Labels:* `status:pendente`, `type:security`

- [ ] **[PENDENTE] Migração para Rede Docker Autônoma (`merovingio-net`)**
  - *Tipo:* `type:infra` (🐳 Infraestrutura & Redes Docker)
  - *Descrição:* Substituir a dependência da rede externa `recon_net` por uma rede Docker própria da stack Merovíngio no `docker-compose.yml`.
  - *GitHub Issue:* `#20` | *Labels:* `status:pendente`, `type:infra`

- [ ] **[PENDENTE] Componente de Validação Visual de Escopo no Frontend**
  - *Tipo:* `type:ui` (🎨 Frontend SPA & Componentes UI)
  - *Descrição:* Desenvolver componente na UI para colar listas de FQDNs/CIDRs e visualizar o preview de aceitação/veto do guard de escopo antes de rodar scans.
  - *GitHub Issue:* `#21` | *Labels:* `status:pendente`, `type:ui`

- [ ] **[PENDENTE] Healthcheck Dinâmico dos TES (`GET /tools`)**
  - *Tipo:* `type:feature` (✨ Core Feature & Observabilidade TES)
  - *Descrição:* Implementar monitoramento ativo que faz ping nos endpoints `/healthz` dos TES cadastrados e atualiza o `health_status` em tempo real na UI.
  - *GitHub Issue:* `#22` | *Labels:* `status:pendente`, `type:feature`

- [ ] **[PENDENTE] Resiliência e Tratamento de Exceções no `data-indexer`**
  - *Tipo:* `type:data` (📊 Dados & Resiliência OpenSearch)
  - *Descrição:* Remover `try/except` silenciosos no `data-indexer` e retornar erro HTTP `503 Service Unavailable` quando o OpenSearch estiver fora do ar.
  - *GitHub Issue:* `#23` | *Labels:* `status:pendente`, `type:data`

- [ ] **[PENDENTE] Pipelines de Sync Reais no `data-sync-svc` (NVD API 2.0 / SecLists)**
  - *Tipo:* `type:data` (📊 Dados & Sync de Inteligência Offensiva)
  - *Descrição:* Implementar os conectores de sincronização de inteligência ofensiva com NVD API 2.0 (usando `NVD_API_KEY`), GHSA, OSV.dev e SecLists.
  - *GitHub Issue:* `#24` | *Labels:* `status:pendente`, `type:data`

- [ ] **[PENDENTE] Provisionamento e Go-Live na Instância AWS EC2**
  - *Tipo:* `type:infra` (🐳 Infraestrutura & Deploy AWS EC2)
  - *Descrição:* Provisionar a instância EC2 (`c6i.xlarge`), configurar Security Groups (HTTPS 443 / SSH VPN), SSL com Nginx, `.env` de prod e efetuar o deploy final.
  - *GitHub Issue:* `#25` | *Labels:* `status:pendente`, `type:infra`
