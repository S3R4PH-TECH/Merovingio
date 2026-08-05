# Próximos Passos — Merovíngio

> Ver [`CONTEXT.md`](CONTEXT.md) primeiro se estiver retomando o projeto do zero. Roadmap completo com todas as fases: [`ARCHITECTURE_AND_ROADMAP.md`](ARCHITECTURE_AND_ROADMAP.md), seção 9.

## Concluído (não refazer)

- [x] Evolução do `scope_guard` (multi-Target/CIDR)
- [x] Schema Postgres completo + Backend Gateway (auth, RBAC, CRUD, audit log)
- [x] PoC vertical n8n ↔ Gateway ↔ TES ponta-a-ponta (scan real, 83 assets persistidos)
- [x] Dependência do Trickest SaaS removida de todo o monorepo

## Ordem de prioridade

Lista única, não duas — a ordem já reflete urgência + risco + dependência entre itens, não separa "pequeno" de "grande". Onde um item destrava ou é destravado por outro, isso está dito explicitamente.

1. **Migrar polling → callback assíncrono no workflow do n8n** (DevOps roadmap #7). Prioridade #1 porque não é melhoria teórica — é um bug de confiabilidade já observado na prática: um `Wait` fixo de 30s não foi suficiente numa execução real e o `Run` foi pra `completed_with_warnings`. Todo TES novo que entrar (item 4) herda esse mesmo problema até isso ser corrigido, então quanto mais cedo, menos retrabalho depois. Trocar o padrão atual (`Wait` + `Poll Job` único) por um node **Wait em modo Webhook**, com o TES chamando de volta quando terminar.

2. **Confirmar OpenSearch com o time de Dados** — barato (é só uma confirmação formal, Backend e DevOps já convergiram de fato pra OpenSearch, ver roadmap seção 10), mas é pré-requisito do serviço indexador (item 7). Resolver cedo evita destravar isso tarde.

3. **Solicitar a chave de API da NVD** — ação externa, sem custo de fazer agora mesmo sem uso imediato, mas tem lead time real. Só entra em código quando o Pipeline de Dados (item 8) começar; pedir agora evita esperar depois.

4. **Segundo TES real** (dsieve/mksub/mkpath/mgwls, MIT, ou subfinder/httpx da ProjectDiscovery) — o maior risco técnico não comprovado da arquitetura hoje: o padrão de lease/callback só foi testado com um TES (recon-runner/theHarvester). Sem isso, não dá pra saber se o desenho generaliza ou se tem suposição escondida específica do theHarvester.

5. **Endpoint admin pra `tes_registry`** — hoje só dá pra registrar um TES via script direto no banco. Não é grande sozinho, mas vira dor real assim que o item 4 entrar — fazer junto ou logo em seguida, não como item isolado depois.

6. **Frontend shell** (Dashboard de Execuções, Workflow Launcher, gestão de Target/Escopo) — é o que transforma isto de "projeto de engenharia operável via curl" em ferramenta que o time de purple team realmente usa no dia a dia. Prioridade alta precisamente porque o uso é interno/local para um time, não uma API pra outros sistemas.

7. **Serviço indexador + OpenSearch** — sem isso, a tela de Achados do Frontend (item 6) não tem valor real (sem busca/filtro, achados são só linhas de tabela). Ligado de perto ao item 6, considerar fazer em conjunto.

8. **Pipeline de Dados** (wordlists/resolvers/CVE via NVD+GHSA+OSV.dev) — isolado: não bloqueia nem é bloqueado por nenhum dos itens acima, pode entrar em paralelo a qualquer momento que sobrar capacidade.

9. **CLI própria + GitHub Action** — rebaixado de prioridade: a motivação original (paridade com `trickest-cli`/`trickest/action` pra cenários de CI/CD comercial) pesa menos agora que o uso confirmado é interno, via `localhost`, pra um time pequeno que já opera pelo Frontend/API diretamente.

## Decisões já resolvidas (não reabrir sem motivo novo)

- ✅ **Vault vs. `.env`**: fica em `.env`/secrets de compose. Só revisitar se surgir gatilho concreto (multi-nó, dezenas de chaves, rotação/auditoria).
- ✅ **Exposição a terceiros**: não. Ferramenta interna, `localhost`, uso exclusivo da equipe de purple team — a ressalva da Sustainable Use License do n8n não se aplica enquanto isso não mudar.
- ✅ **Nome do projeto**: Merovíngio.

## Estado operacional (checar antes de continuar)

```bash
cd "Workspace/Merovingio" && docker compose ps
docker ps --filter "name=recon-runner"
```

Se os containers não estiverem rodando, ver `README.md` → seção "Running it" pra subir tudo de novo (inclui o passo de `docker network create recon_net` e as migrações do Alembic).
