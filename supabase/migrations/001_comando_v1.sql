-- =====================================================================
-- CLYENT Comando — módulo pessoal (dinheiro, meta, frentes, tarefas, revisão)
-- Migração 001 · versão de esquema 1
--
-- Roda DEPOIS do supabase/schema.sql (CRM). Não altera nem apaga nada do CRM.
-- Todos os dados aqui são PESSOAIS: cada linha pertence a um usuário e só ele
-- lê ou escreve (Row Level Security). Nem dono/admin de equipe enxerga.
--
-- Convenções:
--   * dinheiro em centavos inteiros (bigint), nunca float;
--   * datas de vencimento/pagamento são "date" (data local, sem fuso);
--   * nada é apagado para "facilitar": projetos/categorias/contas são arquivados.
-- =====================================================================

-- ---------- utilidades ----------
create or replace function public.fin_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- ajustes ----------
create table if not exists public.fin_settings (
  user_id                  uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  capacidade_semanal_horas int check (capacidade_semanal_horas is null or capacidade_semanal_horas between 0 and 120),
  preferencias             jsonb not null default '{}'::jsonb,
  updated_at               timestamptz not null default now()
);

-- ---------- contas (onde o dinheiro está) ----------
create table if not exists public.fin_accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome                   text not null check (length(trim(nome)) between 1 and 60),
  tipo                   text not null default 'conta' check (tipo in ('conta','carteira','poupanca','cartao')),
  escopo                 text not null default 'pessoal' check (escopo in ('pessoal','negocio')),
  -- saldo no INÍCIO do dia data_base (antes de qualquer movimento desse dia)
  saldo_inicial_centavos bigint not null default 0,
  data_base              date not null default current_date,
  arquivada              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists fin_accounts_user_idx on public.fin_accounts(user_id);

-- ---------- categorias ----------
create table if not exists public.fin_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null check (length(trim(nome)) between 1 and 60),
  tipo       text not null check (tipo in ('entrada','saida')),
  -- operacional = negócio (entra no faturamento/lucro); pessoal = vida pessoal;
  -- financiamento = empréstimo recebido (não é faturamento); divida = pagamento de dívida
  natureza   text not null default 'pessoal' check (natureza in ('operacional','pessoal','financiamento','divida')),
  escopo     text not null default 'pessoal' check (escopo in ('pessoal','negocio')),
  arquivada  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists fin_categories_user_idx on public.fin_categories(user_id);

-- ---------- frentes de renda ----------
create table if not exists public.fin_frentes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome                  text not null check (length(trim(nome)) between 1 and 60),
  situacao              text not null default 'ativa' check (situacao in ('ativa','negociacao','pausada','arquivada')),
  objetivo              text not null default '',
  prioridade            int not null default 3 check (prioridade between 1 and 5),
  proxima_oportunidade  text not null default '',
  indicador_nome        text not null default '',
  notas                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists fin_frentes_user_idx on public.fin_frentes(user_id);

-- ---------- metas ----------
create table if not exists public.fin_goals (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome                   text not null check (length(trim(nome)) between 1 and 80),
  tipo                   text not null check (tipo in ('reducao_divida','faturamento_mensal','lucro_mensal','reserva')),
  alvo_centavos          bigint check (alvo_centavos is null or alvo_centavos > 0),
  valor_inicial_centavos bigint not null default 0,
  data_base              date not null default current_date,
  prazo                  date,
  escopo                 text not null default 'pessoal' check (escopo in ('pessoal','negocio','ambos')),
  regra                  text not null default '',
  principal              boolean not null default false,
  status                 text not null default 'ativa' check (status in ('ativa','arquivada')),
  versao                 int not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists fin_goals_user_idx on public.fin_goals(user_id);
create unique index if not exists fin_goals_uma_principal on public.fin_goals(user_id) where principal and status = 'ativa';

-- histórico de versões da meta (preenchido por gatilho, só leitura)
create table if not exists public.fin_goal_history (
  id          bigserial primary key,
  goal_id     uuid not null references public.fin_goals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  versao      int not null,
  dados       jsonb not null,
  alterado_em timestamptz not null default now()
);
create index if not exists fin_goal_history_goal_idx on public.fin_goal_history(goal_id, versao desc);

-- marcos semanais (alvo acumulado até o fim da semana)
create table if not exists public.fin_milestones (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id                 uuid not null references public.fin_goals(id) on delete cascade,
  semana_inicio           date not null,
  alvo_acumulado_centavos bigint not null check (alvo_acumulado_centavos >= 0),
  nota                    text not null default '',
  unique (goal_id, semana_inicio)
);

-- ---------- dívidas ----------
create table if not exists public.fin_debts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  credor                   text not null check (length(trim(credor)) between 1 and 80),
  descricao                text not null default '',
  titular                  text not null default '',          -- de quem é o cartão/contrato
  -- saldo devedor informado no INÍCIO do dia data_referencia
  saldo_informado_centavos bigint not null check (saldo_informado_centavos >= 0),
  data_referencia          date not null default current_date,
  vencimento               date,
  em_atraso_desde          date,
  juros_info               text not null default '',          -- vazio = não informado
  goal_id                  uuid references public.fin_goals(id) on delete set null,
  status                   text not null default 'aberta' check (status in ('aberta','quitada','arquivada')),
  notas                    text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists fin_debts_user_idx on public.fin_debts(user_id);

-- ---------- recorrências ----------
create table if not exists public.fin_recurrences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  descricao      text not null check (length(trim(descricao)) between 1 and 120),
  tipo           text not null check (tipo in ('entrada','saida')),
  valor_centavos bigint not null check (valor_centavos > 0),
  conta_id       uuid references public.fin_accounts(id) on delete set null,
  categoria_id   uuid references public.fin_categories(id) on delete set null,
  frente_id      uuid references public.fin_frentes(id) on delete set null,
  divida_id      uuid references public.fin_debts(id) on delete set null,
  frequencia     text not null default 'mensal' check (frequencia in ('semanal','mensal')),
  inicio         date not null,
  fim            date,
  ativa          boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------- lançamentos ----------
create table if not exists public.fin_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo             text not null check (tipo in ('entrada','saida','transferencia')),
  status           text not null default 'realizado' check (status in ('previsto','realizado','cancelado')),
  valor_centavos   bigint not null check (valor_centavos > 0),
  descricao        text not null check (length(trim(descricao)) between 1 and 140),
  conta_id         uuid references public.fin_accounts(id) on delete restrict,
  conta_destino_id uuid references public.fin_accounts(id) on delete restrict,
  categoria_id     uuid references public.fin_categories(id) on delete set null,
  frente_id        uuid references public.fin_frentes(id) on delete set null,
  divida_id        uuid references public.fin_debts(id) on delete set null,
  escopo           text not null default 'pessoal' check (escopo in ('pessoal','negocio')),
  data_competencia date,
  data_vencimento  date,
  data_pagamento   date,
  confirmacao      text not null default 'confirmado' check (confirmacao in ('confirmado','estimado','incerto')),
  recorrencia_id   uuid references public.fin_recurrences(id) on delete set null,
  recorrencia_seq  int,
  chave_importacao text,
  notas            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fin_entries_realizado_ok check (status <> 'realizado' or (data_pagamento is not null and conta_id is not null)),
  constraint fin_entries_previsto_ok  check (status <> 'previsto' or data_vencimento is not null),
  constraint fin_entries_transf_ok    check (
    (tipo = 'transferencia' and conta_destino_id is not null and conta_destino_id <> conta_id)
    or (tipo <> 'transferencia' and conta_destino_id is null)
  )
);
create index if not exists fin_entries_user_idx on public.fin_entries(user_id, data_pagamento);
create unique index if not exists fin_entries_recorrencia_uniq on public.fin_entries(recorrencia_id, recorrencia_seq); -- sem WHERE: o upsert do app precisa achar este índice
create unique index if not exists fin_entries_importacao_uniq  on public.fin_entries(user_id, chave_importacao);

-- ---------- tarefas / ações ----------
create table if not exists public.fin_tasks (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo                    text not null check (length(trim(titulo)) between 1 and 140),
  frente_id                 uuid references public.fin_frentes(id) on delete set null,
  lead_id                   uuid,                            -- lead do CRM (ligação solta: some se o lead for apagado)
  proximo_passo             text not null default '',
  resultado_esperado        text not null default '',
  motivo                    text not null default '',
  prazo                     date,
  tempo_min                 int check (tempo_min is null or tempo_min between 1 and 1440),
  esforco                   int not null default 2 check (esforco between 1 and 3),
  potencial_caixa_centavos  bigint not null default 0 check (potencial_caixa_centavos >= 0),
  compromisso               boolean not null default false,  -- algo prometido a alguém / com data
  foco_em                   date,                            -- fixada como prioridade desse dia
  status                    text not null default 'aberta' check (status in ('aberta','feita','arquivada')),
  concluida_em              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists fin_tasks_user_idx on public.fin_tasks(user_id, status);

-- ---------- revisões semanais (imutáveis) ----------
create table if not exists public.fin_reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semana_inicio      date not null,
  semana_fim         date not null,
  snapshot           jsonb not null default '{}'::jsonb,   -- plano, resultados e premissas daquele momento
  funcionou          text not null default '',
  obstaculos         text not null default '',
  mudancas           text not null default '',
  capacidade_horas   int,
  resultados_proxima jsonb not null default '[]'::jsonb,   -- até 3
  corrige_id         uuid references public.fin_reviews(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint fin_reviews_ate3 check (jsonb_typeof(resultados_proxima) = 'array' and jsonb_array_length(resultados_proxima) <= 3)
);
create index if not exists fin_reviews_user_idx on public.fin_reviews(user_id, semana_inicio desc);

-- ---------- auditoria ----------
create table if not exists public.fin_audit (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tabela      text not null,
  registro_id uuid,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  em          timestamptz not null default now()
);
create index if not exists fin_audit_user_idx on public.fin_audit(user_id, em desc);

-- =====================================================================
-- GATILHOS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['fin_settings','fin_accounts','fin_frentes','fin_goals','fin_debts','fin_entries','fin_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.fin_touch()', t || '_touch', t);
  end loop;
end $$;

-- user_id nunca muda e, na inserção, é sempre o do usuário logado
-- (exceto durante a restauração, que roda com o mesmo usuário de qualquer jeito)
create or replace function public.fin_fixa_dono() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
  else
    new.user_id := old.user_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['fin_settings','fin_accounts','fin_categories','fin_frentes','fin_goals','fin_milestones',
                           'fin_debts','fin_recurrences','fin_entries','fin_tasks','fin_reviews'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_dono', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fin_fixa_dono()', t || '_dono', t);
  end loop;
end $$;

-- referências (conta, categoria, frente, dívida, meta) têm de ser do mesmo usuário
create or replace function public.fin_checa_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); u uuid := new.user_id;
begin
  if (j ? 'conta_id') and j->>'conta_id' is not null
     and not exists (select 1 from fin_accounts where id = (j->>'conta_id')::uuid and user_id = u) then
    raise exception 'Conta inválida.'; end if;
  if (j ? 'conta_destino_id') and j->>'conta_destino_id' is not null
     and not exists (select 1 from fin_accounts where id = (j->>'conta_destino_id')::uuid and user_id = u) then
    raise exception 'Conta de destino inválida.'; end if;
  if (j ? 'categoria_id') and j->>'categoria_id' is not null
     and not exists (select 1 from fin_categories where id = (j->>'categoria_id')::uuid and user_id = u) then
    raise exception 'Categoria inválida.'; end if;
  if (j ? 'frente_id') and j->>'frente_id' is not null
     and not exists (select 1 from fin_frentes where id = (j->>'frente_id')::uuid and user_id = u) then
    raise exception 'Frente inválida.'; end if;
  if (j ? 'divida_id') and j->>'divida_id' is not null
     and not exists (select 1 from fin_debts where id = (j->>'divida_id')::uuid and user_id = u) then
    raise exception 'Dívida inválida.'; end if;
  if (j ? 'goal_id') and j->>'goal_id' is not null
     and not exists (select 1 from fin_goals where id = (j->>'goal_id')::uuid and user_id = u) then
    raise exception 'Meta inválida.'; end if;
  if (j ? 'recorrencia_id') and j->>'recorrencia_id' is not null
     and not exists (select 1 from fin_recurrences where id = (j->>'recorrencia_id')::uuid and user_id = u) then
    raise exception 'Recorrência inválida.'; end if;
  if (j ? 'corrige_id') and j->>'corrige_id' is not null
     and not exists (select 1 from fin_reviews where id = (j->>'corrige_id')::uuid and user_id = u) then
    raise exception 'Revisão corrigida inválida.'; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['fin_entries','fin_recurrences','fin_debts','fin_tasks','fin_milestones','fin_reviews'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_refs', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fin_checa_refs()', t || '_refs', t);
  end loop;
end $$;

-- meta: cada alteração vira uma nova versão e a anterior vai pro histórico
create or replace function public.fin_goals_versao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'versao') is distinct from (to_jsonb(old) - 'updated_at' - 'versao') then
    insert into fin_goal_history (goal_id, user_id, versao, dados) values (old.id, old.user_id, old.versao, to_jsonb(old));
    new.versao := old.versao + 1;
  end if;
  return new;
end $$;
drop trigger if exists fin_goals_versao on public.fin_goals;
create trigger fin_goals_versao before update on public.fin_goals
  for each row execute function public.fin_goals_versao();

-- revisões não se editam nem se apagam; correção = nova revisão com corrige_id
create or replace function public.fin_reviews_imutavel() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('fin.restaurando', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Revisões salvas não podem ser alteradas. Crie uma correção.';
end $$;
drop trigger if exists fin_reviews_imutavel on public.fin_reviews;
create trigger fin_reviews_imutavel before update or delete on public.fin_reviews
  for each row execute function public.fin_reviews_imutavel();

-- auditoria de lançamentos, dívidas e metas
create or replace function public.fin_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('fin.restaurando', true), '') = 'sim' then
    return null;
  end if;
  insert into fin_audit (user_id, tabela, registro_id, acao, antes, depois)
  values (coalesce(new.user_id, old.user_id), tg_table_name, coalesce(new.id, old.id), lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['fin_entries','fin_debts','fin_goals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fin_auditar()', t || '_audit', t);
  end loop;
end $$;

-- =====================================================================
-- REGRAS DE ACESSO (cada um só vê e mexe no que é seu)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['fin_settings','fin_accounts','fin_categories','fin_frentes','fin_goals','fin_goal_history',
                           'fin_milestones','fin_debts','fin_recurrences','fin_entries','fin_tasks','fin_reviews','fin_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_dono_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_dono_select', t);
  end loop;
  -- escrita (histórico de meta e auditoria são só leitura pelo app)
  foreach t in array array['fin_settings','fin_accounts','fin_categories','fin_frentes','fin_goals',
                           'fin_milestones','fin_debts','fin_recurrences','fin_entries','fin_tasks','fin_reviews'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dono_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_dono_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_dono_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_dono_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_dono_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_dono_delete', t);
  end loop;
end $$;

-- o módulo pessoal nunca é acessado sem login
revoke all on
  public.fin_settings, public.fin_accounts, public.fin_categories, public.fin_frentes, public.fin_goals, public.fin_goal_history,
  public.fin_milestones, public.fin_debts, public.fin_recurrences, public.fin_entries, public.fin_tasks, public.fin_reviews, public.fin_audit
  from anon;
grant select, insert, update, delete on
  public.fin_settings, public.fin_accounts, public.fin_categories, public.fin_frentes, public.fin_goals,
  public.fin_milestones, public.fin_debts, public.fin_recurrences, public.fin_entries, public.fin_tasks, public.fin_reviews
  to authenticated;
grant select on public.fin_goal_history, public.fin_audit to authenticated;

-- =====================================================================
-- RESTAURAÇÃO DE BACKUP (tudo ou nada, só nos dados do próprio usuário)
-- O app baixa um backup do estado atual ANTES de chamar esta função.
-- =====================================================================
create or replace function public.fin_restaurar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
-- security definer só para poder reescrever o histórico de metas (que o app não edita).
-- Toda operação abaixo é filtrada por u = auth.uid(); os gatilhos forçam user_id = auth.uid()
-- e conferem que conta/categoria/dívida referenciadas são do próprio usuário.
declare
  u uuid := auth.uid();
  d jsonb := p->'dados';
begin
  if u is null then raise exception 'Faça login novamente.'; end if;
  if p->>'esquema' is distinct from 'clyent-comando' then raise exception 'Arquivo não é um backup do CLYENT Comando.'; end if;
  if coalesce((p->>'versao_esquema')::int, 0) <> 1 then raise exception 'Versão de backup incompatível.'; end if;

  perform set_config('fin.restaurando', 'sim', true);

  delete from fin_reviews     where user_id = u;
  delete from fin_tasks       where user_id = u;
  delete from fin_entries     where user_id = u;
  delete from fin_recurrences where user_id = u;
  delete from fin_milestones  where user_id = u;
  delete from fin_debts       where user_id = u;
  delete from fin_goal_history where user_id = u;
  delete from fin_goals       where user_id = u;
  delete from fin_frentes     where user_id = u;
  delete from fin_categories  where user_id = u;
  delete from fin_accounts    where user_id = u;
  delete from fin_settings    where user_id = u;

  insert into fin_settings   select * from jsonb_populate_recordset(null::fin_settings,   coalesce(d->'settings','[]'));
  insert into fin_accounts   select * from jsonb_populate_recordset(null::fin_accounts,   coalesce(d->'contas','[]'));
  insert into fin_categories select * from jsonb_populate_recordset(null::fin_categories, coalesce(d->'categorias','[]'));
  insert into fin_frentes    select * from jsonb_populate_recordset(null::fin_frentes,    coalesce(d->'frentes','[]'));
  -- metas: entram sem disparar versão nova (insert não versiona)
  insert into fin_goals      select * from jsonb_populate_recordset(null::fin_goals,      coalesce(d->'metas','[]'));
  insert into fin_goal_history (goal_id, user_id, versao, dados, alterado_em)
    select r.goal_id, u, r.versao, r.dados, coalesce(r.alterado_em, now())
    from jsonb_populate_recordset(null::fin_goal_history, coalesce(d->'historico_metas','[]')) r;
  insert into fin_milestones select * from jsonb_populate_recordset(null::fin_milestones, coalesce(d->'marcos','[]'));
  insert into fin_debts      select * from jsonb_populate_recordset(null::fin_debts,      coalesce(d->'dividas','[]'));
  insert into fin_recurrences select * from jsonb_populate_recordset(null::fin_recurrences, coalesce(d->'recorrencias','[]'));
  insert into fin_entries    select * from jsonb_populate_recordset(null::fin_entries,    coalesce(d->'lancamentos','[]'));
  insert into fin_tasks      select * from jsonb_populate_recordset(null::fin_tasks,      coalesce(d->'tarefas','[]'));
  -- revisões: as correções dependem das originais, então entram por data
  insert into fin_reviews    select * from jsonb_populate_recordset(null::fin_reviews,    coalesce(d->'revisoes','[]')) r order by r.created_at;

  perform set_config('fin.restaurando', '', true);

  return jsonb_build_object(
    'contas', (select count(*) from fin_accounts where user_id = u),
    'lancamentos', (select count(*) from fin_entries where user_id = u),
    'dividas', (select count(*) from fin_debts where user_id = u),
    'tarefas', (select count(*) from fin_tasks where user_id = u),
    'revisoes', (select count(*) from fin_reviews where user_id = u)
  );
end $$;

revoke all on function public.fin_restaurar(jsonb) from public, anon;
grant execute on function public.fin_restaurar(jsonb) to authenticated;

-- endurecimento: funções de gatilho não são chamáveis pela API; search_path fixo
alter function public.fin_touch() set search_path = public;
alter function public.fin_fixa_dono() set search_path = public;
alter function public.fin_reviews_imutavel() set search_path = public;
revoke execute on function public.fin_touch(), public.fin_fixa_dono(), public.fin_checa_refs(),
  public.fin_goals_versao(), public.fin_reviews_imutavel(), public.fin_auditar() from public, anon, authenticated;
