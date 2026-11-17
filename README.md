# CLYENT Comando (CRM + dinheiro, meta e rotina)

Além do CRM da equipe (descrito abaixo), o app tem um **módulo pessoal**: Hoje, Caixa, Meta e plano, Frentes e ações, Revisão semanal. Os dados financeiros são de cada usuário (só ele vê).

## Instalar o módulo pessoal (uma vez)
1. Supabase → **SQL Editor** → cole `supabase/migrations/001_comando_v1.sql` inteiro → **Run** (depois do `schema.sql` do CRM). Não apaga nada do CRM.
2. Publique na Vercel como sempre (mesmas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`).
3. Entre no app → **Mais → Restaurar de um backup** para carregar a configuração inicial (arquivo JSON entregue fora do repositório) ou comece do zero.

## Uso em 5 min/dia e 15 min/semana
- **Todo dia:** abra **Hoje**. Faça as 3 prioridades, marque como concluídas, registre cada dinheiro que entrou/saiu no **+**. Marque "Paguei/Recebi" nos compromissos.
- **Toda semana:** **Mais → Revisão semanal** (6 passos). Opcional: "Resumo para revisão com o Claude" e cole numa conversa.

## Testes
```bash
npm test            # regras financeiras (vitest)
npm run test:banco  # migração + RLS + restauração num Postgres local (PGlite)
npm run build
```

## Backup, restauração e reversão
- **Backup:** Mais → Exportar tudo (JSON, com `versao_esquema`). Faça antes de qualquer mudança grande.
- **Restaurar:** Mais → Restaurar → prévia com contagens e erros → o app baixa o estado atual e substitui (tudo ou nada).
- **Reverter código:** volte o deploy anterior na Vercel. As migrações só criam coisas novas; não restaure código antigo sobre um banco com esquema mais novo sem conferir o CHANGELOG.

Documentos: `docs/CONTEXTO-COMANDO.md`, `docs/DECISOES.md`, `docs/BACKLOG.md`, `CHANGELOG.md`.

---

# CLYENT CRM

Web app (PWA) de CRM pra equipe de prospecção: cada vendedor cria conta, entra na equipe, registra leads na rua em 30 segundos, e a equipe toda enxerga quem já abordou quem — **sem ver o telefone/redes do lead dos outros**. Tem termômetro arrastável, funil, fila de produção, mapa com rota do dia, ranking, comissão e um agente de IA (Groq).

Stack: React + Vite + TypeScript + Tailwind · Supabase (login, banco, tempo real, Edge Function) · Groq (IA) · Vercel (hospedagem).

---

## Subindo do zero (uns 20 minutos)

### 1. Criar o banco no Supabase
1. Entre em **supabase.com** → **New project**. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Quando o projeto abrir: **SQL Editor → New query** → cole o arquivo **`supabase/schema.sql` inteiro** → **Run**.
   Tem que aparecer "Success". Isso cria tabelas, regras de privacidade e automações.

### 2. Ajustar o login
- **Authentication → Sign In / Providers → Email**: se quiser que o time entre sem precisar confirmar e-mail, desligue **Confirm email**. (Ligado é mais seguro; desligado é mais rápido pro time começar.)
- Depois do passo 4, volte em **Authentication → URL Configuration** e coloque o endereço da Vercel em **Site URL** (ex.: `https://clyent-crm.vercel.app`) e também em **Redirect URLs**.

### 3. Ligar o agente de IA (Groq)
1. No Supabase: **Edge Functions → Deploy a new function → Via Editor**.
2. Nome da função: **`agente`** (exatamente assim).
3. Apague o código de exemplo, cole o conteúdo de **`supabase/functions/agente/index.ts`** e clique **Deploy**.
4. **Edge Functions → Secrets** (ou Project Settings → Edge Functions → Secrets) → **Add new secret**:
   - Nome: `GROQ_API_KEY`
   - Valor: sua chave da Groq (**gere uma nova** em console.groq.com → API Keys; a que foi colada no chat já circulou e deve ser apagada lá).

> ⚠️ A chave da Groq **nunca** vai na Vercel nem no código. Variável com `VITE_` na frente fica pública no navegador. O app chama a função `agente`, e só ela conhece a chave.

Opcional (secrets): `GROQ_MODEL` (padrão `llama-3.3-70b-versatile`), `GROQ_MODEL_RAPIDO` (padrão `llama-3.1-8b-instant`), `GROQ_MODEL_VOZ` (padrão `whisper-large-v3-turbo`). Se a Groq aposentar algum modelo, é só trocar aqui — não precisa mexer no código.

Sem esse passo o app funciona normal; só a IA usa modelos prontos simples no lugar (mensagens e temperatura), e a transcrição de voz fica desligada.

### 4. Publicar na Vercel
**Jeito recomendado (GitHub):**
1. Crie um repositório no GitHub e suba esta pasta (sem `node_modules` e sem `dist`).
2. Na Vercel: **Add New → Project → Import** o repositório. Framework: **Vite** (ela detecta sozinha).
3. Em **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL` → Supabase: Project Settings → API → *Project URL*
   - `VITE_SUPABASE_ANON_KEY` → mesma tela → chave *anon public* (ou *publishable*)
4. **Deploy**.

**Jeito rápido (sem GitHub):** com Node instalado, dentro da pasta rode `npx vercel` e siga as perguntas; depois cadastre as duas variáveis no painel e rode `npx vercel --prod`.

> Se o app abrir mostrando "Falta ligar o banco", as variáveis não foram cadastradas (ou faltou um Redeploy depois de cadastrar).

### 5. Primeiro uso
1. Abra o link da Vercel → **Criar conta** (seu nome, e-mail, senha).
2. **Criar uma equipe** → "CLYENT". Você vira o dono.
3. **Equipe → Time → Enviar convite**: manda o link com código pro WhatsApp dos vendedores. Quem entra pelo link cai direto na equipe. Quem achar a equipe na lista pede pra entrar e você aprova.
4. **Equipe → Ajustes**: confira produtos e preços, comissão (padrão 60% vendedor / 40% casa), meta do mês, teto anual (ex.: limite do MEI) e o **lago de leads** (sugestão: 7 dias).
5. No celular: abra o link no Chrome (Android) → ⋮ → **Instalar app**; no iPhone, Safari → Compartilhar → **Adicionar à Tela de Início**.

---

## Como a privacidade funciona

| Quem | Vê | Não vê |
|---|---|---|
| Dono do lead | Tudo | — |
| Resto da equipe | Nome do negócio, nicho, bairro, área aproximada no mapa (~1 km), temperatura, etapa, valor, descrição, de quem é | Responsável, WhatsApp, telefone, e-mail, Instagram/redes, endereço exato, notas e histórico |
| Quem recebeu acesso (pedido aprovado ou "Liberar pra alguém") | Tudo | — |
| Equipe toda, se o dono ligar "Liberado pra equipe toda" | Tudo | — |
| Admin | Mesmo que o resto da equipe (a não ser que o dono ligue "Admins veem o contato" em Ajustes) | — |
| Quem não é da equipe | Nada | Nada |

Isso é aplicado **no banco** (Row Level Security), então não dá pra burlar abrindo o "inspecionar" do navegador. Foi testado com 48 cenários (vendedor tentando ler contato alheio, editar lead dos outros, se adicionar sozinho na equipe, etc.).

---

## Rodar no computador (opcional)
```bash
npm install
cp .env.example .env   # preencha as duas variáveis
npm run dev
```

## Estrutura
```
supabase/schema.sql              banco + regras de acesso + automações (rodar 1x)
supabase/functions/agente/       agente de IA (Edge Function, Deno)
src/pages/                       telas
src/components/                  peças visuais (termômetro, cartão de lead, etc.)
src/lib/                         regras, GPS, foto, fila offline, ponte com a IA
docs/PESQUISA-CRM.md             pesquisa de CRMs e o que foi aproveitado
```

## Problemas comuns
- **"Falta ligar o banco"** → variáveis `VITE_...` na Vercel + Redeploy.
- **Não chega e-mail de confirmação** → desligue "Confirm email" (passo 2) ou configure SMTP próprio no Supabase (o e-mail grátis do Supabase tem limite baixo por hora).
- **Agente diz que não está ligado** → função precisa se chamar `agente` e o secret `GROQ_API_KEY` precisa existir.
- **"Modelo da Groq indisponível"** → crie o secret `GROQ_MODEL` com um modelo atual listado em console.groq.com/docs/models.
- **GPS não funciona** → só funciona em `https` (a Vercel já é) e com permissão de localização liberada no navegador.
