import type { Estagio, ProducaoStatus, TipoAtividade } from "./types";

export const ESTAGIOS: { id: Estagio; label: string; cor: string; dica: string }[] = [
  { id: "novo", label: "Novo", cor: "#8B9098", dica: "Mapeado, ainda sem conversa de verdade" },
  { id: "contato", label: "Em contato", cor: "#4C8DFF", dica: "Já conversou, relação começando" },
  { id: "revisita", label: "Revisita", cor: "#B07CFF", dica: "Precisa voltar lá pessoalmente" },
  { id: "apresentacao", label: "Apresentação", cor: "#2ED3C6", dica: "Demo enviada ou reunião marcada" },
  { id: "proposta", label: "Proposta", cor: "#FFB020", dica: "Proposta na mão do cliente" },
  { id: "fechado", label: "Fechado", cor: "#39FF14", dica: "Venda feita — vai pra produção" },
  { id: "perdido", label: "Perdido", cor: "#5B6068", dica: "Não rolou (com motivo)" },
];

export const ESTAGIO_LABEL = Object.fromEntries(ESTAGIOS.map((e) => [e.id, e.label])) as Record<Estagio, string>;
export const ESTAGIO_COR = Object.fromEntries(ESTAGIOS.map((e) => [e.id, e.cor])) as Record<Estagio, string>;
export const ESTAGIOS_ABERTOS: Estagio[] = ["novo", "contato", "revisita", "apresentacao", "proposta"];

export const PRODUCAO: { id: ProducaoStatus; label: string }[] = [
  { id: "afazer", label: "A fazer" },
  { id: "construcao", label: "Construindo" },
  { id: "revisao", label: "Revisão" },
  { id: "entregue", label: "Entregue" },
];

export const NICHOS = [
  "Estética", "Barbearia", "Salão", "Esmalteria", "Dentista", "Clínica", "Advocacia", "Contabilidade",
  "Academia", "Restaurante", "Lanchonete", "Pizzaria", "Padaria", "Imobiliária", "Pet shop",
  "Oficina", "Autopeças", "Buffet", "Ótica", "Loja de roupas", "Calçados", "Farmácia", "Escola/Curso", "Outro",
];

/** palavras no nome do negócio → nicho sugerido (instantâneo, sem IA) */
export const NICHO_PISTAS: [RegExp, string][] = [
  [/barbe|barber/i, "Barbearia"],
  [/esmalt|unha|nail/i, "Esmalteria"],
  [/sal[aã]o|cabel|hair|beleza|beauty/i, "Salão"],
  [/est[eé]tic|spa|depila|sobrancelha|lash|c[ií]lio/i, "Estética"],
  [/odonto|dent|sorriso/i, "Dentista"],
  [/cl[ií]nic|m[eé]dic|fisio|psic|nutri|sa[uú]de/i, "Clínica"],
  [/advoc|jur[ií]d|direito|adv\b/i, "Advocacia"],
  [/cont[aá]bil|contador/i, "Contabilidade"],
  [/academ|fit|crossfit|gym|pilates|muscula/i, "Academia"],
  [/pizz/i, "Pizzaria"],
  [/padar|panific|confeit|doce/i, "Padaria"],
  [/lanch|burger|hamb|pastel|a[cç]a[ií]/i, "Lanchonete"],
  [/restaur|bistr|cozinha|grill|churras|sushi|bar\b/i, "Restaurante"],
  [/im[oó]v|imobili|corretor/i, "Imobiliária"],
  [/pet|vet|ra[cç][aã]o|banho e tosa/i, "Pet shop"],
  [/oficina|mec[aâ]nic|funilar|auto ?center|pneu/i, "Oficina"],
  [/autope[cç]/i, "Autopeças"],
  [/buffet|festa|evento/i, "Buffet"],
  [/[oó]tica|[oó]culos/i, "Ótica"],
  [/moda|roupa|boutique|store|modas/i, "Loja de roupas"],
  [/cal[cç]ad|sapat|t[eê]nis/i, "Calçados"],
  [/farm[aá]c|drogar/i, "Farmácia"],
  [/escola|curso|idioma|ingl[eê]s|refor[cç]o/i, "Escola/Curso"],
];

export function sugerirNicho(nome: string): string | null {
  for (const [re, nicho] of NICHO_PISTAS) if (re.test(nome)) return nicho;
  return null;
}

export const ORIGENS = ["Prospecção presencial", "Indicação", "Instagram", "Tráfego pago", "Google", "WhatsApp", "Evento", "Outro"];

/** Resultado da abordagem (estilo apps de venda porta a porta) — já arruma o lead sozinho */
export const RESULTADOS: {
  id: string;
  label: string;
  emoji: string;
  temperatura: number;
  estagio: Estagio;
  followupDias: number | null;
  passo: string;
}[] = [
  { id: "nao_estava", label: "Dono não estava", emoji: "🚪", temperatura: 35, estagio: "revisita", followupDias: 1, passo: "Voltar e falar com o dono" },
  { id: "voltar", label: "Pediu pra voltar", emoji: "🔁", temperatura: 50, estagio: "revisita", followupDias: 3, passo: "Revisitar no horário combinado" },
  { id: "interessado", label: "Interessado", emoji: "👀", temperatura: 70, estagio: "apresentacao", followupDias: 1, passo: "Mandar demo / exemplos" },
  { id: "proposta", label: "Quer proposta", emoji: "📄", temperatura: 85, estagio: "proposta", followupDias: 1, passo: "Enviar proposta" },
  { id: "fechou", label: "Fechou na hora", emoji: "🎉", temperatura: 100, estagio: "fechado", followupDias: null, passo: "" },
  { id: "sem_interesse", label: "Sem interesse", emoji: "✋", temperatura: 10, estagio: "contato", followupDias: 30, passo: "Tentar de novo em 30 dias" },
];

export const TIPOS_ATIVIDADE: { id: TipoAtividade; label: string; emoji: string }[] = [
  { id: "nota", label: "Nota", emoji: "📝" },
  { id: "visita", label: "Visita", emoji: "📍" },
  { id: "ligacao", label: "Ligação", emoji: "📞" },
  { id: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { id: "reuniao", label: "Reunião", emoji: "🤝" },
  { id: "email", label: "E-mail", emoji: "✉️" },
  { id: "sistema", label: "Sistema", emoji: "⚙️" },
  { id: "ia", label: "IA", emoji: "✨" },
];
export const ATIVIDADE_EMOJI = Object.fromEntries(TIPOS_ATIVIDADE.map((t) => [t.id, t.emoji])) as Record<TipoAtividade, string>;

export const MOTIVOS_PERDA = ["Preço", "Já tem fornecedor", "Sem tempo agora", "Não vê valor", "Sumiu / não responde", "Fechou com concorrente", "Outro"];

export const DIAS_ESFRIANDO = 5;
export const SLA_PRODUCAO_DIAS_UTEIS = 3;
