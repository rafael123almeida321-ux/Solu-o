export type Estagio = "novo" | "contato" | "revisita" | "apresentacao" | "proposta" | "fechado" | "perdido";
export type ProducaoStatus = "afazer" | "construcao" | "revisao" | "entregue";
export type Papel = "dono" | "admin" | "membro";
export type TipoAtividade = "nota" | "ligacao" | "whatsapp" | "visita" | "email" | "reuniao" | "sistema" | "ia";

export interface Produto {
  id: string;
  nome: string;
  valor: number;
}

export interface Team {
  id: string;
  nome: string;
  descricao: string;
  publica: boolean;
  owner_id: string;
  comissao_vendedor_pct: number;
  teto_anual: number | null;
  meta_mensal: number | null;
  dias_para_liberar: number;
  admin_ve_contatos: boolean;
  produtos: Produto[];
  created_at: string;
}

export interface TeamListItem {
  id: string;
  nome: string;
  descricao: string;
  publica: boolean;
  membros: number;
  sou_membro: boolean;
  meu_papel: Papel | null;
  pedido_status: "pendente" | "aprovado" | "recusado" | null;
  dono_nome: string;
}

export interface Member {
  user_id: string;
  papel: Papel;
  nome: string;
  created_at: string;
}

/** Parte pública do lead (a equipe toda vê) */
export interface Lead {
  id: string;
  team_id: string;
  owner_id: string;
  created_by: string;
  nome_negocio: string;
  nicho: string | null;
  descricao: string;
  bairro: string | null;
  cidade: string | null;
  lat_aprox: number | null;
  lng_aprox: number | null;
  origem: string | null;
  temperatura: number;
  estagio: Estagio;
  produtos: string[];
  valor_estimado: number;
  tags: string[];
  resultado_abordagem: string | null;
  proximo_followup: string | null;
  proximo_passo: string | null;
  ultimo_contato_em: string;
  contato_liberado: boolean;
  motivo_perda: string | null;
  fechado_em: string | null;
  producao_status: ProducaoStatus | null;
  created_at: string;
  updated_at: string;
}

/** Parte privada do lead */
export interface LeadContact {
  lead_id: string;
  responsavel: string | null;
  cargo: string | null;
  whatsapp: string | null;
  telefone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  linkedin: string | null;
  site: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  tipo: TipoAtividade;
  conteudo: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface TeamEvent {
  id: number;
  team_id: string;
  user_id: string | null;
  lead_id: string | null;
  tipo: string;
  texto: string;
  created_at: string;
}

export interface AccessRequest {
  id: string;
  lead_id: string;
  requester_id: string;
  mensagem: string | null;
  status: "pendente" | "aprovado" | "recusado";
  created_at: string;
}

export interface JoinRequest {
  team_id: string;
  user_id: string;
  mensagem: string | null;
  status: "pendente" | "aprovado" | "recusado";
  created_at: string;
  nome: string;
}

/** Formulário de lead (novo/editar) */
export interface LeadDraft {
  id?: string;
  nome_negocio: string;
  nicho: string;
  descricao: string;
  bairro: string;
  cidade: string;
  origem: string;
  temperatura: number;
  estagio: Estagio;
  produtos: string[];
  valor_estimado: number;
  tags: string[];
  resultado_abordagem: string;
  proximo_followup: string; // datetime-local
  proximo_passo: string;
  contato_liberado: boolean;
  foto: string;
  nota: string;
  contato: {
    responsavel: string;
    cargo: string;
    whatsapp: string;
    telefone: string;
    email: string;
    instagram: string;
    facebook: string;
    tiktok: string;
    linkedin: string;
    site: string;
    endereco: string;
    lat: number | null;
    lng: number | null;
  };
}
