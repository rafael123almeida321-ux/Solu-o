import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigurado = Boolean(url && key);

export const supabase = createClient(url || "https://nao-configurado.supabase.co", key || "nao-configurado", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** colunas públicas do lead (sem a foto, que é pesada) */
export const COLS_LEAD =
  "id,team_id,owner_id,created_by,nome_negocio,nicho,descricao,bairro,cidade,lat_aprox,lng_aprox,origem,temperatura,estagio,produtos,valor_estimado,tags,resultado_abordagem,proximo_followup,proximo_passo,ultimo_contato_em,contato_liberado,motivo_perda,fechado_em,producao_status,created_at,updated_at";
