// =====================================================================
// CLYENT Comando — Assistente pessoal (Supabase Edge Function "assistente")
//
// Conversa com base no contexto que o app manda (rotina, metas, dinheiro,
// ações) e pode REGISTRAR coisas com o login de quem chamou: as regras do
// banco (RLS) valem aqui, então ele só mexe nos dados da própria pessoa.
// A chave da Groq fica só no servidor (secret GROQ_API_KEY).
// =====================================================================
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const GROQ = "https://api.groq.com/openai/v1";
const MODELO = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// deno-lint-ignore no-explicit-any
type Json = any;
const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SISTEMA = `Você é o assistente pessoal de execução dentro do app "CLYENT Comando" — o sócio e mentor do usuário.
Jeito de falar: português do Brasil, informal e direto, frases curtas, sem enrolação. Chame de "sócio" quando fizer sentido.
Como ajudar:
- Use SEMPRE os dados do CONTEXTO (rotina de hoje, horário atual, metas, dívidas, compromissos, ações). Nunca invente valores, datas ou fatos; se faltar dado, diga que falta e peça.
- "O que faço agora?": olhe o horário e o bloco atual da rotina, diga UMA coisa para fazer agora e a próxima, em passos concretos.
- Priorize o que traz caixa no curto prazo e o que tem data (dívidas, vencimentos), sem largar treino, alimentação e descanso.
- Respeite blocos marcados como casal/descanso: não proponha trabalho neles.
- Seja honesto: se o plano não fecha, fale. Não bajule. Sem culpa quando o dia foi ruim: replaneje.
- Respostas curtas (até ~12 linhas), com listas quando ajudar. Termine com o próximo passo.
- Você PODE registrar coisas usando as ferramentas quando o usuário pedir ou confirmar (ex.: "fiz o treino", "pesei 84,5", "cria uma tarefa", "vendi 4 plaquinhas por 260 no Nubank"). Depois de usar uma ferramenta, diga em uma linha o que registrou.
- Não registre dinheiro sem valor e descrição claros. Nunca apague nada.
- Não dê diagnóstico médico; para dieta/treino, dê orientação geral e segura.`;

const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Cria uma ação/tarefa no app.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          proximo_passo: { type: "string" },
          prazo: { type: "string", description: "AAAA-MM-DD" },
          tempo_min: { type: "integer" },
          fixar_hoje: { type: "boolean", description: "fixar como prioridade de hoje" },
          frente: { type: "string", description: "nome (ou parte) da frente de renda" },
          potencial_reais: { type: "number" },
          motivo: { type: "string" },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "concluir_tarefa",
      description: "Marca como feita uma ação aberta, achando pelo título (ou parte dele).",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_rotina",
      description: "Marca um bloco da rotina de um dia como feito, parcial ou pulado, achando pelo título.",
      parameters: {
        type: "object",
        properties: {
          bloco: { type: "string" },
          status: { type: "string", enum: ["feito", "parcial", "pulado"] },
          data: { type: "string", description: "AAAA-MM-DD; padrão hoje" },
          nota: { type: "string" },
        },
        required: ["bloco", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_medida",
      description: "Registra uma medida pessoal do dia (ex.: peso em kg).",
      parameters: {
        type: "object",
        properties: { metrica: { type: "string", description: "ex.: peso" }, valor: { type: "number" }, data: { type: "string" } },
        required: ["metrica", "valor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_bloco_rotina",
      description: "Adiciona um bloco fixo na rotina semanal.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          dias: { type: "array", items: { type: "integer" }, description: "0=domingo … 6=sábado" },
          inicio: { type: "string", description: "HH:MM" },
          fim: { type: "string", description: "HH:MM" },
          categoria: { type: "string", enum: ["treino", "venda", "trabalho", "estudo", "refeicao", "pessoal", "casal", "descanso"] },
          habito: { type: "string" },
          detalhe: { type: "string" },
        },
        required: ["titulo", "dias", "inicio", "fim", "categoria"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pausar_bloco_rotina",
      description: "Tira um bloco da rotina (desativa, sem apagar o histórico), achando pelo título.",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_lancamento",
      description: "Registra dinheiro que JÁ entrou ou saiu (realizado).",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["entrada", "saida"] },
          valor_reais: { type: "number" },
          descricao: { type: "string" },
          conta: { type: "string", description: "nome da conta; pode omitir se só existir uma" },
          frente: { type: "string" },
          data: { type: "string" },
        },
        required: ["tipo", "valor_reais", "descricao"],
      },
    },
  },
];

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const dataOk = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function acharPorNome<T extends { id: string }>(sb: SupabaseClient, tabela: string, campo: string, nome: string, extra?: (q: Json) => Json): Promise<T | null> {
  let q = sb.from(tabela).select("*");
  if (extra) q = extra(q);
  const { data } = await q;
  const lista = (data ?? []) as Json[];
  const alvo = norm(nome);
  return (lista.find((x) => norm(x[campo]) === alvo) ?? lista.find((x) => norm(x[campo]).includes(alvo)) ?? lista.find((x) => alvo.includes(norm(x[campo])))) ?? null;
}

async function executar(sb: SupabaseClient, nome: string, a: Json): Promise<{ ok: boolean; texto: string }> {
  const hoje = hojeSP();
  try {
    if (nome === "criar_tarefa") {
      let frente_id = null;
      if (a.frente) frente_id = (await acharPorNome<{ id: string }>(sb, "fin_frentes", "nome", a.frente))?.id ?? null;
      const { error } = await sb.from("fin_tasks").insert({
        titulo: String(a.titulo).slice(0, 140),
        proximo_passo: a.proximo_passo ?? "",
        prazo: dataOk(a.prazo),
        tempo_min: Number.isInteger(a.tempo_min) && a.tempo_min > 0 ? a.tempo_min : null,
        foco_em: a.fixar_hoje ? hoje : null,
        frente_id,
        potencial_caixa_centavos: a.potencial_reais ? Math.round(Number(a.potencial_reais) * 100) : 0,
        motivo: a.motivo ?? "",
      });
      if (error) throw error;
      return { ok: true, texto: `Tarefa criada: ${a.titulo}` };
    }
    if (nome === "concluir_tarefa") {
      const t = await acharPorNome<{ id: string; titulo: string }>(sb, "fin_tasks", "titulo", a.titulo, (q) => q.eq("status", "aberta"));
      if (!t) return { ok: false, texto: `Não achei tarefa aberta parecida com "${a.titulo}".` };
      const { error } = await sb.from("fin_tasks").update({ status: "feita", concluida_em: new Date().toISOString() }).eq("id", t.id);
      if (error) throw error;
      return { ok: true, texto: `Tarefa concluída: ${t.titulo}` };
    }
    if (nome === "marcar_rotina") {
      const b = await acharPorNome<{ id: string; titulo: string; habito: string }>(sb, "rot_blocos", "titulo", a.bloco, (q) => q.eq("ativo", true));
      if (!b) return { ok: false, texto: `Não achei bloco da rotina parecido com "${a.bloco}".` };
      const data = dataOk(a.data) ?? hoje;
      const { error } = await sb
        .from("rot_registros")
        .upsert({ data, bloco_id: b.id, titulo: b.titulo, habito: b.habito, status: a.status, nota: a.nota ?? "" }, { onConflict: "user_id,data,bloco_id" });
      if (error) throw error;
      return { ok: true, texto: `Rotina: "${b.titulo}" marcado como ${a.status} (${data})` };
    }
    if (nome === "registrar_medida") {
      const valor = Number(a.valor);
      if (!Number.isFinite(valor)) return { ok: false, texto: "Valor inválido." };
      const data = dataOk(a.data) ?? hoje;
      const { error } = await sb.from("pes_medidas").upsert({ data, metrica: norm(String(a.metrica)), valor }, { onConflict: "user_id,data,metrica" });
      if (error) throw error;
      return { ok: true, texto: `Medida registrada: ${a.metrica} = ${valor} (${data})` };
    }
    if (nome === "criar_bloco_rotina") {
      const hora = (h: string) => (/^\d{1,2}:\d{2}$/.test(h) ? h : null);
      if (!hora(a.inicio) || !hora(a.fim)) return { ok: false, texto: "Horário inválido (use HH:MM)." };
      const dias = (Array.isArray(a.dias) ? a.dias : []).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (!dias.length) return { ok: false, texto: "Informe os dias da semana." };
      const { error } = await sb.from("rot_blocos").insert({
        titulo: String(a.titulo).slice(0, 80), dias, inicio: a.inicio, fim: a.fim, categoria: a.categoria, habito: a.habito ?? "", detalhe: a.detalhe ?? "",
      });
      if (error) throw error;
      return { ok: true, texto: `Bloco adicionado na rotina: ${a.titulo} (${a.inicio}–${a.fim})` };
    }
    if (nome === "pausar_bloco_rotina") {
      const b = await acharPorNome<{ id: string; titulo: string }>(sb, "rot_blocos", "titulo", a.titulo, (q) => q.eq("ativo", true));
      if (!b) return { ok: false, texto: `Não achei bloco parecido com "${a.titulo}".` };
      const { error } = await sb.from("rot_blocos").update({ ativo: false }).eq("id", b.id);
      if (error) throw error;
      return { ok: true, texto: `Bloco tirado da rotina: ${b.titulo}` };
    }
    if (nome === "registrar_lancamento") {
      const centavos = Math.round(Number(a.valor_reais) * 100);
      if (!Number.isSafeInteger(centavos) || centavos <= 0) return { ok: false, texto: "Valor inválido." };
      if (!a.descricao) return { ok: false, texto: "Falta a descrição." };
      const { data: contas } = await sb.from("fin_accounts").select("id,nome,tipo,arquivada").eq("arquivada", false);
      const lista = (contas ?? []) as Json[];
      let conta = a.conta ? lista.find((c) => norm(c.nome).includes(norm(a.conta))) : null;
      if (!conta) {
        const caixa = lista.filter((c) => c.tipo !== "cartao");
        if (caixa.length === 1) conta = caixa[0];
      }
      if (!conta) return { ok: false, texto: lista.length ? `Em qual conta? (${lista.map((c) => c.nome).join(", ")})` : "Nenhuma conta cadastrada. Cadastre em Caixa → Contas." };
      let frente_id = null;
      if (a.frente) frente_id = (await acharPorNome<{ id: string }>(sb, "fin_frentes", "nome", a.frente))?.id ?? null;
      const { error } = await sb.from("fin_entries").insert({
        tipo: a.tipo, status: "realizado", valor_centavos: centavos, descricao: String(a.descricao).slice(0, 140), conta_id: conta.id,
        data_pagamento: dataOk(a.data) ?? hoje, frente_id, escopo: frente_id ? "negocio" : "pessoal", notas: "registrado pelo assistente",
      });
      if (error) throw error;
      return { ok: true, texto: `${a.tipo === "entrada" ? "Entrada" : "Saída"} registrada: R$ ${(centavos / 100).toFixed(2).replace(".", ",")} — ${a.descricao} (${conta.nome})` };
    }
    return { ok: false, texto: `Ferramenta desconhecida: ${nome}` };
  } catch (e) {
    return { ok: false, texto: `Erro ao registrar: ${(e as Error).message ?? e}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ error: "Use POST." }, 405);
  const chave = Deno.env.get("GROQ_API_KEY");
  if (!chave) return resp({ error: "sem_chave", mensagem: "Assistente desligado: falta o secret GROQ_API_KEY no Supabase." }, 503);
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return resp({ error: "Faça login novamente." }, 401);

  let corpo: Json;
  try {
    corpo = await req.json();
  } catch {
    return resp({ error: "JSON inválido." }, 400);
  }
  const historico = (Array.isArray(corpo.mensagens) ? corpo.mensagens : [])
    .filter((m: Json) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m: Json) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
  const contexto = String(corpo.contexto ?? "").slice(0, 16000);
  const msgs: Json[] = [{ role: "system", content: `${SISTEMA}\n\n=== CONTEXTO (dados do app agora) ===\n${contexto}` }, ...historico];
  const acoes: { ok: boolean; texto: string }[] = [];

  for (let rodada = 0; rodada < 4; rodada++) {
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, messages: msgs, tools: FERRAMENTAS, tool_choice: "auto", temperature: 0.4, max_tokens: 900 }),
    });
    const texto = await r.text();
    if (!r.ok) {
      const limite = r.status === 429;
      return resp({ error: limite ? "limite" : "groq", mensagem: limite ? "A IA atingiu o limite de uso por agora. Tenta de novo em alguns minutos." : "A IA não respondeu agora. Tenta de novo.", detalhe: texto.slice(0, 300) }, 502);
    }
    const j = JSON.parse(texto);
    const m = j.choices?.[0]?.message;
    if (!m) break;
    if (m.tool_calls?.length) {
      msgs.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
      for (const tc of m.tool_calls) {
        let args: Json = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch { /* ignora */ }
        const res = await executar(sb, tc.function.name, args);
        acoes.push(res);
        msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(res) });
      }
      continue;
    }
    return resp({ resposta: m.content ?? "", acoes });
  }
  return resp({ resposta: acoes.length ? "Pronto, registrei:\n" + acoes.map((a) => `• ${a.texto}`).join("\n") : "Não consegui concluir agora.", acoes });
});
