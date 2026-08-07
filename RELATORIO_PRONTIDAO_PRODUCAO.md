# 📋 RELATÓRIO DE PRONTIDÃO DE PRODUÇÃO E DESACOPLAMENTO
## Projeto Merovíngio — Plataforma de Automação Purple Team

**Data:** 07 de Agosto de 2026  
**Autor:** Equipe de Engenharia / Arquitetura  
**Versão Atual:** 0.9.0-rc  
**Status do Projeto:** Em Fase de Desacoplamento para Instância Dedicada (AWS EC2)

---

## 1. 📌 Mapeamento de Status Atual

### 1.1 Funcionalidades Implementadas vs. Pendentes

| Componente | Funcionalidades Implementadas | Funcionalidades Pendentes / Em Aberto |
|---|---|---|
| **`backend-gateway`** | • Autenticação JWT (`bcrypt` direto + PyJWT)<br>• RBAC Multi-tenant (`Workspace` ➔ `Program` ➔ `Target`) e Audit Log<br>• Middleware/Guard de Escopo (`app/scope.py` com suporte a FQDN e CIDR)<br>• Ciclo de Vida TES (`tes_lease`, `tes_callback`, `n8n_callback`) assíncrono<br>• Registro dinâmico de ferramentas (`tes_registry`) | • Endpoints de listagem paginados/filtrados (`GET /workspaces`, `GET /programs`, `GET /workflows`, `GET /runs`, `GET /assets`, `GET /findings`) [Código em working tree]<br>• Reativação e exposição do endpoint `GET /tools` sem vazar tokens<br>• Migration Alembic `9f4a1c7d2b83` para inclusão do campo `resume_url` em `tool_execution_jobs` |
| **`frontend` (SPA React)** | • SPA modular em React + Vite + TypeScript<br>• Interface Glassmorphism moderna (Dashboard, Targets, Workflows, Runs, Findings, Tools)<br>• Autenticação JWT com persistência de sessão local | • Conexão dos endpoints de listagem do gateway na UI (substituição de stubs)<br>• Validador visual de escopo em lote (Preview de FQDNs e blocos CIDR)<br>• Inclusão do container da UI no `docker-compose.yml` final de produção |
| **`data-indexer`** | • Microserviço FastAPI integrado ao OpenSearch 2.18<br>• Indexação e busca full-text de Assets e Findings | • Tratamento de erros/resiliência: interrupções no OpenSearch atualmente são silenciadas<br>• Endpoint de auth interna via token dinâmico `DATA_INDEXER_TOKEN` |
| **`data-sync-svc`** | • Estrutura base em FastAPI para atualização de inteligência ofensiva | • Implementação real dos pipelines de sync (NVD API 2.0, GHSA, OSV.dev, SecLists e Trickest CVEs)<br>• Leitura e uso da chave de API `NVD_API_KEY` |
| **Workflows n8n** | • Workflow base de Recon (`recon-baseline.json`) provado e validado end-to-end<br>• Workflow encadeado (`recon-full-chain.json`) conectando Subfinder ➔ Naabu ➔ Nuclei | • Remoção completa de tokens fixos no JSON do n8n (migração para n8n Native Credentials)<br>• Adição de Error Workflow global no n8n para tratar falhas e evitar jobs órfãos em `running` |
| **Microserviços TES** | • `recon-runner` (theHarvester)<br>• `pd-recon` (subfinder, httpx)<br>• `net-scan` (nmap, naabu)<br>• `pd-scan` (nuclei)<br>• `pd-crawler` (katana, gospider)<br>• `fuzz-svc` (ffuf, dirsearch) | • Finalizar a internalização de código e Dockerfiles dentro do repositório Merovíngio<br>• Tornar a validação de escopo estrita em 100% dos TES (sem fallbacks ou arquivos locais) |

---

### 1.2 Inventário de Dependências, Bibliotecas e APIs Ativas

#### Backend & Microserviços Python
- **Runtime:** Python 3.11+ / Docker
- **Framework Web:** FastAPI, Uvicorn, Pydantic v2
- **Persistência & ORM:** SQLAlchemy 2.0 (AsyncIO), Alembic, `asyncpg`, PostgreSQL 16
- **Autenticação & Segurança:** PyJWT, `bcrypt`, `passlib[bcrypt]` (migrado para `bcrypt` direto devido a incompabilidades de versão)
- **Cliente HTTP:** `httpx` (chamadas assíncronas para TES e n8n webhooks)
- **Integração de Busca:** OpenSearch-py (cliente oficial OpenSearch)

#### Frontend & UI
- **Runtime:** Node.js 20+, Vite, React 18
- **Linguagem & Tipagem:** TypeScript 5.x
- **Estilização & Componentes:** TailwindCSS, Lucide React, CSS Modules / Custom Glassmorphism
- **Build & Server:** Nginx (Proxy Reverso em Produção)

#### Infraestrutura & Orquestração
- **Orquestrador de Fluxos:** n8n (Queue Mode: `n8n-main`, `n8n-worker`, Redis 7, Postgres n8n)
- **Bancos de Dados:** PostgreSQL 16 (Banco da Plataforma + Banco do n8n), OpenSearch 2.18 (Indexação de Assets/Findings)
- **Armazenamento de Objetos:** MinIO / AWS S3 (Exportação de Zips e Snapshots)

#### APIs Internas Ativas (`backend-gateway`)
- `POST /auth/login` — Autenticação de usuário e emissão de JWT.
- `POST /auth/register` — Registro de usuário (desativado por flag em prod).
- `POST /workspaces`, `POST /programs`, `POST /targets` — Gestão de escopo e multi-tenancy.
- `POST /workflows/{id}/run` — Disparo de workflow via webhook n8n.
- `POST /internal/execution-started` — Callback de início de execução enviado pelo n8n.
- `POST /internal/tes-lease` — Emissão de lease de execução e validação de escopo para TES.
- `POST /internal/tes-callback` — Recebimento de resultados/assets gerados pelo TES.
- `POST /internal/n8n-callback` — Finalização da execução pelo n8n.
- `GET /admin/tes`, `POST /admin/tes` — Registro e consulta de Tool Execution Services (TES).

---

### 1.3 Estado das Integrações com o Orquestrador & Pontos de Desacoplamento

Atualmente, o projeto possui as seguintes acoplagens com o ambiente orquestrador/monorepo local (`Pentesters-Team`) que **devem ser cortadas/substituídas** no desacoplamento:

1. **Dependência do Módulo `scope_guard.py`**:
   - *Estado Atual:* O `backend-gateway` importa o guard de escopo através de uma ponte `sys.path` direcionada ao diretório `Pentesters-Team/mcp_servers/scope_guard.py`.
   - *Ação no Desacoplamento:* Copiar/internalizar o `scope_guard.py` diretamente para dentro do pacote `app/` do `backend-gateway`, garantindo autonomia de build e remoção de instruções `COPY` externas nos Dockerfiles.
2. **Rede Docker `recon_net` Externa**:
   - *Estado Atual:* O `docker-compose.yml` referencia a rede `recon_net` como `external: true`, exigindo que ela tenha sido criada previamente por outro projeto.
   - *Ação no Desacoplamento:* Definir a rede `merovingio-net` internamente no `docker-compose.yml` e associar todos os containers (Gateway, n8n, DBs, TES) a esta rede isolada.
3. **Custódia dos TES (Tool Execution Services)**:
   - *Estado Atual:* Os serviços de ferramentas (`pd-recon`, `net-scan`, `pd-scan`, `pd-crawler`, `fuzz-svc`, `recon-runner`) residiam no diretório do orquestrador (`Pentesters-Team/services/`).
   - *Ação no Desacoplamento:* Migrar os diretórios dos TES para dentro da estrutura do Merovíngio ou publicar imagens Docker versionadas no repositório de imagens (Amazon ECR), eliminando a dependência do sistema de arquivos local do orquestrador.
4. **Volumes de Dados Globais (`SecLists` e `Nuclei-Templates`)**:
   - *Estado Atual:* Apontavam para caminhos relativos de desenvolvimento.
   - *Ação no Desacoplamento:* Utilizar init-containers dedicados (`seclists-init`, `nuclei-templates-init`) que baixam e populam volumes nomeados Docker no boot inicial da instância EC2.

---

## 2. 🚀 Desacoplamento e Infraestrutura (AWS EC2)

### 2.1 Requisitos de Runtime e Especificação de Hardware

Para suportar a execução contínua da plataforma em um ambiente produtivo isolado atendendo a operadores humanos de Purple Team, a instância AWS EC2 deve atender aos seguintes requisitos:

#### Especificação Recomendada da Instância EC2
- **Tipo de Instância:** `c6i.xlarge` ou `t3.xlarge`
- **vCPU:** 4 vCPUs (dedicadas ou sem throttling agressivo)
- **Memória RAM:** 16 GB (OpenSearch exige mínimo de 4GB Heap; n8n + Redis + Postgres + 6 TES exigem ~8GB a 10GB em carga de fuzzing/recon)
- **Armazenamento EBS:** 100 GB GP3 NVMe SSD (mínimo de 3000 IOPS) para suportar os volumes do OpenSearch e dicionários de fuzzing (SecLists ~6GB).
- **Sistema Operacional:** Ubuntu Server 24.04 LTS (x86_64)

#### Requisitos de Software no Host (EC2)
- Docker Engine v26.0+
- Docker Compose Plugin v2.26+
- Git 2.40+
- AWS CLI v2 (opcional, para backup de snapshots no S3)

---

### 2.2 Variáveis de Ambiente (ENVs) e Configurações

O arquivo `.env` de produção na instância EC2 deve consolidar as seguintes variáveis cruciais:

```ini
# ==============================================================================
# MEROVÍNGIO - CONFIGURAÇÃO DE PRODUÇÃO (AWS EC2)
# ==============================================================================

# Configurações do Ambiente
ENVIRONMENT=production
PROJECT_NAME=merovingio
DOMAIN_NAME=merovingio.internal.domain # ou IP público/elástico da EC2

# Autenticação e Segredos do Backend Gateway
GATEWAY_JWT_SECRET=super_secret_jwt_key_change_in_production_32bytes
GATEWAY_JWT_ALGORITHM=HS256
GATEWAY_ACCESS_TOKEN_EXPIRE_MINUTES=480
GATEWAY_INTERNAL_TOKEN=internal_gateway_token_for_n8n_and_tes_communication
GATEWAY_ALLOW_REGISTRATION=false

# Banco de Dados da Plataforma (Postgres)
PLATFORM_DB_HOST=merovingio-platform-postgres
PLATFORM_DB_PORT=5432
PLATFORM_DB_USER=merovingio_gateway
PLATFORM_DB_PASSWORD=prod_secure_db_password_gateway_2026
PLATFORM_DB_NAME=merovingio_db
PLATFORM_DATABASE_URL=postgresql+asyncpg://merovingio_gateway:prod_secure_db_password_gateway_2026@merovingio-platform-postgres:5432/merovingio_db

# Orquestrador n8n & Redis
N8N_ENCRYPTION_KEY=n8n_master_encryption_key_change_me
N8N_DB_USER=merovingio_n8n
N8N_DB_PASSWORD=prod_secure_db_password_n8n_2026
N8N_DB_NAME=merovingio_n8n_db
N8N_HOST=localhost
N8N_PORT=5678
N8N_WEBHOOK_URL=http://merovingio-n8n:5678/
REDIS_HOST=merovingio-redis
REDIS_PORT=6379

# OpenSearch & Indexador de Busca
OPENSEARCH_HOST=merovingio-opensearch
OPENSEARCH_PORT=9200
OPENSEARCH_URL=http://merovingio-opensearch:9200
DATA_INDEXER_TOKEN=secure_data_indexer_auth_token_2026

# Chaves de API de Fontes Externas
NVD_API_KEY=your_nvd_api_key_here

# Tokens dos TES (Tool Execution Services)
RECON_RUNNER_TOKEN=tes_token_recon_runner_secret
PD_RECON_TOKEN=tes_token_pd_recon_secret
NET_SCAN_TOKEN=tes_token_net_scan_secret
PD_SCAN_TOKEN=tes_token_pd_scan_secret
PD_CRAWLER_TOKEN=tes_token_pd_crawler_secret
FUZZ_SVC_TOKEN=tes_token_fuzz_svc_secret
```

---

### 2.3 Persistência de Dados, Logs e Topologia de Rede

```
                   [ Operadores Purple Team ]
                               │
                               ▼ (HTTPS 443 / SSH 22 via Bastion)
                    ┌──────────────────────┐
                    │ AWS Security Group   │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │       Instância AWS EC2             │
            │  ┌───────────────────────────────┐  │
            │  │   Nginx Reverse Proxy / SSL   │  │
            │  └───────┬───────────────┬───────┘  │
            │          │               │          │
            │          ▼               ▼          │
            │   Frontend SPA      Backend Gateway │
            │   (Porta 80)        (Porta 8000)    │
            │                          │          │
            │    ┌─────────────────────┼──────────┼─────────────────────┐
            │    │ Rede Docker Interna (merovingio-net)                  │
            │    │                     │          │                     │
            │    │                     ▼          ▼                     │
            │    │                ┌─────────┐ ┌───────┐                 │
            │    │                │  n8n    │ │ TES   │ (pd-recon,      │
            │    │                │ Engine  │ │ Nodes │  pd-scan, etc)  │
            │    │                └────┬────┘ └───┬───┘                 │
            │    │                     │          │                     │
            │    │  ┌──────────────────┼──────────┼──────────────────┐  │
            │    │  │ Persistência (Docker Named Volumes / EBS)       │  │
            │    │  │  ┌────────────┐  ┌──────────┐  ┌────────────┐ │  │
            │    │  │  │ Platform   │  │ n8n      │  │ OpenSearch │ │  │
            │    │  │  │ Postgres   │  │ Postgres │  │ Data       │ │  │
            │    │  │  └────────────┘  └──────────┘  └────────────┘ │  │
            │    │  └───────────────────────────────────────────────┘  │
            │    └──────────────────────────────────────────────────────┘
            └─────────────────────────────────────────────────────────────┘
```

#### Persistência de Dados
Os volumes abaixo devem ser mapeados no `docker-compose.yml` para garantir resiliência contra reboots da EC2:
- `platform-postgres-data` ➔ `/var/lib/postgresql/data` (Dados cadastrais, targets, audit logs)
- `n8n-postgres-data` ➔ `/var/lib/postgresql/data` (Estado das workflows n8n)
- `opensearch-data` ➔ `/usr/share/opensearch/data` (Índices de assets e findings)
- `seclists-data` ➔ `/var/data/seclists` (Wordlists para fuzzing)
- `nuclei-templates-data` ➔ `/var/data/nuclei-templates` (Templates do Nuclei)

#### Mapeamento de Portas e Segurança de Rede (AWS Security Groups)
- **Porta 22 (SSH):** Apenas via IP da VPN da empresa ou AWS Systems Manager (SSM) Session Manager (Recomendado: Fechada publicamente).
- **Porta 443 (HTTPS):** Aberta para a faixa de IPs dos operadores humanos de Purple Team.
- **Porta 80 (HTTP):** Redirecionamento automático para HTTPS 443.
- **Portas Internas (8000, 5678, 9200, 5432, 6379):** **Bloqueadas** no Security Group da EC2. Acessíveis exclusivamente dentro da rede Docker isolada (`merovingio-net`).

---

## 3. 🔍 Análise de Gaps (Gap Analysis)

### 3.1 Segurança, Autenticação e Autorização

> [!WARNING]
> **Pontos de Atenção Críticos para Produção:**

1. **Exposição Involuntária de Static Tokens no Registry**:
   - *Diagnóstico:* O modelo original de `TesRegistryResponse` retornava o `static_token` em chamadas `GET /admin/tes`.
   - *Mitigação:* Ajustado para retornar a flag booleana `has_static_token: bool`, ocultando a credencial bruta.
2. **Uso de Segredos Hardcoded nos Workflows n8n**:
   - *Diagnóstico:* Arquivos como `recon-baseline.json` continham o token interno `"X-Internal-Token": "dev-only-internal-token-change-me"` gravados no próprio grafo JSON.
   - *Mitigação Requerida:* Migrar todos os nós HTTP dos workflows para **n8n Native Credentials** (Header Auth) lendo do ambiente.
3. **Impostação do Guard de Escopo Estrito**:
   - *Diagnóstico:* Se o lease de execução não recebesse escopo explícito, ocorria fallback para listas locais no disco (`scope.json`).
   - *Mitigação Requerida:* Em produção, escopo ausente ou vazio deve resultar em **falha fechada (`403 Forbidden`)**, impedindo varreduras fora de alvos autorizados.

---

### 3.2 Tratamento de Exceções e Resiliência

1. **Silenciamento de Exceções no `data-indexer`**:
   - *Diagnóstico:* Erros de conexão ou indisponibilidade do OpenSearch são capturados e engolidos em blocos `try/except`, retornando listas vazias `[]`. Isso impede que operadores saibam se um alvo realmente não possui assets ou se o serviço de busca caiu.
   - *Ação:* Adicionar exceções explícitas (`503 Service Unavailable`) e logs de aviso.
2. **Jobs Fictícios Presos em `running` no n8n**:
   - *Diagnóstico:* Se um TES sofre um crash por estouro de memória (OOM) durante um scan longo, a chamada de callback nunca ocorre e o registro no Gateway permanece `running` indefinidamente.
   - *Ação:* Configurar **Error Workflows no n8n** e implementar um job de limpeza no Gateway que marca execuções sem callback há mais de 2 horas como `completed_with_warnings` ou `timed_out`.

---

### 3.3 Observabilidade, Métricas e Logging

1. **Ausência de Centralização de Logs**:
   - *Diagnóstico:* Atualmente os logs ficam restritos aos buffers stdio dos containers Docker.
   - *Recomendação de Produção:* Configurar o driver de log do Docker para `awslogs` (enviando para o AWS CloudWatch Logs) ou implantar um container `promtail`/`fluent-bit` enviando para um Grafana Loki interno.
2. **Healthchecks Inativos no Gateway (`GET /tools`)**:
   - *Diagnóstico:* O campo `health_status` dos TES cadastrados no banco é estático (`unknown`).
   - *Recomendação:* O Gateway deve realizar pings periódicos assíncronos nos endpoints `/healthz` de cada TES registrado para informar o status em tempo real na UI dos operadores.

---

## 4. 🗺️ Roadmap para Próxima Versão (v1.0 Produção)

### 4.1 Matriz de Priorização de Refatoração

```mermaid
gantt
    title Roadmap de Prontidão para Produção - Merovíngio v1.0
    dateFormat  YYYY-MM-DD
    section Alta Prioridade
    Internalização de TES e Remoção da Ponte Pentesters-Team :a1, 2026-08-10, 3d
    Migration Alembic resume_url & Correção de Testes        :a2, after a1, 2d
    Endpoints de Listagem CRUD & Conexão no Frontend         :a3, after a2, 3d
    section Média Prioridade
    Sanitização de Workflows n8n (Native Credentials)        :m1, after a3, 2d
    Validador Visual de Escopo (Frontend)                   :m2, after m1, 2d
    Centralização de Logs & Healthcheck dos TES              :m3, after m2, 2d
    section Baixa Prioridade
    Pipeline de Sync Real no data-sync-svc (NVD/SecLists)   :b1, after m3, 3d
    Deploy da Instância EC2 e Automação via Terraform/Ansible:b2, after b1, 3d
```

#### Prioridade ALTA (Bloqueadores de Produção)
- [x] **Internalização do Scope Guard:** Eliminar dependência de `sys.path` bridge para `Pentesters-Team`.
- [ ] **Aplicar Migration `9f4a1c7d2b83`:** Garantir coluna `resume_url` em `tool_execution_jobs` para evitar falha no `tes_lease`.
- [ ] **Finalizar Endpoints de Listagem Paginados:** Disponibilizar `GET /workspaces`, `GET /programs`, `GET /workflows`, `GET /runs`, `GET /assets` e `GET /findings`.
- [ ] **Conectar UI do Frontend aos Endpoints Reais:** Substituir dados mockados pelos retornos reais do `backend-gateway`.

#### Prioridade MÉDIA (Estabilidade e Usabilidade do Operador)
- [ ] **Reescrever Grafo dos Workflows n8n:** Remover tokens hardcoded, adotar `tes_base_url` dinâmico e conectar Error Workflow global.
- [ ] **Interface de Validação de Escopo em Lote:** Permitir aos operadores colar listas de domínios/IPs e visualizar o preview de validação de escopo na UI antes de disparar varreduras.
- [ ] **Healthcheck Dinâmico dos TES:** Atualizar o endpoint `GET /tools` com checagem ativa em `/healthz`.

#### Prioridade BAIXA (Melhorias Contínuas & Automação Infra)
- [ ] **Implementar Conectores no `data-sync-svc`:** Integrar busca real da NVD API 2.0 e atualização diária de repositórios de CVEs.
- [ ] **Exportação de Relatórios de Scan:** Permitir o download de relatórios consolidados do `Run` em formatos PDF/Executive Summary.

---

### 4.2 Estimativa de Esforço e Passos para Entrega

| Fase / Sprint | Atividades Principais | Esforço Estimado | Responsável |
|---|---|---|---|
| **Sprint 1: Desacoplamento & Core DB** | • Internalização do guard de escopo<br>• Aplicação das migrations do Alembic no banco de prod<br>• Subida da suíte completa de testes unitários | 3 Dias Úteis | Backend / DevOps |
| **Sprint 2: APIs & Frontend Wiring** | • Finalização das rotas `GET` paginadas<br>• Integração completa da SPA React com as APIs do Gateway<br>• Empacotamento Docker da UI no Nginx | 4 Dias Úteis | Fullstack / UI |
| **Sprint 3: Workflows n8n & TES** | • Ajuste de credenciais nativas no n8n<br>• Importação dos workflows `recon-full-chain` e tratamento de erros<br>• Testes de carga nos microserviços TES | 3 Dias Úteis | SecOps / QA |
| **Sprint 4: Provisionamento EC2 & Go-Live** | • Provisionamento da EC2 (`c6i.xlarge`) e Security Groups<br>• Configuração de SSL/TLS com Nginx e `.env` prod<br>• Teste de Fumaça (Scan end-to-end de alvos autorizados) | 2 Dias Úteis | Infra / DevOps |

---

## 5. ✅ Conclusão e Próximos Passos

O projeto **Merovíngio** possui uma arquitetura sólida e provada, com isolamento adequado de ferramentas ofensivas via modelo **TES (Tool Execution Service)** e orquestração assíncrona por **n8n em Queue Mode**.

Ao concluir os itens de **Prioridade Alta** (principalmente a aplicação da migration de banco e a conexão final da UI aos endpoints do gateway), a aplicação estará **100% pronta para ser implantada na instância AWS EC2** e entregue para operação contínua da equipe humana de Purple Team.

---
*Relatório emitido para revisão e aprovação de backlog.*
