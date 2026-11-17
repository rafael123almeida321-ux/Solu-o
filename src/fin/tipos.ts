// Tipos do módulo pessoal (CLYENT Comando). Espelham as tabelas fin_* do banco.
// Dinheiro sempre em centavos inteiros. Datas de calendário em "AAAA-MM-DD" (data local).

export type Escopo = "pessoal" | "negocio";
export type DataISO = string; // "2026-11-17"

export interface Ajustes {
  user_id?: string;
  capacidade_semanal_horas: number | null;
  preferencias: { simulacao?: Record<string, number>; [k: string]: unknown };
  updated_at?: string;
}

export interface Conta {
  id: string;
  user_id?: string;
  nome: string;
  tipo: "conta" | "carteira" | "poupanca" | "cartao";
  escopo: Escopo;
  saldo_inicial_centavos: number;
  data_base: DataISO;
  arquivada: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Categoria {
  id: string;
  user_id?: string;
  nome: string;
  tipo: "entrada" | "saida";
  natureza: "operacional" | "pessoal" | "financiamento" | "divida";
  escopo: Escopo;
  arquivada: boolean;
  created_at?: string;
}

export type SituacaoFrente = "ativa" | "negociacao" | "pausada" | "arquivada";
export interface Frente {
  id: string;
  user_id?: string;
  nome: string;
  situacao: SituacaoFrente;
  objetivo: string;
  prioridade: number;
  proxima_oportunidade: string;
  indicador_nome: string;
  notas: string;
  created_at?: string;
  updated_at?: string;
}

export type TipoMeta = "reducao_divida" | "faturamento_mensal" | "lucro_mensal" | "reserva";
export interface Meta {
  id: string;
  user_id?: string;
  nome: string;
  tipo: TipoMeta;
  alvo_centavos: number | null;
  valor_inicial_centavos: number;
  data_base: DataISO;
  prazo: DataISO | null;
  escopo: Escopo | "ambos";
  regra: string;
  principal: boolean;
  status: "ativa" | "arquivada";
  versao: number;
  created_at?: string;
  updated_at?: string;
}

export interface HistoricoMeta {
  id: number;
  goal_id: string;
  user_id?: string;
  versao: number;
  dados: Meta;
  alterado_em: string;
}

export interface Marco {
  id: string;
  user_id?: string;
  goal_id: string;
  semana_inicio: DataISO;
  alvo_acumulado_centavos: number;
  nota: string;
}

export interface Divida {
  id: string;
  user_id?: string;
  credor: string;
  descricao: string;
  titular: string;
  saldo_informado_centavos: number;
  data_referencia: DataISO;
  vencimento: DataISO | null;
  em_atraso_desde: DataISO | null;
  juros_info: string;
  goal_id: string | null;
  status: "aberta" | "quitada" | "arquivada";
  notas: string;
  created_at?: string;
  updated_at?: string;
}

export interface Recorrencia {
  id: string;
  user_id?: string;
  descricao: string;
  tipo: "entrada" | "saida";
  valor_centavos: number;
  conta_id: string | null;
  categoria_id: string | null;
  frente_id: string | null;
  divida_id: string | null;
  frequencia: "semanal" | "mensal";
  inicio: DataISO;
  fim: DataISO | null;
  ativa: boolean;
  created_at?: string;
}

export type StatusLanc = "previsto" | "realizado" | "cancelado";
export interface Lancamento {
  id: string;
  user_id?: string;
  tipo: "entrada" | "saida" | "transferencia";
  status: StatusLanc;
  valor_centavos: number;
  descricao: string;
  conta_id: string | null;
  conta_destino_id: string | null;
  categoria_id: string | null;
  frente_id: string | null;
  divida_id: string | null;
  escopo: Escopo;
  data_competencia: DataISO | null;
  data_vencimento: DataISO | null;
  data_pagamento: DataISO | null;
  confirmacao: "confirmado" | "estimado" | "incerto";
  recorrencia_id: string | null;
  recorrencia_seq: number | null;
  chave_importacao: string | null;
  notas: string;
  created_at?: string;
  updated_at?: string;
}

export interface Tarefa {
  id: string;
  user_id?: string;
  titulo: string;
  frente_id: string | null;
  lead_id: string | null;
  proximo_passo: string;
  resultado_esperado: string;
  motivo: string;
  prazo: DataISO | null;
  tempo_min: number | null;
  esforco: number;
  potencial_caixa_centavos: number;
  compromisso: boolean;
  foco_em: DataISO | null;
  status: "aberta" | "feita" | "arquivada";
  concluida_em: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Revisao {
  id: string;
  user_id?: string;
  semana_inicio: DataISO;
  semana_fim: DataISO;
  snapshot: Record<string, unknown>;
  funcionou: string;
  obstaculos: string;
  mudancas: string;
  capacidade_horas: number | null;
  resultados_proxima: string[];
  corrige_id: string | null;
  created_at: string;
}

export type CategoriaBloco = "treino" | "venda" | "trabalho" | "estudo" | "refeicao" | "pessoal" | "casal" | "descanso";
export interface Bloco {
  id: string;
  user_id?: string;
  titulo: string;
  dias: number[];
  inicio: string; // "06:30:00"
  fim: string;
  categoria: CategoriaBloco;
  habito: string;
  detalhe: string;
  frente_id: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RegistroRotina {
  id: string;
  user_id?: string;
  data: DataISO;
  bloco_id: string | null;
  titulo: string;
  habito: string;
  status: "feito" | "parcial" | "pulado";
  nota: string;
  created_at?: string;
}

export interface MetaPessoal {
  id: string;
  user_id?: string;
  nome: string;
  area: "corpo" | "basquete" | "negocio" | "estudo" | "vida" | "outro";
  tipo: "numero" | "habito";
  metrica: string;
  unidade: string;
  valor_inicial: number | null;
  alvo: number | null;
  direcao: "subir" | "descer";
  habito: string;
  vezes_semana: number | null;
  data_inicio: DataISO;
  prazo: DataISO | null;
  status: "ativa" | "concluida" | "arquivada";
  notas: string;
  created_at?: string;
  updated_at?: string;
}

export interface Medida {
  id: string;
  user_id?: string;
  data: DataISO;
  metrica: string;
  valor: number;
  nota: string;
  created_at?: string;
}

export interface DadosFin {
  ajustes: Ajustes | null;
  contas: Conta[];
  categorias: Categoria[];
  frentes: Frente[];
  metas: Meta[];
  historicoMetas: HistoricoMeta[];
  marcos: Marco[];
  dividas: Divida[];
  recorrencias: Recorrencia[];
  lancamentos: Lancamento[];
  tarefas: Tarefa[];
  revisoes: Revisao[];
  blocos: Bloco[];
  registros: RegistroRotina[];
  metasPessoais: MetaPessoal[];
  medidas: Medida[];
}

export const DADOS_VAZIOS: DadosFin = {
  ajustes: null,
  contas: [],
  categorias: [],
  frentes: [],
  metas: [],
  historicoMetas: [],
  marcos: [],
  dividas: [],
  recorrencias: [],
  lancamentos: [],
  tarefas: [],
  revisoes: [],
  blocos: [],
  registros: [],
  metasPessoais: [],
  medidas: [],
};
