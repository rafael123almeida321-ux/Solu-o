// =====================================================================
// CLYENT CRM — Agente de IA (Supabase Edge Function "agente")
//
// A chave da Groq fica SÓ aqui no servidor, como secret GROQ_API_KEY.
// O agente age com o login de quem chamou: só vê e só mexe no que a
// pessoa já poderia ver/mexer no app (as regras do banco valem aqui).
// =====================================================================
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const GROQ = "https://api.groq.com/openai/v1";
const MODELO = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const MODELO_RAPIDO = Deno.env.get("GROQ_MODEL_RAPIDO") ?? "llama-3.1-8b-instant";
const MODELO_VOZ = Deno.env.get("GROQ_MODEL_VOZ") ?? "whisper-large-v3-turbo";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ESTAGIOS: Record<string, string> = {
  novo: "Novo",
  contato: "Em contato",
  revisita: "Revisita",
  apresentacao: "Apresentação",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};
const ABERTOS = ["novo", "contato", "revisita", "apresentacao", "proposta"];
const COLS =
  "id,team_id,owner_id,nome_negocio,nicho,descricao,bairro,cidade,origem,temperatura,estagio,produtos,valor_estimado,tags,proximo_followup,proximo_passo,ultimo_contato_em,contato_liberado,motivo_perda,fechado_em,created_at,created_by";

// deno-lint-ignore no-explicit-any
type Json = any;

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class ErroGroq extends Error {
  constructor(public status: number, public corpo: string) {
    super(`Groq respondeu ${status}`);
  }
}

async function groqChat(chave: string, body: Json): Promise<Json> {
  const r = await fetch(`${GROQ}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  if (!r.ok) throw new ErroGroq(r.status, texto);
  return JSON.parse(texto);
}

const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);
const faixa = (t: number) => (t >= 70 ? "quente" : t >= 40 ? "morno" : "frio");

/** "2026-10-15 10:00" sem fuso → horário de Brasília */
function paraIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let v = String(valor).trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T10:00";
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) v += "-03:00";
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function agoraBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ error: "Use POST." }, 405);

  const chave = Deno.env.get("GROQ_API_KEY");
  if (!chave) return resposta({ error: "GROQ_API_KEY não configurada no Supabase (Edge Functions → Secrets)." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data: u } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const user = u?.user;
  if (!user) return resposta({ error: "Faça login de novo." }, 401);

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return resposta({ error: "Pedido inválido." }, 400);
  }

  try {
    switch (body?.acao) {
      case "mensagem":
        return resposta(await gerarMensagem(supabase, chave, user.id, body));
      case "temperatura":
        return resposta(await analisarTemperatura(supabase, chave, body));
      case "transcrever":
        return resposta(await transcrever(chave, body));
      case "chat":
        return resposta(await conversar(supabase, chave, user.id, body));
      default:
        return resposta({ error: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroGroq) {
      console.error("groq", e.status, e.corpo);
      const msg =
        e.status === 401
          ? "A chave da Groq foi recusada. Confira o secret GROQ_API_KEY."
          : e.status === 429
            ? "Limite da Groq atingido. Espera um minutinho e tenta de novo."
            : e.status === 404 || /model/i.test(e.corpo)
              ? "Modelo da Groq indisponível. Ajuste o secret GROQ_MODEL (veja o README)."
              : "A IA não respondeu agora. Tenta de novo.";
      return resposta({ error: msg }, 502);
    }
    console.error(e);
    return resposta({ error: (e as Error).message ?? "Erro no agente." }, 500);
  }
});

// ---------------------------------------------------------------------
async function nomeDoUsuario(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("profiles").select("nome").eq("id", id).maybeSingle();
  return (data as Json)?.nome || "vendedor";
}

async function carregarLead(sb: SupabaseClient, leadId: string) {
  const [l, c, a] = await Promise.all([
    sb.from("leads").select(COLS).eq("id", leadId).maybeSingle(),
    sb.from("lead_contacts").select("responsavel,cargo,whatsapp,instagram,site,endereco").eq("lead_id", leadId).maybeSingle(),
    sb.from("lead_activities").select("tipo,conteudo,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!l.data) throw new Error("Lead não encontrado ou de outra equipe.");
  return { lead: l.data as Json, contato: c.data as Json, atividades: (a.data ?? []) as Json[] };
}

function resumoLead(lead: Json, contato: Json, atividades: Json[]) {
  return {
    negocio: lead.nome_negocio,
    nicho: lead.nicho,
    bairro: lead.bairro,
    descricao: lead.descricao,
    etapa: ESTAGIOS[lead.estagio] ?? lead.estagio,
    temperatura: `${lead.temperatura}° (${faixa(lead.temperatura)})`,
    produtos_interesse: lead.produtos,
    valor_estimado: lead.valor_estimado,
    dias_sem_contato: diasDesde(lead.ultimo_contato_em),
    proximo_passo: lead.proximo_passo,
    responsavel: contato?.responsavel ?? null,
    cargo: contato?.cargo ?? null,
    tem_site: contato?.site ? "sim" : "não informado",
    historico: atividades.map((x) => `[${x.tipo} · ${new Date(x.created_at).toLocaleDateString("pt-BR")}] ${String(x.conteudo).slice(0, 300)}`),
  };
}

// ---------------------------------------------------------------- mensagem
async function gerarMensagem(sb: SupabaseClient, chave: string, uid: string, body: Json) {
  const { lead, contato, atividades } = await carregarLead(sb, String(body.lead_id));
  if (!contato) throw new Error("Você não tem acesso ao contato desse lead.");
  const vendedor = await nomeDoUsuario(sb, uid);
  const objetivos: Record<string, string> = {
    primeiro: "primeira mensagem depois da visita presencial, retomando a conversa e oferecendo mandar exemplos/demo",
    followup: "follow-up leve pra retomar a conversa e descobrir o próximo passo",
    proposta: "avisar que a proposta está pronta e marcar 5 minutos pra apresentar",
    reativar: "reativar um lead que sumiu, sem cobrar, gerando curiosidade",
    objecao: "responder a objeção do cliente com empatia e um argumento concreto, terminando com uma pergunta",
    fechamento: "puxar para o fechamento, confirmando pacote e data de início",
  };
  const r = await groqChat(chave, {
    model: MODELO,
    temperature: 0.7,
    max_tokens: 320,
    messages: [
      {
        role: "system",
        content:
          "Você escreve mensagens de WhatsApp para vendedores de uma agência de marketing digital brasileira que vende para pequenos negócios locais (site, Google Meu Negócio, tráfego pago, automação de WhatsApp). " +
          "Regras: português do Brasil, informal e respeitoso; no máximo 3 frases curtas (até ~350 caracteres); no máximo 1 emoji; chame pelo primeiro nome do responsável se houver; " +
          "não invente preço, prazo, desconto nem resultado que não esteja nos dados; termine com uma pergunta simples de responder. Responda SOMENTE com o texto da mensagem, sem aspas.",
      },
      {
        role: "user",
        content: JSON.stringify({
          objetivo: objetivos[body.objetivo] ?? objetivos.followup,
          objecao_do_cliente: body.objecao || undefined,
          vendedor: vendedor.split(" ")[0],
          lead: resumoLead(lead, contato, atividades),
        }),
      },
    ],
  });
  const msg = String(r.choices?.[0]?.message?.content ?? "").trim().replace(/^["“]|["”]$/g, "");
  if (!msg) throw new Error("A IA voltou vazia. Tenta de novo.");
  return { mensagem: msg };
}

// ---------------------------------------------------------------- temperatura
async function analisarTemperatura(sb: SupabaseClient, chave: string, body: Json) {
  const { lead, contato, atividades } = await carregarLead(sb, String(body.lead_id));
  const r = await groqChat(chave, {
    model: MODELO_RAPIDO,
    temperature: 0.2,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Você avalia a chance de fechamento de um lead de vendas B2B local. Escala: 0–39 frio, 40–69 morno, 70–100 quente. ' +
          "Considere o histórico (o mais recente pesa mais), a etapa e os dias sem contato (lead parado esfria). " +
          'Responda SÓ um JSON: {"temperatura": inteiro 0-100, "motivo": "até 140 caracteres em português", "proximo_passo": "ação concreta, até 70 caracteres"}',
      },
      { role: "user", content: JSON.stringify(resumoLead(lead, contato, atividades)) },
    ],
  });
  const j = JSON.parse(r.choices?.[0]?.message?.content ?? "{}");
  const t = Math.max(0, Math.min(100, Math.round(Number(j.temperatura))));
  if (!Number.isFinite(t)) throw new Error("Não consegui avaliar agora.");
  return { temperatura: t, motivo: String(j.motivo ?? "").slice(0, 200), proximo_passo: j.proximo_passo ? String(j.proximo_passo).slice(0, 100) : undefined };
}

// ---------------------------------------------------------------- voz
async function transcrever(chave: string, body: Json) {
  const b64 = String(body.audio ?? "");
  if (!b64) throw new Error("Áudio vazio.");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Áudio grande demais (máx. ~20 MB).");
  const mime = String(body.mime || "audio/webm").split(";")[0];
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `nota.${ext}`);
  form.append("model", MODELO_VOZ);
  form.append("language", "pt");
  form.append("response_format", "json");
  const r = await fetch(`${GROQ}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form });
  const texto = await r.text();
  if (!r.ok) throw new ErroGroq(r.status, texto);
  return { texto: String(JSON.parse(texto).text ?? "").trim() };
}

// ---------------------------------------------------------------- chat com ferramentas
const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "buscar_leads",
      description: "Lista leads da equipe com filtros. Use antes de agir em vários leads. Por padrão traz só os leads do usuário.",
      parameters: {
        type: "object",
        properties: {
          dono: { type: "string", enum: ["meus", "equipe"], description: "meus = só do usuário; equipe = de todo mundo" },
          texto: { type: "string", description: "parte do nome do negócio, bairro ou nicho" },
          faixa: { type: "string", enum: ["quente", "morno", "frio"] },
          estagio: { type: "string", enum: Object.keys(ESTAGIOS) },
          esfriando: { type: "boolean", description: "só leads abertos com 5+ dias sem contato" },
          sem_proximo_passo: { type: "boolean", description: "só leads abertos sem data de próximo contato" },
          followup_ate_hoje: { type: "boolean", description: "só leads com próximo contato hoje ou atrasado" },
          limite: { type: "integer", description: "máximo de itens (padrão 20, máx 40)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ver_lead",
      description: "Detalhes de um lead: dados públicos, contato (se o usuário tiver acesso) e histórico recente.",
      parameters: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_lead",
      description: "Atualiza um lead do usuário (ou qualquer lead, se ele for admin). Só envie os campos que mudam.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          estagio: { type: "string", enum: Object.keys(ESTAGIOS) },
          temperatura: { type: "integer", description: "0 a 100" },
          proximo_followup: { type: "string", description: "data/hora no horário de Brasília, formato YYYY-MM-DD HH:mm" },
          proximo_passo: { type: "string" },
          motivo_perda: { type: "string", description: "obrigatório se estagio = perdido" },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_nota",
      description: "Registra uma nota/atividade no histórico de um lead.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          texto: { type: "string" },
          tipo: { type: "string", enum: ["nota", "ligacao", "whatsapp", "visita", "reuniao", "email"] },
        },
        required: ["lead_id", "texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumo_equipe",
      description: "Números da equipe no período: leads registrados, quentes, fechados e valor por pessoa, e funil.",
      parameters: { type: "object", properties: { periodo: { type: "string", enum: ["semana", "mes"] } } },
    },
  },
];

async function conversar(sb: SupabaseClient, chave: string, uid: string, body: Json) {
  const teamId = String(body.team_id ?? "");
  const { data: team } = await sb.from("teams").select("id,nome,produtos,comissao_vendedor_pct,owner_id").eq("id", teamId).maybeSingle();
  if (!team) throw new Error("Você não faz parte dessa equipe.");
  const { data: membrosRaw } = await sb.from("team_members").select("user_id,papel,profiles(nome)").eq("team_id", teamId);
  const membros = new Map(((membrosRaw ?? []) as Json[]).map((m) => [m.user_id, m.profiles?.nome ?? "Alguém"]));
  const meuNome = membros.get(uid) ?? (await nomeDoUsuario(sb, uid));
  const nome = (id: string) => (id === uid ? "você" : membros.get(id) ?? "ex-membro");

  const historico = (Array.isArray(body.mensagens) ? body.mensagens : [])
    .filter((m: Json) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .slice(-16)
    .map((m: Json) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  const sistema =
    `Você é o agente de vendas do CRM da equipe "${team.nome}" (agência de marketing digital que vende pra pequenos negócios locais, principalmente em prospecção presencial). ` +
    `Está falando com ${meuNome}. Agora é ${agoraBR()} (horário de Brasília). ` +
    `Produtos: ${((team.produtos ?? []) as Json[]).map((p) => `${p.nome} (R$ ${p.valor})`).join(", ") || "não cadastrados"}. ` +
    `Etapas do funil: ${Object.entries(ESTAGIOS).map(([k, v]) => `${k}=${v}`).join(", ")}. Temperatura: 0–39 frio, 40–69 morno, 70–100 quente. ` +
    "Regras: responda em português do Brasil, direto e curto (é lido no celular, na rua). Use as ferramentas pra consultar dados reais — nunca invente lead, número ou contato. " +
    "Antes de alterar vários leads, busque-os; depois diga exatamente o que mudou. Não peça confirmação pra coisas simples e reversíveis (mudar data, nota, temperatura); " +
    "peça confirmação antes de marcar como perdido ou fechado. Contato de lead protegido de outra pessoa não é acessível: se perguntarem, diga que é preciso pedir acesso ao dono no app. " +
    "Quando escrever mensagem pro cliente, entregue o texto pronto pra colar no WhatsApp (até 3 frases, 1 emoji no máximo).";

  const mensagens: Json[] = [{ role: "system", content: sistema }, ...historico];
  const acoes: { ferramenta: string; ok: boolean; resumo: string }[] = [];
  let chamadas = 0;

  for (let rodada = 0; rodada < 6; rodada++) {
    let r: Json;
    try {
      r = await groqChat(chave, { model: MODELO, temperature: 0.3, max_tokens: 900, messages: mensagens, tools: FERRAMENTAS, tool_choice: "auto" });
    } catch (e) {
      // às vezes o modelo gera uma chamada de ferramenta malformada: tenta mais uma vez
      if (e instanceof ErroGroq && e.status === 400 && /tool_use_failed|failed_generation/i.test(e.corpo)) {
        r = await groqChat(chave, { model: MODELO, temperature: 0.1, max_tokens: 900, messages: mensagens, tools: FERRAMENTAS, tool_choice: "auto" });
      } else throw e;
    }
    const msg = r.choices?.[0]?.message;
    if (!msg) throw new Error("A IA não respondeu.");
    const calls = (msg.tool_calls ?? []) as Json[];
    if (!calls.length) return { resposta: String(msg.content ?? "").trim(), acoes };

    mensagens.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      chamadas++;
      let args: Json = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        /* argumentos inválidos */
      }
      let resultado: Json;
      try {
        resultado = chamadas > 30 ? { erro: "limite de ações nesta conversa" } : await executar(sb, uid, teamId, call.function?.name, args, nome, acoes);
      } catch (e) {
        resultado = { erro: (e as Error).message };
      }
      mensagens.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(resultado).slice(0, 12000) });
    }
  }
  return { resposta: "Fiz o que deu por agora — confere as ações abaixo.", acoes };
}

async function executar(
  sb: SupabaseClient,
  uid: string,
  teamId: string,
  ferramenta: string,
  a: Json,
  nome: (id: string) => string,
  acoes: { ferramenta: string; ok: boolean; resumo: string }[],
): Promise<Json> {
  switch (ferramenta) {
    case "buscar_leads": {
      let q = sb.from("leads").select(COLS).eq("team_id", teamId).order("temperatura", { ascending: false }).limit(400);
      if ((a.dono ?? "meus") === "meus") q = q.eq("owner_id", uid);
      if (a.estagio) q = q.eq("estagio", a.estagio);
      const { data, error } = await q;
      if (error) throw error;
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      const t = String(a.texto ?? "").toLowerCase();
      const lista = ((data ?? []) as Json[])
        .filter((l) => !t || `${l.nome_negocio} ${l.bairro ?? ""} ${l.nicho ?? ""}`.toLowerCase().includes(t))
        .filter((l) => !a.faixa || faixa(l.temperatura) === a.faixa)
        .filter((l) => !a.esfriando || (ABERTOS.includes(l.estagio) && (diasDesde(l.ultimo_contato_em) ?? 0) >= 5))
        .filter((l) => !a.sem_proximo_passo || (ABERTOS.includes(l.estagio) && !l.proximo_followup))
        .filter((l) => !a.followup_ate_hoje || (ABERTOS.includes(l.estagio) && l.proximo_followup && new Date(l.proximo_followup) <= hoje))
        .slice(0, Math.min(40, Number(a.limite) || 20))
        .map((l) => ({
          lead_id: l.id,
          negocio: l.nome_negocio,
          nicho: l.nicho,
          bairro: l.bairro,
          dono: nome(l.owner_id),
          temperatura: l.temperatura,
          etapa: ESTAGIOS[l.estagio],
          dias_sem_contato: diasDesde(l.ultimo_contato_em),
          proximo_contato: l.proximo_followup ? new Date(l.proximo_followup).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null,
          proximo_passo: l.proximo_passo,
          valor: l.valor_estimado,
        }));
      return { total: lista.length, leads: lista };
    }

    case "ver_lead": {
      const { lead, contato, atividades } = await carregarLead(sb, String(a.lead_id));
      if (lead.team_id !== teamId) throw new Error("Lead de outra equipe.");
      return {
        ...resumoLead(lead, contato, atividades),
        dono: nome(lead.owner_id),
        contato: contato ?? "protegido — só o dono vê (dá pra pedir acesso no app)",
        historico: contato ? resumoLead(lead, contato, atividades).historico : "protegido",
      };
    }

    case "atualizar_lead": {
      const patch: Json = {};
      if (a.estagio && ESTAGIOS[a.estagio]) patch.estagio = a.estagio;
      if (a.temperatura != null) patch.temperatura = Math.max(0, Math.min(100, Math.round(Number(a.temperatura))));
      if (a.proximo_followup) patch.proximo_followup = paraIso(a.proximo_followup);
      if (a.proximo_passo != null) patch.proximo_passo = String(a.proximo_passo).slice(0, 200);
      if (patch.estagio === "perdido") patch.motivo_perda = String(a.motivo_perda || "Não informado").slice(0, 200);
      if (patch.estagio === "fechado") patch.producao_status = "afazer";
      if (!Object.keys(patch).length) return { erro: "nada pra atualizar" };
      const { data, error } = await sb.from("leads").update(patch).eq("id", a.lead_id).eq("team_id", teamId).select("nome_negocio");
      const ok = !error && (data ?? []).length > 0;
      const alvo = (data as Json[] | null)?.[0]?.nome_negocio ?? "lead";
      const partes = [
        patch.estagio && `etapa → ${ESTAGIOS[patch.estagio]}`,
        patch.temperatura != null && `${patch.temperatura}°`,
        patch.proximo_followup && `próximo contato ${new Date(patch.proximo_followup).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        patch.proximo_passo && `passo: ${patch.proximo_passo}`,
      ].filter(Boolean);
      acoes.push({ ferramenta, ok, resumo: ok ? `${alvo}: ${partes.join(" · ")}` : `Não consegui alterar (${error?.message ?? "lead de outra pessoa"})` });
      return ok ? { ok: true, alterado: partes } : { erro: error?.message ?? "sem permissão: lead de outra pessoa" };
    }

    case "registrar_nota": {
      const texto = String(a.texto ?? "").trim().slice(0, 2000);
      if (!texto) return { erro: "nota vazia" };
      const { error } = await sb.from("lead_activities").insert({ lead_id: a.lead_id, user_id: uid, tipo: a.tipo ?? "nota", conteudo: texto });
      acoes.push({ ferramenta, ok: !error, resumo: error ? `Nota não salva (${error.message})` : `Nota registrada: “${texto.slice(0, 60)}${texto.length > 60 ? "…" : ""}”` });
      return error ? { erro: "sem acesso ao histórico desse lead" } : { ok: true };
    }

    case "resumo_equipe": {
      const desde = new Date();
      if (a.periodo === "mes") desde.setDate(1);
      else desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7));
      desde.setHours(0, 0, 0, 0);
      const { data } = await sb.from("leads").select(COLS).eq("team_id", teamId).limit(3000);
      const leads = (data ?? []) as Json[];
      const pessoas: Record<string, { registrados: number; quentes: number; fechados: number; valor_fechado: number }> = {};
      const p = (id: string) => (pessoas[nome(id)] ??= { registrados: 0, quentes: 0, fechados: 0, valor_fechado: 0 });
      for (const l of leads) {
        if (new Date(l.created_at) >= desde) p(l.created_by).registrados++;
        if (ABERTOS.includes(l.estagio) && l.temperatura >= 70) p(l.owner_id).quentes++;
        if (l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= desde) {
          p(l.owner_id).fechados++;
          p(l.owner_id).valor_fechado += Number(l.valor_estimado || 0);
        }
      }
      const funil = Object.fromEntries(Object.entries(ESTAGIOS).map(([k, v]) => [v, leads.filter((l) => l.estagio === k).length]));
      return { periodo: a.periodo === "mes" ? "este mês" : "esta semana", por_pessoa: pessoas, funil, total_leads: leads.length };
    }

    default:
      return { erro: `ferramenta desconhecida: ${ferramenta}` };
  }
}
