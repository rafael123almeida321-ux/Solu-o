-- =====================================================================
-- CLYENT CRM — banco de dados completo (Supabase / Postgres)
--
-- COMO USAR: Supabase → SQL Editor → New query → cole ESTE ARQUIVO
-- INTEIRO → Run. Rode uma vez só, num projeto novo.
--
-- A privacidade dos contatos é garantida AQUI no banco (Row Level
-- Security), não só na tela. Mesmo alguém que abra o "inspecionar" do
-- navegador não consegue puxar telefone/rede social de lead dos outros.
-- =====================================================================

-- =====================================================================
-- 1. TABELAS
-- =====================================================================

-- Perfil público de cada usuário (só o nome)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  created_at  timestamptz not null default now()
);

-- Equipes (ex.: "CLYENT")
create table if not exists public.teams (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null check (length(trim(nome)) between 2 and 60),
  descricao              text not null default '',
  publica                boolean not null default true,   -- aparece na lista "Entrar em equipe"
  owner_id               uuid not null references public.profiles(id),
  comissao_vendedor_pct  numeric not null default 60 check (comissao_vendedor_pct between 0 and 100),
  teto_anual             numeric,                          -- ex.: teto do MEI
  meta_mensal            numeric,
  dias_para_liberar      int not null default 0 check (dias_para_liberar >= 0), -- 0 = desligado
  admin_ve_contatos      boolean not null default false,
  produtos               jsonb not null default '[
    {"id":"site","nome":"Site","valor":600},
    {"id":"site_gmn","nome":"Site + Google Meu Negócio","valor":1000},
    {"id":"trafego","nome":"Tráfego pago","valor":1000},
    {"id":"whatsapp","nome":"Automação WhatsApp","valor":1000}
  ]'::jsonb,
  created_at             timestamptz not null default now()
);

-- Código de convite (separado pra só admin enxergar)
create table if not exists public.team_invites (
  team_id  uuid primary key references public.teams(id) on delete cascade,
  codigo   text not null unique
);

create table if not exists public.team_members (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  papel       text not null default 'membro' check (papel in ('dono','admin','membro')),
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_join_requests (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mensagem    text,
  status      text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Lead: parte PÚBLICA (a equipe toda vê)
create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  owner_id             uuid not null references public.profiles(id),
  created_by           uuid not null references public.profiles(id),
  nome_negocio         text not null check (length(trim(nome_negocio)) > 0),
  nicho                text,
  descricao            text not null default '',
  bairro               text,
  cidade               text,
  lat_aprox            double precision,   -- arredondado (~1 km) pro mapa da equipe
  lng_aprox            double precision,
  origem               text,
  temperatura          int not null default 50 check (temperatura between 0 and 100),
  estagio              text not null default 'novo'
                         check (estagio in ('novo','contato','revisita','apresentacao','proposta','fechado','perdido')),
  produtos             text[] not null default '{}',
  valor_estimado       numeric not null default 0,
  tags                 text[] not null default '{}',
  resultado_abordagem  text,
  proximo_followup     timestamptz,
  proximo_passo        text,
  ultimo_contato_em    timestamptz not null default now(),
  contato_liberado     boolean not null default false,
  motivo_perda         text,
  fechado_em           timestamptz,
  producao_status      text check (producao_status in ('afazer','construcao','revisao','entregue')),
  foto                 text,               -- foto da fachada (jpeg comprimido)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists leads_team_idx  on public.leads(team_id);
create index if not exists leads_owner_idx on public.leads(owner_id);

-- Lead: parte PRIVADA (só o dono, quem ele liberar, ou a equipe se ele liberar)
create table if not exists public.lead_contacts (
  lead_id      uuid primary key references public.leads(id) on delete cascade,
  responsavel  text,
  cargo        text,
  whatsapp     text,
  telefone     text,
  email        text,
  instagram    text,
  facebook     text,
  tiktok       text,
  linkedin     text,
  site         text,
  endereco     text,
  lat          double precision,
  lng          double precision,
  updated_at   timestamptz not null default now()
);

-- Contato liberado pra uma pessoa específica
create table if not exists public.lead_shares (
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (lead_id, user_id)
);

-- Pedido de acesso ao contato de um lead de outra pessoa
create table if not exists public.lead_access_requests (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  mensagem       text,
  status         text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  created_at     timestamptz not null default now(),
  respondido_em  timestamptz,
  unique (lead_id, requester_id)
);

-- Histórico do lead (notas, visitas, ligações...) — privado junto com o contato
create table if not exists public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  tipo        text not null default 'nota'
                check (tipo in ('nota','ligacao','whatsapp','visita','email','reuniao','sistema','ia')),
  conteudo    text not null,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id, created_at desc);

-- Feed da equipe (só informação pública)
create table if not exists public.team_events (
  id          bigserial primary key,
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  tipo        text not null,
  texto       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists team_events_team_idx on public.team_events(team_id, created_at desc);

-- =====================================================================
-- 2. FUNÇÕES DE APOIO (usadas nas regras de acesso)
-- =====================================================================

create or replace function public.is_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create or replace function public.is_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members
                 where team_id = p_team and user_id = auth.uid() and papel in ('dono','admin'));
$$;

-- Quem pode ver o CONTATO (telefone, redes, endereço exato, notas) de um lead
create or replace function public.can_see_contact(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from leads l
    join teams t on t.id = l.team_id
    where l.id = p_lead
      and public.is_member(l.team_id)
      and (
        l.owner_id = auth.uid()
        or l.contato_liberado
        or exists (select 1 from lead_shares s where s.lead_id = l.id and s.user_id = auth.uid())
        or (t.admin_ve_contatos and public.is_admin(l.team_id))
      )
  );
$$;

create or replace function public.can_edit_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from leads l
    where l.id = p_lead and (l.owner_id = auth.uid() or public.is_admin(l.team_id))
  );
$$;

create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or exists (select 1 from team_members a join team_members b on a.team_id = b.team_id
               where a.user_id = auth.uid() and b.user_id = p_user)
    or exists (select 1 from team_join_requests r
               where r.user_id = p_user and public.is_admin(r.team_id));
$$;

create or replace function public.nome_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nome, ''), 'Alguém') from profiles where id = p_user;
$$;

create or replace function public.gerar_codigo() returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.label_estagio(p text) returns text
language sql immutable as $$
  select case p
    when 'novo' then 'Novo' when 'contato' then 'Em contato' when 'revisita' then 'Revisita'
    when 'apresentacao' then 'Apresentação' when 'proposta' then 'Proposta'
    when 'fechado' then 'Fechado' when 'perdido' then 'Perdido' else p end;
$$;

create or replace function public.evento(p_team uuid, p_lead uuid, p_tipo text, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into team_events (team_id, user_id, lead_id, tipo, texto)
  values (p_team, auth.uid(), p_lead, p_tipo, p_texto);
$$;

-- =====================================================================
-- 3. GATILHOS (automações do banco)
-- =====================================================================

-- Cria o perfil quando alguém se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Regras ao atualizar um lead
create or replace function public.leads_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.team_id    := old.team_id;      -- lead não muda de equipe
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.estagio = 'fechado' and old.estagio <> 'fechado' then
    new.fechado_em := coalesce(new.fechado_em, now());
    new.producao_status := coalesce(new.producao_status, 'afazer');
    new.temperatura := greatest(new.temperatura, 90);
  elsif new.estagio <> 'fechado' and old.estagio = 'fechado' then
    new.fechado_em := null;
    new.producao_status := null;
  end if;
  return new;
end $$;

drop trigger if exists leads_before_update on public.leads;
create trigger leads_before_update before update on public.leads
  for each row execute function public.leads_before_update();

create or replace function public.leads_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.evento(new.team_id, new.id, 'novo_lead',
    public.nome_de(new.owner_id) || ' registrou ' || new.nome_negocio
    || coalesce(' (' || nullif(concat_ws(' · ', new.nicho, new.bairro), '') || ')', '')
    || ' — ' || new.temperatura || '°');
  return new;
end $$;

drop trigger if exists leads_after_insert on public.leads;
create trigger leads_after_insert after insert on public.leads
  for each row execute function public.leads_after_insert();

create or replace function public.leads_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estagio is distinct from old.estagio then
    insert into lead_activities (lead_id, user_id, tipo, conteudo)
    values (new.id, auth.uid(), 'sistema',
            'Movido de ' || public.label_estagio(old.estagio) || ' para ' || public.label_estagio(new.estagio)
            || coalesce(' — motivo: ' || new.motivo_perda, ''));
    if new.estagio = 'fechado' then
      perform public.evento(new.team_id, new.id, 'fechou',
        public.nome_de(new.owner_id) || ' FECHOU ' || new.nome_negocio || ' 🎉');
    elsif new.estagio = 'perdido' then
      perform public.evento(new.team_id, new.id, 'perdeu',
        new.nome_negocio || ' foi marcado como perdido');
    end if;
  end if;
  if new.contato_liberado and not old.contato_liberado then
    perform public.evento(new.team_id, new.id, 'liberou',
      public.nome_de(new.owner_id) || ' liberou o contato de ' || new.nome_negocio || ' pra equipe');
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into lead_activities (lead_id, user_id, tipo, conteudo)
    values (new.id, auth.uid(), 'sistema',
            'Lead passou de ' || public.nome_de(old.owner_id) || ' para ' || public.nome_de(new.owner_id));
  end if;
  return new;
end $$;

drop trigger if exists leads_after_update on public.leads;
create trigger leads_after_update after update on public.leads
  for each row execute function public.leads_after_update();

-- Coordenada aproximada (pública) a partir da exata (privada)
create or replace function public.contacts_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update leads
     set lat_aprox = case when new.lat is null then null else round(new.lat::numeric, 2)::float8 end,
         lng_aprox = case when new.lng is null then null else round(new.lng::numeric, 2)::float8 end
   where id = new.lead_id;
  return new;
end $$;

drop trigger if exists contacts_sync on public.lead_contacts;
create trigger contacts_sync after insert or update of lat, lng on public.lead_contacts
  for each row execute function public.contacts_sync();

create or replace function public.contacts_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists contacts_touch on public.lead_contacts;
create trigger contacts_touch before update on public.lead_contacts
  for each row execute function public.contacts_touch();

-- Toda interação com o cliente atualiza o "último contato"
create or replace function public.activities_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('nota','ligacao','whatsapp','visita','email','reuniao') then
    update leads set ultimo_contato_em = new.created_at where id = new.lead_id;
  end if;
  return new;
end $$;

drop trigger if exists activities_after_insert on public.lead_activities;
create trigger activities_after_insert after insert on public.lead_activities
  for each row execute function public.activities_after_insert();

-- =====================================================================
-- 4. AÇÕES (RPC) — chamadas pelo app
-- =====================================================================

create or replace function public.criar_equipe(p_nome text, p_descricao text default '', p_publica boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  insert into teams (nome, descricao, publica, owner_id)
  values (trim(p_nome), coalesce(p_descricao, ''), coalesce(p_publica, true), auth.uid())
  returning id into v_id;
  insert into team_members (team_id, user_id, papel) values (v_id, auth.uid(), 'dono');
  insert into team_invites (team_id, codigo) values (v_id, public.gerar_codigo());
  perform public.evento(v_id, null, 'equipe', public.nome_de(auth.uid()) || ' criou a equipe ' || trim(p_nome));
  return v_id;
end $$;

create or replace function public.listar_equipes()
returns table (id uuid, nome text, descricao text, publica boolean, membros int,
               sou_membro boolean, meu_papel text, pedido_status text, dono_nome text)
language sql stable security definer set search_path = public as $$
  select t.id, t.nome, t.descricao, t.publica,
         (select count(*)::int from team_members m where m.team_id = t.id),
         exists (select 1 from team_members m where m.team_id = t.id and m.user_id = auth.uid()),
         (select m.papel from team_members m where m.team_id = t.id and m.user_id = auth.uid()),
         (select r.status from team_join_requests r where r.team_id = t.id and r.user_id = auth.uid()),
         public.nome_de(t.owner_id)
  from teams t
  where auth.uid() is not null
    and (t.publica or exists (select 1 from team_members m where m.team_id = t.id and m.user_id = auth.uid()))
  order by 6 desc, t.nome;
$$;

create or replace function public.pedir_entrada(p_team uuid, p_mensagem text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  if not exists (select 1 from teams where id = p_team and publica) then
    raise exception 'Essa equipe só aceita entrada por código de convite.';
  end if;
  if public.is_member(p_team) then raise exception 'Você já faz parte dessa equipe.'; end if;
  insert into team_join_requests (team_id, user_id, mensagem, status)
  values (p_team, auth.uid(), p_mensagem, 'pendente')
  on conflict (team_id, user_id) do update
    set status = 'pendente', mensagem = excluded.mensagem, created_at = now();
end $$;

create or replace function public.entrar_com_codigo(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  select team_id into v_team from team_invites where codigo = upper(trim(p_codigo));
  if v_team is null then raise exception 'Código de convite inválido.'; end if;
  if not public.is_member(v_team) then
    insert into team_members (team_id, user_id, papel) values (v_team, auth.uid(), 'membro');
    delete from team_join_requests where team_id = v_team and user_id = auth.uid();
    perform public.evento(v_team, null, 'entrou', public.nome_de(auth.uid()) || ' entrou na equipe');
  end if;
  return v_team;
end $$;

create or replace function public.responder_entrada(p_team uuid, p_user uuid, p_aprovar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_team) then raise exception 'Só admin pode aprovar entradas.'; end if;
  if p_aprovar then
    insert into team_members (team_id, user_id, papel) values (p_team, p_user, 'membro')
    on conflict do nothing;
    delete from team_join_requests where team_id = p_team and user_id = p_user;
    perform public.evento(p_team, null, 'entrou', public.nome_de(p_user) || ' entrou na equipe');
  else
    update team_join_requests set status = 'recusado' where team_id = p_team and user_id = p_user;
  end if;
end $$;

create or replace function public.novo_codigo(p_team uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text := public.gerar_codigo();
begin
  if not public.is_admin(p_team) then raise exception 'Só admin pode gerar código.'; end if;
  insert into team_invites (team_id, codigo) values (p_team, v_codigo)
  on conflict (team_id) do update set codigo = excluded.codigo;
  return v_codigo;
end $$;

create or replace function public.alterar_papel(p_team uuid, p_user uuid, p_papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from teams where id = p_team and owner_id = auth.uid()) then
    raise exception 'Só o dono da equipe pode mudar papéis.';
  end if;
  if p_papel not in ('admin','membro') then raise exception 'Papel inválido.'; end if;
  if p_user = auth.uid() then raise exception 'O dono não muda o próprio papel.'; end if;
  update team_members set papel = p_papel where team_id = p_team and user_id = p_user;
end $$;

-- Remove alguém (ou sai da equipe). Os leads da pessoa ficam com o dono da equipe.
create or replace function public.remover_membro(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  select owner_id into v_dono from teams where id = p_team;
  if v_dono is null then raise exception 'Equipe não encontrada.'; end if;
  if p_user = v_dono then raise exception 'O dono não pode sair da própria equipe.'; end if;
  if p_user <> auth.uid() and not public.is_admin(p_team) then
    raise exception 'Só admin pode remover membros.';
  end if;
  update leads set owner_id = v_dono where team_id = p_team and owner_id = p_user;
  delete from lead_shares s using leads l
    where s.lead_id = l.id and l.team_id = p_team and s.user_id = p_user;
  delete from team_members where team_id = p_team and user_id = p_user;
  perform public.evento(p_team, null, 'saiu', public.nome_de(p_user) || ' saiu da equipe');
end $$;

-- Cria o lead inteiro de uma vez (público + contato + primeira nota).
-- Aceita reenvio do mesmo id (cadastro feito sem internet).
create or replace function public.criar_lead(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_team uuid := (p->>'team_id')::uuid;
  c      jsonb := coalesce(p->'contato', '{}'::jsonb);
  v_quando timestamptz := least(now(), greatest(now() - interval '7 days',
                            coalesce(nullif(p->>'criado_em', '')::timestamptz, now())));
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  if not public.is_member(v_team) then raise exception 'Você não faz parte dessa equipe.'; end if;
  if exists (select 1 from leads where id = v_id) then return v_id; end if;

  insert into leads (id, team_id, owner_id, created_by, nome_negocio, nicho, descricao, bairro, cidade,
                     origem, temperatura, estagio, produtos, valor_estimado, tags, resultado_abordagem,
                     proximo_followup, proximo_passo, contato_liberado, foto, created_at, ultimo_contato_em)
  values (v_id, v_team, auth.uid(), auth.uid(),
          trim(p->>'nome_negocio'), nullif(p->>'nicho', ''), coalesce(p->>'descricao', ''),
          nullif(p->>'bairro', ''), nullif(p->>'cidade', ''), nullif(p->>'origem', ''),
          coalesce((p->>'temperatura')::int, 50), coalesce(nullif(p->>'estagio', ''), 'novo'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'produtos', '[]'::jsonb))), '{}'),
          coalesce((p->>'valor_estimado')::numeric, 0),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb))), '{}'),
          nullif(p->>'resultado_abordagem', ''),
          nullif(p->>'proximo_followup', '')::timestamptz, nullif(p->>'proximo_passo', ''),
          coalesce((p->>'contato_liberado')::boolean, false), nullif(p->>'foto', ''),
          v_quando, v_quando);

  insert into lead_contacts (lead_id, responsavel, cargo, whatsapp, telefone, email, instagram,
                             facebook, tiktok, linkedin, site, endereco, lat, lng)
  values (v_id, nullif(c->>'responsavel', ''), nullif(c->>'cargo', ''), nullif(c->>'whatsapp', ''),
          nullif(c->>'telefone', ''), nullif(c->>'email', ''), nullif(c->>'instagram', ''),
          nullif(c->>'facebook', ''), nullif(c->>'tiktok', ''), nullif(c->>'linkedin', ''),
          nullif(c->>'site', ''), nullif(c->>'endereco', ''),
          nullif(c->>'lat', '')::float8, nullif(c->>'lng', '')::float8);

  if coalesce(trim(p->>'nota'), '') <> '' then
    insert into lead_activities (lead_id, user_id, tipo, conteudo, lat, lng, created_at)
    values (v_id, auth.uid(), coalesce(nullif(p->>'nota_tipo', ''), 'visita'), trim(p->>'nota'),
            nullif(c->>'lat', '')::float8, nullif(c->>'lng', '')::float8, v_quando);
  end if;
  return v_id;
end $$;

create or replace function public.checar_duplicado(p_team uuid, p_nome text, p_fone text, p_ignorar uuid default null)
returns table (lead_id uuid, nome_negocio text, dono text, motivo text)
language sql stable security definer set search_path = public as $$
  with alvo as (
    select right(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g'), 8) as fone,
           lower(trim(coalesce(p_nome, ''))) as nome
  )
  select l.id, l.nome_negocio, public.nome_de(l.owner_id),
         case when length(a.fone) = 8 and (
                right(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g'), 8) = a.fone
             or right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = a.fone)
              then 'mesmo telefone' else 'mesmo nome' end
  from leads l
  left join lead_contacts c on c.lead_id = l.id
  cross join alvo a
  where public.is_member(p_team)
    and l.team_id = p_team
    and (p_ignorar is null or l.id <> p_ignorar)
    and (
      (length(a.nome) >= 3 and lower(trim(l.nome_negocio)) = a.nome)
      or (length(a.fone) = 8 and (
            right(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g'), 8) = a.fone
         or right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = a.fone))
    )
  limit 3;
$$;

create or replace function public.transferir_lead(p_lead uuid, p_para uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = p_lead;
  if l.id is null then raise exception 'Lead não encontrado.'; end if;
  if not (l.owner_id = auth.uid() or public.is_admin(l.team_id)) then
    raise exception 'Só o dono do lead (ou admin) pode transferir.';
  end if;
  if not exists (select 1 from team_members where team_id = l.team_id and user_id = p_para) then
    raise exception 'Essa pessoa não está na equipe.';
  end if;
  update leads set owner_id = p_para where id = p_lead;
  delete from lead_shares where lead_id = p_lead and user_id = p_para;
  perform public.evento(l.team_id, p_lead, 'transferiu',
    public.nome_de(auth.uid()) || ' passou ' || l.nome_negocio || ' para ' || public.nome_de(p_para));
end $$;

create or replace function public.compartilhar_lead(p_lead uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = p_lead;
  if l.id is null then raise exception 'Lead não encontrado.'; end if;
  if not (l.owner_id = auth.uid() or public.is_admin(l.team_id)) then
    raise exception 'Só o dono do lead pode compartilhar.';
  end if;
  if not exists (select 1 from team_members where team_id = l.team_id and user_id = p_user) then
    raise exception 'Essa pessoa não está na equipe.';
  end if;
  insert into lead_shares (lead_id, user_id, granted_by) values (p_lead, p_user, auth.uid())
  on conflict do nothing;
  insert into lead_activities (lead_id, user_id, tipo, conteudo)
  values (p_lead, auth.uid(), 'sistema', 'Contato liberado para ' || public.nome_de(p_user));
end $$;

create or replace function public.remover_compartilhamento(p_lead uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_lead(p_lead) and p_user <> auth.uid() then
    raise exception 'Sem permissão.';
  end if;
  delete from lead_shares where lead_id = p_lead and user_id = p_user;
end $$;

create or replace function public.pedir_acesso(p_lead uuid, p_mensagem text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = p_lead;
  if l.id is null or not public.is_member(l.team_id) then raise exception 'Lead não encontrado.'; end if;
  if l.owner_id = auth.uid() then raise exception 'Esse lead já é seu.'; end if;
  if public.can_see_contact(p_lead) then raise exception 'Você já tem acesso a esse contato.'; end if;
  insert into lead_access_requests (lead_id, requester_id, mensagem, status)
  values (p_lead, auth.uid(), p_mensagem, 'pendente')
  on conflict (lead_id, requester_id) do update
    set status = 'pendente', mensagem = excluded.mensagem, created_at = now(), respondido_em = null;
end $$;

create or replace function public.responder_acesso(p_pedido uuid, p_aprovar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r lead_access_requests;
begin
  select * into r from lead_access_requests where id = p_pedido;
  if r.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not public.can_edit_lead(r.lead_id) then raise exception 'Só o dono do lead pode responder.'; end if;
  update lead_access_requests
     set status = case when p_aprovar then 'aprovado' else 'recusado' end, respondido_em = now()
   where id = p_pedido;
  if p_aprovar then
    perform public.compartilhar_lead(r.lead_id, r.requester_id);
  end if;
end $$;

-- "Lago de leads": lead parado há X dias (configurado pela equipe) pode ser assumido por outro
create or replace function public.assumir_lead(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l leads; v_dias int;
begin
  select * into l from leads where id = p_lead;
  if l.id is null or not public.is_member(l.team_id) then raise exception 'Lead não encontrado.'; end if;
  select dias_para_liberar into v_dias from teams where id = l.team_id;
  if coalesce(v_dias, 0) = 0 then raise exception 'Sua equipe não liberou o "lago de leads".'; end if;
  if l.owner_id = auth.uid() then raise exception 'Esse lead já é seu.'; end if;
  if l.estagio in ('fechado','perdido') then raise exception 'Esse lead já foi finalizado.'; end if;
  if l.ultimo_contato_em > now() - make_interval(days => v_dias) then
    raise exception 'Esse lead ainda está sendo trabalhado pelo dono.';
  end if;
  update leads set owner_id = auth.uid(), ultimo_contato_em = now() where id = p_lead;
  perform public.evento(l.team_id, p_lead, 'assumiu',
    public.nome_de(auth.uid()) || ' assumiu ' || l.nome_negocio || ' (estava parado com '
    || public.nome_de(l.owner_id) || ')');
end $$;

-- =====================================================================
-- 5. REGRAS DE ACESSO (Row Level Security)
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.teams                enable row level security;
alter table public.team_invites         enable row level security;
alter table public.team_members         enable row level security;
alter table public.team_join_requests   enable row level security;
alter table public.leads                enable row level security;
alter table public.lead_contacts        enable row level security;
alter table public.lead_shares          enable row level security;
alter table public.lead_access_requests enable row level security;
alter table public.lead_activities      enable row level security;
alter table public.team_events          enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- teams
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (public.is_member(id));
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete to authenticated
  using (owner_id = auth.uid());

-- team_invites (só admin vê o código)
drop policy if exists invites_select on public.team_invites;
create policy invites_select on public.team_invites for select to authenticated
  using (public.is_admin(team_id));

-- team_members
drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to authenticated
  using (public.is_member(team_id));

-- team_join_requests
drop policy if exists joinreq_select on public.team_join_requests;
create policy joinreq_select on public.team_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin(team_id));
drop policy if exists joinreq_delete on public.team_join_requests;
create policy joinreq_delete on public.team_join_requests for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(team_id));

-- leads (parte pública: a equipe toda vê; só o dono/admin edita)
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (public.is_member(team_id));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_member(team_id) and owner_id = auth.uid() and created_by = auth.uid());
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (owner_id = auth.uid() or public.is_admin(team_id))
  with check (owner_id = auth.uid() or public.is_admin(team_id));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin(team_id));

-- lead_contacts (PRIVADO)
drop policy if exists contacts_select on public.lead_contacts;
create policy contacts_select on public.lead_contacts for select to authenticated
  using (public.can_see_contact(lead_id));
drop policy if exists contacts_insert on public.lead_contacts;
create policy contacts_insert on public.lead_contacts for insert to authenticated
  with check (public.can_edit_lead(lead_id));
drop policy if exists contacts_update on public.lead_contacts;
create policy contacts_update on public.lead_contacts for update to authenticated
  using (public.can_edit_lead(lead_id)) with check (public.can_edit_lead(lead_id));

-- lead_shares
drop policy if exists shares_select on public.lead_shares;
create policy shares_select on public.lead_shares for select to authenticated
  using (user_id = auth.uid() or public.can_edit_lead(lead_id));

-- lead_access_requests
drop policy if exists accessreq_select on public.lead_access_requests;
create policy accessreq_select on public.lead_access_requests for select to authenticated
  using (requester_id = auth.uid() or public.can_edit_lead(lead_id));

-- lead_activities (PRIVADO, junto com o contato)
drop policy if exists activities_select on public.lead_activities;
create policy activities_select on public.lead_activities for select to authenticated
  using (public.can_see_contact(lead_id));
drop policy if exists activities_insert on public.lead_activities;
create policy activities_insert on public.lead_activities for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_contact(lead_id));
drop policy if exists activities_delete on public.lead_activities;
create policy activities_delete on public.lead_activities for delete to authenticated
  using (user_id = auth.uid() and tipo <> 'sistema');

-- team_events
drop policy if exists events_select on public.team_events;
create policy events_select on public.team_events for select to authenticated
  using (public.is_member(team_id));

-- =====================================================================
-- 6. TEMPO REAL (o app atualiza sozinho quando alguém mexe)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['leads','team_events','lead_access_requests','team_join_requests','team_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
    end;
  end loop;
end $$;

-- Perfis de quem já tinha conta antes de rodar este arquivo
insert into public.profiles (id, nome)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;
