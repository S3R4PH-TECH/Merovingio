# Contexto — Merovíngio

> Documento de orientação rápida para retomar o projeto (humano ou agente). Para o detalhe completo de cada decisão, ver [`ARCHITECTURE_AND_ROADMAP.md`](ARCHITECTURE_AND_ROADMAP.md); para instruções de execução, [`README.md`](README.md) e [`backend-gateway/README.md`](backend-gateway/README.md).

## O que é este projeto

**Merovíngio** — clone local e self-hosted da [Trickest](https://github.com/orgs/trickest/repositories) (plataforma comercial de automação de segurança ofensiva — recon/ASM/bug bounty), usando **n8n** como motor de orquestração no lugar do motor proprietário deles, e reaproveitando ferramentas MIT (theHarvester, e futuramente dsieve/mksub/ProjectDiscovery). Nasceu de uma análise multi-equipe (Arquitetura, Ferramentas & Segurança, Backend, UI/Frontend, DevOps/Infra, Dados) que produziu o documento de arquitetura + roadmap.

**Decisões explícitas do dono do projeto (2026-08-05)**:
- **Independência total do Trickest SaaS** — já verificada e garantida (ver item 6 em "Decisões e achados importantes").
- **Uso interno apenas**: roda em `localhost` para a equipe de **purple team**, não é exposto a terceiros nem oferecido como serviço hospedado.
- **Segredos via `.env`/Docker Compose `secrets`**, não Vault, por decisão — não graduar a menos que surja um gatilho concreto (ver roadmap seção 7).

## Decisão de arquitetura central (não renegociar sem revisar o roadmap)

- **Motor: n8n em modo fila** (Postgres próprio + Redis + workers).
- **Regra de custódia**: o n8n **nunca** executa ferramentas ofensivas diretamente (sem node "Execute Command", sem Docker genérico). Toda ferramenta roda atrás de um **Tool Execution Service (TES)** — um microsserviço HTTP que o n8n chama via nós customizados finos, nunca lógica de execução embutida no runtime do n8n.
- O padrão de TES generaliza um serviço que **já existia e já funcionava** antes deste projeto: `Pentesters-Team/services/recon-runner/` (FastAPI, wrapper do theHarvester, com enforcement de escopo, controle de concorrência/timeout e normalização de saída). Esse é o único TES real hoje.
- **Program**, não Workspace, é a fronteira real de isolamento multi-tenant.
- Postgres da plataforma é **separado** do Postgres interno do n8n.

## O que já existe e funciona (verificado de ponta a ponta, não só desenhado)

### `backend-gateway/` (FastAPI + SQLAlchemy/Alembic)
- Auth JWT (login, sem endpoint de signup — usuário via `scripts/seed_user.py`).
- Workspace → Program → Target CRUD, com RBAC (`app/rbac.py`) e audit log.
- **Evolução do `scope_guard`**: `app/scope.py` importa e reusa `Pentesters-Team/mcp_servers/scope_guard.py` (`is_in_scope()`) **sem modificá-lo** — mesmo padrão de `sys.path` bridge que `recon-runner/app/scope.py` já usava. Adiciona matching de CIDR (novo, `scope_guard` não tinha) e veto de `out_of_scope`.
- Schema Postgres completo (13 tabelas: users/workspaces/programs/memberships/targets/workflow_definitions/runs/tool_execution_jobs/assets/findings/tes_registry/audit_log) via Alembic.
- Fluxo completo de disparo de workflow: `POST /workflows/{id}/run` → webhook do n8n → `/internal/execution-started` → `/internal/tes-lease` → (TES chamado diretamente pelo n8n) → `/internal/tes-callback` → `/internal/n8n-callback` → reconciliação do `Run`.
- **42 testes passando contra Postgres real** (nunca mockado — convenção do monorepo).

### PoC vertical — provada contra a stack real, não simulada
Rodou um scan real de theHarvester contra `hackthissite.org` através do caminho completo n8n → Gateway → recon-runner → Gateway, terminando com **83 subdomínios reais persistidos como `Asset`** e `Run.status = success`. Workflow exportado em [`workflows/recon-baseline.json`](workflows/recon-baseline.json).

### Ambiente Docker (pode já estar rodando — checar com `docker compose ps` neste diretório)
`docker-compose.yml` sobe: n8n (main+worker, modo fila), redis, n8n-postgres, platform-postgres, backend-gateway. `recon-runner` é subido separadamente pelo compose do Pentesters-Team, na rede externa `recon_net` que os dois compartilham.

## Decisões e achados importantes (não redescobrir do zero)

1. **`Pentesters-Team/tools/theHarvester/` estava vazio** neste checkout (nunca clonado) — teve que ser vendorizado (`git clone laramies/theHarvester`) pra `recon-runner` sequer buildar. Se sumir de novo, é isso.
2. **n8n's HTTP Request node não faz parse de corpo `204` vazio como JSON** — por isso `/internal/execution-started`, `/internal/tes-callback` e `/internal/n8n-callback` retornam `200 {}`, não `204`. Decisão deliberada, não gambiarra: é mais amigável pra qualquer cliente HTTP, não só o n8n.
3. **Wait fixo antes de pollar o TES é frágil** — uma execução real estourou 30s e o `Run` corretamente foi pra `completed_with_warnings`/`failed` em vez de mentir "success". Confirma por que migrar polling→callback assíncrono (ver Next Steps) é prioridade real, não só teórica.
4. **n8n modo fila tem uma race condition conhecida**: `n8n-main` e `n8n-worker` podem tentar rodar migração de banco simultaneamente no primeiro boot ("relation migrations already exists"). Solução: `docker restart merovingio-n8n-main`.
5. **Ativar/desativar workflow no n8n via CLI exige restart do `n8n-main`** pra pegar efeito — não é bug nosso, é assim que o n8n funciona.
6. **Dependência do Trickest SaaS foi zerada em todo o monorepo (2026-08-05)**: existia um `TRICKEST_TOKEN` em `Pentesters-Team/.env`, usado só por duas ferramentas MCP legadas e opcionais em `pentest_mcp.py` (`trickest_list_workflows`/`trickest_get_execution_status`), sem nenhuma relação com este projeto. Ambas removidas, junto com a documentação em `RECON_AGENT.md`/`ORCHESTRATOR.md` e o token do `.env`. O Merovíngio em si nunca teve essa dependência.
7. **`passlib[bcrypt]` está quebrado** contra releases atuais do `bcrypt` (lê um atributo que foi removido) — por isso `app/auth.py` chama `bcrypt` diretamente, não via `passlib`.
8. **Projeto renomeado de "Trickest-Clone" para "Merovíngio"** (2026-08-05) — pasta, containers (`merovingio-*`), imagem Docker (`merovingio-backend-gateway`) e nome do projeto compose (`name: merovingio` no `docker-compose.yml`) todos atualizados. Se algum comando/script antigo referenciar `trickest-*`, está desatualizado.

## Convenções do monorepo que este projeto segue

- **TDD com Postgres real nos testes**, nunca mockado (mesma regra que `Workspace/Trinity` já seguia).
- Rede `recon_net`: `external: true` em todo compose que a usa — nunca recriar, só `docker network create recon_net` uma vez.
- Sem porta de host publicada em serviços internos (DB, redis) — só o que precisa ser acessado de fora (Gateway, n8n editor — e só nesta fase de PoC).
- Custódia: nenhum serviço fora do Pentesters-Team invoca ferramentas ofensivas diretamente; tudo passa por um TES.
