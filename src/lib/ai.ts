import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { blobParaBase64 } from "./audio";
import { ESTAGIO_LABEL } from "./constants";
import type { Activity, Lead, LeadContact } from "./types";
import { faixaTemp } from "./utils";

/**
 * Ponte com o Agente de IA (Groq). A chave NUNCA fica aqui: o app chama a
 * Edge Function "agente" do Supabase, que guarda a chave como secret.
 * Se a função ainda não foi publicada, usamos modelos locais simples.
 */

export class AgenteIndisponivel extends Error {}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("agente", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const j = await error.context.json();
        msg = j?.error || msg;
      } catch {
        /* resposta sem json */
      }
    }
    throw new AgenteIndisponivel(msg);
  }
  if (data && typeof data === "object" && "error" in data && data.error) throw new AgenteIndisponivel(String(data.error));
  return data as T;
}

export type Objetivo = "primeiro" | "followup" | "proposta" | "reativar" | "objecao" | "fechamento";

export const OBJETIVOS: { id: Objetivo; label: string }[] = [
  { id: "primeiro", label: "Primeira mensagem pós-visita" },
  { id: "followup", label: "Follow-up" },
  { id: "proposta", label: "Enviar proposta" },
  { id: "objecao", label: "Responder objeção" },
  { id: "reativar", label: "Reativar lead sumido" },
  { id: "fechamento", label: "Puxar pro fechamento" },
];

export interface Resultado<T> {
  dados: T;
  local: boolean;
  aviso?: string;
}

// ---------- mensagem ----------

export async function gerarMensagem(args: {
  lead: Lead;
  contato: LeadContact | null;
  objetivo: Objetivo;
  objecao?: string;
  vendedor: string;
}): Promise<Resultado<string>> {
  try {
    const r = await invocar<{ mensagem: string }>({
      acao: "mensagem",
      lead_id: args.lead.id,
      objetivo: args.objetivo,
      objecao: args.objecao ?? "",
    });
    return { dados: r.mensagem, local: false };
  } catch (e) {
    return { dados: mensagemLocal(args), local: true, aviso: (e as Error).message };
  }
}

function mensagemLocal({ lead, contato, objetivo, objecao, vendedor }: {
  lead: Lead;
  contato: LeadContact | null;
  objetivo: Objetivo;
  objecao?: string;
  vendedor: string;
}) {
  const nome = contato?.responsavel?.split(" ")[0] || "tudo bem";
  const oi = contato?.responsavel ? `Oi, ${nome}!` : "Oi, tudo bem?";
  const neg = lead.nome_negocio;
  const primeiroNome = vendedor.split(" ")[0];
  switch (objetivo) {
    case "primeiro":
      return `${oi} Aqui é o ${primeiroNome}, passei hoje na ${neg}. Como combinamos, vou te mandar uns exemplos de como fica a presença no Google e o site pra quem é do seu ramo. Posso mandar aqui?`;
    case "followup":
      return `${oi} Passando pra saber se você conseguiu dar uma olhada no que te mandei sobre a ${neg}. Ficou alguma dúvida que eu possa resolver rapidinho?`;
    case "proposta":
      return `${oi} Montei a proposta da ${neg} certinha, do jeito que conversamos. Posso te mandar agora e a gente passa por ela em 5 minutinhos?`;
    case "reativar":
      return `${oi} Faz um tempinho que a gente conversou sobre a ${neg}. Esse mês abri poucas vagas pra novos projetos aqui na região — ainda faz sentido pra você?`;
    case "objecao":
      return `${oi} Entendo total${objecao ? ` sobre "${objecao.slice(0, 80)}"` : ""}. A maioria dos clientes que atendo pensava igual no começo — o que mudou foi ver o retorno nas primeiras semanas. Posso te mostrar um caso parecido com a ${neg}?`;
    case "fechamento":
      return `${oi} Pra gente começar a ${neg} ainda essa semana, só preciso confirmar o pacote e o melhor dia pra começar. Bora fechar?`;
  }
}

// ---------- temperatura ----------

export interface Analise {
  temperatura: number;
  motivo: string;
  proximo_passo?: string;
}

export async function analisarTemperatura(lead: Lead, atividades: Activity[]): Promise<Resultado<Analise>> {
  try {
    const r = await invocar<Analise>({ acao: "temperatura", lead_id: lead.id });
    return { dados: { ...r, temperatura: Math.max(0, Math.min(100, Math.round(r.temperatura))) }, local: false };
  } catch (e) {
    return { dados: temperaturaLocal(lead, atividades), local: true, aviso: (e as Error).message };
  }
}

function temperaturaLocal(lead: Lead, atividades: Activity[]): Analise {
  const notas = atividades.filter((a) => a.tipo !== "sistema").slice(0, 3);
  const texto = notas.map((n) => n.conteudo.toLowerCase()).join(" ");
  if (!texto) return { temperatura: lead.temperatura, motivo: "Sem notas recentes pra analisar. Registre como foi a última conversa." };
  const tem = (lista: string[]) => lista.find((k) => texto.includes(k));
  const frio = tem(["sem interesse", "não quero", "nao quero", "já tenho", "ja tenho", "não precisa", "nao precisa", "caro demais", "não vai dar", "parar de mandar"]);
  const quente = tem(["fechar", "contrato", "manda a proposta", "pode mandar", "quero", "bora", "quando começa", "pix", "pagamento"]);
  const morno = tem(["vou pensar", "depois", "sócio", "socio", "esposa", "marido", "talvez", "semana que vem", "mês que vem", "mes que vem"]);
  if (frio) return { temperatura: 15, motivo: `A última conversa indica recusa ("${frio}").`, proximo_passo: "Agendar nova tentativa em 30 dias" };
  if (quente) return { temperatura: 85, motivo: `Sinal de compra na última conversa ("${quente}").`, proximo_passo: "Mandar proposta/contrato hoje" };
  if (morno) return { temperatura: 50, motivo: `Cliente em dúvida ("${morno}").`, proximo_passo: "Descobrir a objeção real e marcar data" };
  const parado = Math.floor((Date.now() - new Date(lead.ultimo_contato_em).getTime()) / 86_400_000);
  if (parado >= 7) return { temperatura: Math.max(10, lead.temperatura - 15), motivo: `Sem contato há ${parado} dias — esfriando.`, proximo_passo: "Mandar mensagem de reativação" };
  return { temperatura: lead.temperatura, motivo: `Nada claro nas notas; mantendo ${faixaTemp(lead.temperatura)} em ${ESTAGIO_LABEL[lead.estagio]}.` };
}

// ---------- voz ----------

export async function transcrever(audio: Blob): Promise<string> {
  const b64 = await blobParaBase64(audio);
  const r = await invocar<{ texto: string }>({ acao: "transcrever", audio: b64, mime: audio.type || "audio/webm" });
  return (r.texto || "").trim();
}

// ---------- chat ----------

export interface MsgChat {
  role: "user" | "assistant";
  content: string;
}

export interface RespostaChat {
  resposta: string;
  acoes: { ferramenta: string; ok: boolean; resumo: string }[];
}

export async function conversar(teamId: string, mensagens: MsgChat[]): Promise<RespostaChat> {
  return invocar<RespostaChat>({ acao: "chat", team_id: teamId, mensagens: mensagens.slice(-16) });
}
