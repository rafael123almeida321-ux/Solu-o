-- =====================================================================
-- CLYENT Comando — Migração 002 · versão de esquema 2
-- Rotina semanal pronta, registro do dia, metas pessoais (peso, hábitos)
-- e histórico de conversa com o assistente de IA.
-- Tudo pessoal: RLS user_id = auth.uid(). Não altera dados existentes.
-- =====================================================================

-- ---------- blocos da rotina (modelo da semana) ----------
create table if not exists public.rot_blocos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo     text not null check (length(trim(titulo)) between 1 and 80),
  dias       int[] not null default '{1,2,3,4,5}',   -- 0 = domingo … 6 = sábado
  inicio     time not null,
  fim        time not null,
  categoria  text not null default 'pessoal'
               check (categoria in ('treino','venda','trabalho','estudo','refeicao','pessoal','casal','descanso')),
  habito     text not null default '',               -- chave de hábito medida pelas metas (ex.: basquete, academia)
  detalhe    text not null default '',
  frente_id  uuid references public.fin_frentes(id) on delete set null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rot_blocos_dias_ok check (dias <@ array[0,1,2,3,4,5,6] and cardinality(dias) > 0)
);
create index if not exists rot_blocos_user_idx on public.rot_blocos(user_id);

-- ---------- o que aconteceu em cada dia ----------
create table if not exists public.rot_registros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       date not null,
  bloco_id   uuid references public.rot_blocos(id) on delete set null,
  titulo     text not null default '',               -- cópia do título no dia (histórico não muda se o bloco mudar)
  habito     text not null default '',
  status     text not null check (status in ('feito','parcial','pulado')),
  nota       text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists rot_registros_dia_bloco on public.rot_registros(user_id, data, bloco_id);
create index if not exists rot_registros_user_idx on public.rot_registros(user_id, data desc);

-- ---------- metas pessoais (não financeiras) ----------
create table if not exists public.pes_metas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null check (length(trim(nome)) between 1 and 80),
  area           text not null default 'outro' check (area in ('corpo','basquete','negocio','estudo','vida','outro')),
  tipo           text not null check (tipo in ('numero','habito')),
  -- numero: acompanha uma medida (ex.: peso em kg)
  metrica        text not null default '',
  unidade        text not null default '',
  valor_inicial  numeric,
  alvo           numeric,
  direcao        text not null default 'subir' check (direcao in ('subir','descer')),
  -- habito: quantas vezes por semana um bloco com essa chave foi feito
  habito         text not null default '',
  vezes_semana   int check (vezes_semana is null or vezes_semana between 1 and 21),
  data_inicio    date not null default current_date,
  prazo          date,
  status         text not null default 'ativa' check (status in ('ativa','concluida','arquivada')),
  notas          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pes_metas_user_idx on public.pes_metas(user_id);

-- ---------- medidas (peso etc.) ----------
create table if not exists public.pes_medidas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       date not null,
  metrica    text not null check (length(trim(metrica)) between 1 and 40),
  valor      numeric not null,
  nota       text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists pes_medidas_dia on public.pes_medidas(user_id, data, metrica);

-- ---------- conversa com o assistente ----------
create table if not exists public.ia_mensagens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  papel      text not null check (papel in ('user','assistant')),
  conteudo   text not null check (length(conteudo) between 1 and 20000),
  acoes      jsonb not null default '[]'::jsonb,       -- o que a IA registrou nessa resposta
  created_at timestamptz not null default now()
);
create index if not exists ia_mensagens_user_idx on public.ia_mensagens(user_id, created_at desc);

-- ---------- gatilhos ----------
do $$
declare t text;
begin
  foreach t in array array['rot_blocos','pes_metas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.fin_touch()', t || '_touch', t);
  end loop;
  foreach t in array array['rot_blocos','rot_registros','pes_metas','pes_medidas','ia_mensagens'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_dono', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fin_fixa_dono()', t || '_dono', t);
  end loop;
end $$;

create or replace function public.rot_checa_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); u uuid := new.user_id;
begin
  if (j ? 'bloco_id') and j->>'bloco_id' is not null
     and not exists (select 1 from rot_blocos where id = (j->>'bloco_id')::uuid and user_id = u) then
    raise exception 'Bloco inválido.'; end if;
  if (j ? 'frente_id') and j->>'frente_id' is not null
     and not exists (select 1 from fin_frentes where id = (j->>'frente_id')::uuid and user_id = u) then
    raise exception 'Frente inválida.'; end if;
  return new;
end $$;
drop trigger if exists rot_registros_refs on public.rot_registros;
create trigger rot_registros_refs before insert or update on public.rot_registros for each row execute function public.rot_checa_refs();
drop trigger if exists rot_blocos_refs on public.rot_blocos;
create trigger rot_blocos_refs before insert or update on public.rot_blocos for each row execute function public.rot_checa_refs();
revoke execute on function public.rot_checa_refs() from public, anon, authenticated;

-- ---------- acesso ----------
do $$
declare t text;
begin
  foreach t in array array['rot_blocos','rot_registros','pes_metas','pes_medidas','ia_mensagens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_dono', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_dono', t);
  end loop;
end $$;

-- ---------- restauração: aceita backups v1 (só finanças) e v2 (tudo) ----------
create or replace function public.fin_restaurar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  d jsonb := p->'dados';
  v int := coalesce((p->>'versao_esquema')::int, 0);
begin
  if u is null then raise exception 'Faça login novamente.'; end if;
  if p->>'esquema' is distinct from 'clyent-comando' then raise exception 'Arquivo não é um backup do CLYENT Comando.'; end if;
  if v not in (1, 2) then raise exception 'Versão de backup incompatível.'; end if;

  perform set_config('fin.restaurando', 'sim', true);

  delete from fin_reviews     where user_id = u;
  delete from fin_tasks       where user_id = u;
  delete from fin_entries     where user_id = u;
  delete from fin_recurrences where user_id = u;
  delete from fin_milestones  where user_id = u;
  delete from fin_debts       where user_id = u;
  delete from fin_goal_history where user_id = u;
  delete from fin_goals       where user_id = u;
  if v = 2 then
    delete from rot_registros where user_id = u;
    delete from rot_blocos    where user_id = u;
    delete from pes_medidas   where user_id = u;
    delete from pes_metas     where user_id = u;
  end if;
  delete from fin_frentes     where user_id = u;
  delete from fin_categories  where user_id = u;
  delete from fin_accounts    where user_id = u;
  delete from fin_settings    where user_id = u;

  insert into fin_settings   select * from jsonb_populate_recordset(null::fin_settings,   coalesce(d->'settings','[]'));
  insert into fin_accounts   select * from jsonb_populate_recordset(null::fin_accounts,   coalesce(d->'contas','[]'));
  insert into fin_categories select * from jsonb_populate_recordset(null::fin_categories, coalesce(d->'categorias','[]'));
  insert into fin_frentes    select * from jsonb_populate_recordset(null::fin_frentes,    coalesce(d->'frentes','[]'));
  insert into fin_goals      select * from jsonb_populate_recordset(null::fin_goals,      coalesce(d->'metas','[]'));
  insert into fin_goal_history (goal_id, user_id, versao, dados, alterado_em)
    select r.goal_id, u, r.versao, r.dados, coalesce(r.alterado_em, now())
    from jsonb_populate_recordset(null::fin_goal_history, coalesce(d->'historico_metas','[]')) r;
  insert into fin_milestones select * from jsonb_populate_recordset(null::fin_milestones, coalesce(d->'marcos','[]'));
  insert into fin_debts      select * from jsonb_populate_recordset(null::fin_debts,      coalesce(d->'dividas','[]'));
  insert into fin_recurrences select * from jsonb_populate_recordset(null::fin_recurrences, coalesce(d->'recorrencias','[]'));
  insert into fin_entries    select * from jsonb_populate_recordset(null::fin_entries,    coalesce(d->'lancamentos','[]'));
  insert into fin_tasks      select * from jsonb_populate_recordset(null::fin_tasks,      coalesce(d->'tarefas','[]'));
  insert into fin_reviews    select * from jsonb_populate_recordset(null::fin_reviews,    coalesce(d->'revisoes','[]')) r order by r.created_at;
  if v = 2 then
    insert into rot_blocos    select * from jsonb_populate_recordset(null::rot_blocos,    coalesce(d->'rotina','[]'));
    insert into rot_registros select * from jsonb_populate_recordset(null::rot_registros, coalesce(d->'registros_rotina','[]'));
    insert into pes_metas     select * from jsonb_populate_recordset(null::pes_metas,     coalesce(d->'metas_pessoais','[]'));
    insert into pes_medidas   select * from jsonb_populate_recordset(null::pes_medidas,   coalesce(d->'medidas','[]'));
  end if;

  perform set_config('fin.restaurando', '', true);

  return jsonb_build_object(
    'contas', (select count(*) from fin_accounts where user_id = u),
    'lancamentos', (select count(*) from fin_entries where user_id = u),
    'dividas', (select count(*) from fin_debts where user_id = u),
    'tarefas', (select count(*) from fin_tasks where user_id = u),
    'blocos_rotina', (select count(*) from rot_blocos where user_id = u),
    'metas_pessoais', (select count(*) from pes_metas where user_id = u)
  );
end $$;
revoke all on function public.fin_restaurar(jsonb) from public, anon;
grant execute on function public.fin_restaurar(jsonb) to authenticated;
