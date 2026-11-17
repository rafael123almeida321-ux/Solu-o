// Rotina do dia e metas pessoais (peso, hábitos). Funções puras, testadas em rotina.test.ts.
import { diaDaSemana, difDias, inicioSemana, somaDias } from "./datas";
import type { Bloco, DataISO, Medida, MetaPessoal, RegistroRotina } from "./tipos";

/** "06:30:00" | "06:30" → minutos desde meia-noite */
export function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}
export const hhmm = (hora: string) => hora.slice(0, 5);

/** hora local de São Paulo em minutos */
export function agoraMinSP(agora: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function blocosDoDia(blocos: Bloco[], data: DataISO): Bloco[] {
  const w = diaDaSemana(data);
  return blocos.filter((b) => b.ativo && b.dias.includes(w)).sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
}

export interface ItemAgenda {
  bloco: Bloco;
  registro: RegistroRotina | null;
  estado: "passado" | "agora" | "futuro";
}

export function agendaDoDia(blocos: Bloco[], registros: RegistroRotina[], data: DataISO, hoje: DataISO, agoraMin: number): ItemAgenda[] {
  const regs = new Map(registros.filter((r) => r.data === data && r.bloco_id).map((r) => [r.bloco_id as string, r]));
  return blocosDoDia(blocos, data).map((b) => {
    let estado: ItemAgenda["estado"] = "futuro";
    if (data < hoje) estado = "passado";
    else if (data === hoje) {
      const ini = minutos(b.inicio);
      const fim = minutos(b.fim) <= ini ? minutos(b.fim) + 24 * 60 : minutos(b.fim);
      estado = agoraMin >= fim ? "passado" : agoraMin >= ini ? "agora" : "futuro";
    }
    return { bloco: b, registro: regs.get(b.id) ?? null, estado };
  });
}

/** resumo do dia: quantos blocos feitos / do total que já deveriam ter acontecido */
export function placarDoDia(agenda: ItemAgenda[]) {
  const total = agenda.length;
  const feitos = agenda.filter((i) => i.registro?.status === "feito").length;
  const parciais = agenda.filter((i) => i.registro?.status === "parcial").length;
  const pendentesPassados = agenda.filter((i) => i.estado === "passado" && !i.registro).length;
  return { total, feitos, parciais, pendentesPassados };
}

// ------------------------------------------------------------------ metas pessoais

export interface ProgressoPessoal {
  meta: MetaPessoal;
  atual: number | null;
  atualData: DataISO | null;
  alvo: number | null;
  pct: number | null; // 0–100
  falta: number | null;
  semana?: { feitos: number; alvo: number; inicio: DataISO; fim: DataISO };
  ritmo?: { porSemana: number; necessarioPorSemana: number | null; semanasRestantes: number | null };
  status: "sem_dados" | "atingida" | "em_andamento" | "prazo_encerrado";
  explicacao: string;
}

export function ultimaMedida(medidas: Medida[], metrica: string, ate?: DataISO): Medida | null {
  return (
    medidas
      .filter((m) => m.metrica === metrica && (!ate || m.data <= ate))
      .sort((a, b) => b.data.localeCompare(a.data))[0] ?? null
  );
}

export function progressoMetaPessoal(meta: MetaPessoal, medidas: Medida[], registros: RegistroRotina[], hoje: DataISO): ProgressoPessoal {
  if (meta.tipo === "habito") {
    const ini = inicioSemana(hoje);
    const fim = somaDias(ini, 6);
    const feitos = registros.filter((r) => r.habito === meta.habito && r.status !== "pulado" && r.data >= ini && r.data <= fim).length;
    const alvo = meta.vezes_semana ?? 0;
    return {
      meta,
      atual: feitos,
      atualData: hoje,
      alvo,
      pct: alvo ? Math.min(100, Math.round((feitos / alvo) * 100)) : null,
      falta: alvo ? Math.max(0, alvo - feitos) : null,
      semana: { feitos, alvo, inicio: ini, fim },
      status: alvo && feitos >= alvo ? "atingida" : "em_andamento",
      explicacao: `Conta os blocos da rotina com o hábito "${meta.habito}" marcados como feitos ou parciais nesta semana (seg–dom).`,
    };
  }
  const ult = ultimaMedida(medidas, meta.metrica, hoje);
  const atual = ult ? Number(ult.valor) : null;
  const ini = meta.valor_inicial !== null ? Number(meta.valor_inicial) : null;
  const alvo = meta.alvo !== null ? Number(meta.alvo) : null;
  const base: ProgressoPessoal = {
    meta,
    atual,
    atualData: ult?.data ?? null,
    alvo,
    pct: null,
    falta: null,
    status: "em_andamento",
    explicacao: `Usa a última medida de "${meta.metrica}" registrada. Progresso = quanto já andou do valor inicial até o alvo.`,
  };
  if (atual === null || alvo === null) return { ...base, status: "sem_dados" };
  const sobe = meta.direcao === "subir";
  const falta = Math.round((sobe ? alvo - atual : atual - alvo) * 10) / 10;
  base.falta = Math.max(0, falta);
  if (ini !== null && ini !== alvo) base.pct = Math.max(0, Math.min(100, Math.round(((atual - ini) / (alvo - ini)) * 100)));
  if (falta <= 0) return { ...base, status: "atingida", pct: 100 };
  if (meta.prazo && hoje > meta.prazo) return { ...base, status: "prazo_encerrado" };
  // ritmo: variação média por semana desde a primeira medida (precisa de 2 medidas com 7+ dias de distância)
  const ms = medidas.filter((m) => m.metrica === meta.metrica && m.data <= hoje).sort((a, b) => a.data.localeCompare(b.data));
  if (ms.length >= 2) {
    const dias = difDias(ms[0].data, ms[ms.length - 1].data);
    if (dias >= 7) {
      const porSemana = Math.round(((Number(ms[ms.length - 1].valor) - Number(ms[0].valor)) / dias) * 7 * 10) / 10;
      const semanasRestantes = meta.prazo ? Math.max(0, difDias(hoje, meta.prazo)) / 7 : null;
      base.ritmo = {
        porSemana,
        necessarioPorSemana: semanasRestantes ? Math.round((falta / semanasRestantes) * 10) / 10 * (sobe ? 1 : -1) : null,
        semanasRestantes: semanasRestantes !== null ? Math.round(semanasRestantes * 10) / 10 : null,
      };
    }
  }
  return base;
}

/** sequência de dias seguidos (até ontem/hoje) com pelo menos um bloco do hábito feito */
export function sequenciaHabito(registros: RegistroRotina[], habito: string, hoje: DataISO): number {
  const dias = new Set(registros.filter((r) => r.habito === habito && r.status !== "pulado").map((r) => r.data));
  let d = dias.has(hoje) ? hoje : somaDias(hoje, -1);
  let n = 0;
  while (dias.has(d)) {
    n++;
    d = somaDias(d, -1);
  }
  return n;
}
