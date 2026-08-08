# 📋 QUADRO DE PROJETO & TO DO — MEROVÍNGIO
## Repositório: `S3R4PH-TECH/Merovingio`

Este documento reflete o estado do **Quadro de Tarefas (TO DO Board)** do projeto Merovíngio, organizado com base no [RELATÓRIO DE PRONTIDÃO DE PRODUÇÃO E DESACOPLAMENTO](file:///home/s3r4ph/Documents/S3R4PH%20TECH/Workspace/Merovingio/RELATORIO_PRONTIDAO_PRODUCAO.md). As tarefas foram criadas e categorizadas no GitHub com as labels `status:concluido`, `status:em-andamento` e `status:pendente`.

---

## 🟢 CONCLUÍDAS (Done)

- [x] **[CONCLUÍDO] Autenticação JWT e RBAC Multi-tenant (`backend-gateway`)**
  - *Descrição:* Implementação da autenticação JWT (`bcrypt` direto + PyJWT) e RBAC multi-tenant (`Workspace` ➔ `Program` ➔ `Target`) com audit log no `backend-gateway`.
  - *GitHub Issue:* `#1` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Scope Guard & Validação de Escopo FQDN/CIDR**
  - *Descrição:* Middleware e guard de escopo (`app/scope.py`) com suporte a matching de FQDNs, subdomínios, blocos CIDR e vetos out-of-scope.
  - *GitHub Issue:* `#2` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Ciclo de Vida Assíncrono TES Lease & Callbacks**
  - *Descrição:* Endpoints `/internal/execution-started`, `/internal/tes-lease`, `/internal/tes-callback` e `/internal/n8n-callback` para orquestração de ferramentas sem polling.
  - *GitHub Issue:* `#3` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Registro Dinâmico de TES (`tes_registry`)**
  - *Descrição:* Endpoints `/admin/tes` para cadastro e consulta de Tool Execution Services ocultando `static_token` através da flag `has_static_token`.
  - *GitHub Issue:* `#4` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] PoC Vertical Recon Baseline (n8n + theHarvester)**
  - *Descrição:* Validação end-to-end do workflow `recon-baseline.json` persistindo 83 subdomínios descobertos como `Asset` no Postgres da plataforma.
  - *GitHub Issue:* `#5` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Desacoplamento do Trickest SaaS & SaaS-Token**
  - *Descrição:* Zerar dependências do SaaS Trickest comercial e tokens legados, garantindo autonomia self-hosted.
  - *GitHub Issue:* `#6` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Shell do Frontend SPA (React + Vite + Tailwind Glassmorphism)**
  - *Descrição:* Interface SPA moderna em React + TypeScript com navegação por hash, telas de Dashboard, Targets, Workflows, Runs e Findings.
  - *GitHub Issue:* `#7` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Microserviços TES Base (`recon-runner`, `pd-recon`, `net-scan`)**
  - *Descrição:* Executores TES em FastAPI para theHarvester, subfinder, httpx e nmap com scope guard embutido.
  - *GitHub Issue:* `#8` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Indexador de Busca `data-indexer` com OpenSearch 2.18**
  - *Descrição:* Microserviço em FastAPI integrado ao OpenSearch para indexação e busca textual de Assets e Findings.
  - *GitHub Issue:* `#9` | *Label:* `status:concluido`

- [x] **[CONCLUÍDO] Internalização do Scope Guard sem `sys.path` bridge**
  - *Descrição:* Internalização da lógica de escopo para dentro do repositório Merovíngio eliminando ponte externa com `Pentesters-Team`.
  - *GitHub Issue:* `#10` | *Label:* `status:concluido`

---

## 🟡 EM ANDAMENTO (In Progress)

- [/] **[EM ANDAMENTO] Novos TES Microservices (`pd-scan`, `pd-crawler`, `fuzz-svc`)**
  - *Descrição:* Criação e homologação dos TES para Nuclei, Katana, GoSpider, ffuf e dirsearch com init-containers para SecLists e Nuclei-Templates.
  - *GitHub Issue:* `#11` | *Label:* `status:em-andamento`

- [/] **[EM ANDAMENTO] Workflow Encadeado `recon-full-chain.json`**
  - *Descrição:* Homologação do workflow encadeado Subfinder ➔ Naabu ➔ Nuclei com n8n Native Credentials e callbacks de status dinâmico.
  - *GitHub Issue:* `#12` | *Label:* `status:em-andamento`

- [/] **[EM ANDAMENTO] Endpoints de Listagem Paginados no Gateway (`GET /workspaces`, `/programs`, `/workflows`, `/runs`, `/assets`, `/findings`)**
  - *Descrição:* Finalização e testes das rotas `GET` de leitura com paginação e filtro por Workspace/Program no `backend-gateway`.
  - *GitHub Issue:* `#13` | *Label:* `status:em-andamento`

- [/] **[EM ANDAMENTO] Conexão da UI do Frontend com as APIs Dinâmicas do Gateway**
  - *Descrição:* Substituição do mock visual do React SPA pelas requisições HTTP reais apontando para o `backend-gateway`.
  - *GitHub Issue:* `#14` | *Label:* `status:em-andamento`

- [/] **[EM ANDAMENTO] Migration Alembic `9f4a1c7d2b83` (coluna `resume_url`)**
  - *Descrição:* Aplicação e validação da migration que adiciona a coluna `resume_url` em `tool_execution_jobs` prevenindo erros no `tes_lease`.
  - *GitHub Issue:* `#15` | *Label:* `status:em-andamento`

---

## 🔴 PENDENTES (Todo)

- [ ] **[PENDENTE] Sanitização de Segredos Hardcoded nos JSONs dos Workflows n8n**
  - *Descrição:* Remover tokens `X-Internal-Token` hardcoded dos arquivos JSON de workflow e migrar para n8n Native Credentials.
  - *GitHub Issue:* `#16` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Implementação de Error Workflow Global no n8n**
  - *Descrição:* Adicionar Error Workflow no n8n para capturar falhas no meio da execução e atualizar o `Run.status` para `failed` evitando estado órfão.
  - *GitHub Issue:* `#17` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Internalização Total e Autonomia dos TES no Repositório Merovíngio**
  - *Descrição:* Migrar os microsserviços TES do diretório `Pentesters-Team` para o repositório/compose do Merovíngio, permitindo execução 100% autônoma.
  - *GitHub Issue:* `#18` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Validação de Escopo Estrita Fail-Closed nos TES**
  - *Descrição:* Tornar o escopo obrigatório em todos os TES no momento do lease, retornando `403 Forbidden` caso ausente e eliminando fallback local `scope.json`.
  - *GitHub Issue:* `#19` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Migração para Rede Docker Autônoma (`merovingio-net`)**
  - *Descrição:* Substituir a dependência da rede externa `recon_net` por uma rede Docker própria da stack Merovíngio no `docker-compose.yml`.
  - *GitHub Issue:* `#20` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Componente de Validação Visual de Escopo no Frontend**
  - *Descrição:* Desenvolver componente na UI para colar listas de FQDNs/CIDRs e visualizar o preview de aceitação/veto do guard de escopo antes de rodar scans.
  - *GitHub Issue:* `#21` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Healthcheck Dinâmico dos TES (`GET /tools`)**
  - *Descrição:* Implementar monitoramento ativo que faz ping nos endpoints `/healthz` dos TES cadastrados e atualiza o `health_status` em tempo real na UI.
  - *GitHub Issue:* `#22` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Resiliência e Tratamento de Exceções no `data-indexer`**
  - *Descrição:* Remover `try/except` silenciosos no `data-indexer` e retornar erro HTTP `503 Service Unavailable` quando o OpenSearch estiver fora do ar.
  - *GitHub Issue:* `#23` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Pipelines de Sync Reais no `data-sync-svc` (NVD API 2.0 / SecLists)**
  - *Descrição:* Implementar os conectores de sincronização de inteligência ofensiva com NVD API 2.0 (usando `NVD_API_KEY`), GHSA, OSV.dev e SecLists.
  - *GitHub Issue:* `#24` | *Label:* `status:pendente`

- [ ] **[PENDENTE] Provisionamento e Go-Live na Instância AWS EC2**
  - *Descrição:* Provisionar a instância EC2 (`c6i.xlarge`), configurar Security Groups (HTTPS 443 / SSH VPN), SSL com Nginx, `.env` de prod e efetuar o deploy final.
  - *GitHub Issue:* `#25` | *Label:* `status:pendente`
