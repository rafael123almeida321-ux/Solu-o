// Testa o schema do CRM + migração do Comando num Postgres local (PGlite), com usuários e RLS de verdade.
// Uso: node scripts/testar-banco.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const ok = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exitCode = 1; } else console.log("ok -", m); };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  do $$ begin create publication supabase_realtime; exception when others then null; end $$;
`);
await db.exec(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
await db.exec(readFileSync(new URL("../supabase/migrations/001_comando_v1.sql", import.meta.url), "utf8"));
ok(true, "schema do CRM + migração 001 aplicados");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
await db.exec(`insert into auth.users (id, email) values ('${A}','a@x.com'), ('${B}','b@x.com');`);

async function como(u, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${u ?? ""}', false); set role ${u ? "authenticated" : "anon"};`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function falha(u, sql) { try { await como(u, sql); return false; } catch { return true; } }

// A cria conta, dívida, meta e lançamento
const contaA = (await como(A, `insert into fin_accounts (nome, saldo_inicial_centavos, data_base) values ('Nubank', 5000, '2026-11-13') returning id, user_id`)).rows[0];
ok(contaA.user_id === A, "user_id preenchido com o usuário logado");
const metaA = (await como(A, `insert into fin_goals (nome, tipo, data_base, prazo, principal) values ('Sair do sufoco','reducao_divida','2026-11-13','2026-12-10', true) returning id`)).rows[0];
const divA = (await como(A, `insert into fin_debts (credor, saldo_informado_centavos, goal_id) values ('Itaú', 80000, '${metaA.id}') returning id`)).rows[0];
await como(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id, divida_id, data_pagamento) values ('saida','realizado',20000,'pagto Itaú','${contaA.id}','${divA.id}','2026-11-14')`);

// isolamento
ok((await como(B, `select * from fin_accounts`)).rows.length === 0, "B não vê contas de A");
ok((await como(B, `select * from fin_entries`)).rows.length === 0, "B não vê lançamentos de A");
ok((await como(B, `select * from fin_audit`)).rows.length === 0, "B não vê auditoria de A");
ok((await como(null, `select 1`)).rows.length === 1 && await falha(null, `select * from fin_accounts`), "anônimo não lê nada do módulo");
await como(B, `update fin_accounts set nome = 'hack' where id = '${contaA.id}'`);
ok((await como(A, `select nome from fin_accounts where id = '${contaA.id}'`)).rows[0].nome === "Nubank", "B não altera conta de A");
await como(B, `delete from fin_entries`);
ok((await como(A, `select count(*)::int c from fin_entries`)).rows[0].c === 1, "B não apaga lançamentos de A");
ok(await falha(B, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id, data_pagamento) values ('saida','realizado',1,'x','${contaA.id}','2026-11-14')`), "B não lança usando conta de A");
const tentativa = await como(B, `insert into fin_accounts (user_id, nome) values ('${A}', 'plantada') returning user_id`);
ok(tentativa.rows[0].user_id === B, "B não consegue criar registro em nome de A");
ok(await falha(A, `update fin_accounts set user_id = '${B}' where id = '${contaA.id}' returning user_id`) || (await como(A, `select user_id from fin_accounts where id='${contaA.id}'`)).rows[0].user_id === A, "dono não muda");

// regras de integridade
ok(await falha(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, data_pagamento) values ('saida','realizado',100,'sem conta','2026-11-14')`), "realizado exige conta");
ok(await falha(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id) values ('saida','previsto',100,'sem vencimento','${contaA.id}')`), "previsto exige vencimento");
ok(await falha(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id, conta_destino_id, data_pagamento) values ('transferencia','realizado',100,'pra mesma','${contaA.id}','${contaA.id}','2026-11-14')`), "transferência pra mesma conta é recusada");
ok(await falha(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id, data_pagamento) values ('saida','realizado',0,'zero','${contaA.id}','2026-11-14')`), "valor zero é recusado");
ok(await falha(A, `insert into fin_goals (nome, tipo, principal) values ('outra','reserva', true)`), "só uma meta principal ativa");

// recorrência idempotente no banco
const rec = (await como(A, `insert into fin_recurrences (descricao, tipo, valor_centavos, inicio) values ('Mesada','entrada',40000,'2026-11-05') returning id`)).rows[0];
await como(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, data_vencimento, recorrencia_id, recorrencia_seq) values ('entrada','previsto',40000,'Mesada','2026-11-05','${rec.id}',0) on conflict do nothing`);
await como(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, data_vencimento, recorrencia_id, recorrencia_seq) values ('entrada','previsto',40000,'Mesada','2026-11-05','${rec.id}',0) on conflict do nothing`);
ok((await como(A, `select count(*)::int c from fin_entries where recorrencia_id = '${rec.id}'`)).rows[0].c === 1, "recorrência repetida não duplica");

// liquidação no mesmo registro
const prev = (await como(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, data_vencimento, divida_id) values ('saida','previsto',60000,'resto Itaú','2026-12-01','${divA.id}') returning id`)).rows[0];
const antes = (await como(A, `select count(*)::int c from fin_entries`)).rows[0].c;
await como(A, `update fin_entries set status='realizado', conta_id='${contaA.id}', data_pagamento='2026-11-20' where id='${prev.id}'`);
ok((await como(A, `select count(*)::int c from fin_entries`)).rows[0].c === antes, "liquidar não cria lançamento novo");

// versões da meta
await como(A, `update fin_goals set prazo = '2026-12-15' where id = '${metaA.id}'`);
const g = (await como(A, `select versao from fin_goals where id='${metaA.id}'`)).rows[0];
const h = (await como(A, `select versao, dados->>'prazo' prazo from fin_goal_history where goal_id='${metaA.id}'`)).rows;
ok(g.versao === 2 && h.length === 1 && h[0].prazo === "2026-12-10", "alterar meta guarda a versão anterior");

// revisões imutáveis
const rev = (await como(A, `insert into fin_reviews (semana_inicio, semana_fim, funcionou) values ('2026-11-16','2026-11-22','x') returning id`)).rows[0];
ok(await falha(A, `update fin_reviews set funcionou='mudei' where id='${rev.id}'`), "revisão salva não se edita");
ok(await falha(A, `delete from fin_reviews where id='${rev.id}'`), "revisão salva não se apaga");
await como(A, `insert into fin_reviews (semana_inicio, semana_fim, funcionou, corrige_id) values ('2026-11-16','2026-11-22','corrigido','${rev.id}')`);
ok((await como(A, `select count(*)::int c from fin_reviews`)).rows[0].c === 2, "correção vira nova revisão ligada à original");
ok(await falha(A, `insert into fin_reviews (semana_inicio, semana_fim, resultados_proxima) values ('2026-11-16','2026-11-22','["a","b","c","d"]')`), "no máximo 3 resultados por revisão");

// auditoria
ok((await como(A, `select count(*)::int c from fin_audit`)).rows[0].c >= 4, "alterações financeiras ficam auditadas");

// restauração (tudo ou nada, só nos dados do usuário)
const snap = async (u) => {
  const t = async (q) => (await como(u, q)).rows;
  return { esquema: "clyent-comando", versao_esquema: 1, dados: {
    settings: await t(`select * from fin_settings`), contas: await t(`select * from fin_accounts`), categorias: await t(`select * from fin_categories`),
    frentes: await t(`select * from fin_frentes`), metas: await t(`select * from fin_goals`), historico_metas: await t(`select * from fin_goal_history`),
    marcos: await t(`select * from fin_milestones`), dividas: await t(`select * from fin_debts`), recorrencias: await t(`select * from fin_recurrences`),
    lancamentos: await t(`select * from fin_entries`), tarefas: await t(`select * from fin_tasks`), revisoes: await t(`select * from fin_reviews order by created_at`) } };
};
const backupA = await snap(A);
await como(B, `insert into fin_accounts (nome) values ('conta do B')`);
await como(A, `insert into fin_entries (tipo, status, valor_centavos, descricao, conta_id, data_pagamento) values ('entrada','realizado',999,'depois do backup','${contaA.id}','2026-11-21')`);
const r = (await como(A, `select fin_restaurar($1::jsonb) r`, [JSON.stringify(backupA)])).rows[0].r;
ok(r.lancamentos === backupA.dados.lancamentos.length, "restauração volta exatamente ao backup");
ok((await como(A, `select count(*)::int c from fin_reviews`)).rows[0].c === 2, "restauração recria revisões e correções");
ok((await como(B, `select count(*)::int c from fin_accounts`)).rows[0].c === 2, "restauração de A não mexe nos dados de B");
ok(await falha(A, `update fin_reviews set funcionou='x'`), "depois da restauração as revisões continuam imutáveis");
const ruim = JSON.parse(JSON.stringify(backupA)); ruim.dados.lancamentos[0].conta_id = contaA.id.replace(/.$/, "0");
const contAntes = (await como(A, `select count(*)::int c from fin_entries`)).rows[0].c;
ok(await falha(A, `select fin_restaurar('${JSON.stringify(ruim).replace(/'/g, "''")}'::jsonb)`), "backup com referência quebrada é recusado");
ok((await como(A, `select count(*)::int c from fin_entries`)).rows[0].c === contAntes, "restauração recusada não apaga nada (tudo ou nada)");
const injetado = JSON.parse(JSON.stringify(backupA)); injetado.dados.contas[0].user_id = B;
await como(A, `select fin_restaurar($1::jsonb)`, [JSON.stringify(injetado)]);
ok((await como(B, `select count(*)::int c from fin_accounts`)).rows[0].c === 2, "backup adulterado com user_id de outro não planta dados no outro");

console.log(process.exitCode ? "\nHOUVE FALHAS" : "\nTodos os testes de banco passaram.");
