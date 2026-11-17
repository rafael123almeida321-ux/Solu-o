// Carrega e grava os dados pessoais (tabelas fin_*). O RLS do banco garante que só vêm os do usuário logado.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { erroMsg } from "../lib/utils";
import { hojeSP } from "./datas";
import { DADOS_VAZIOS, type DadosFin } from "./tipos";

export type Tabela =
  | "fin_settings"
  | "fin_accounts"
  | "fin_categories"
  | "fin_frentes"
  | "fin_goals"
  | "fin_milestones"
  | "fin_debts"
  | "fin_recurrences"
  | "fin_entries"
  | "fin_tasks"
  | "fin_reviews"
  | "rot_blocos"
  | "rot_registros"
  | "pes_metas"
  | "pes_medidas"
  | "ia_mensagens";

interface Ctx {
  dados: DadosFin;
  carregando: boolean;
  erro: string | null;
  atualizadoEm: Date | null;
  hoje: string;
  recarregar: () => Promise<void>;
  /** insere (sem id) ou atualiza (com id). Devolve o registro salvo. */
  salvar: <T extends object>(tabela: Tabela, registro: T & { id?: string }) => Promise<T & { id: string }>;
  inserirVarios: (tabela: Tabela, registros: object[], ignorarDuplicados?: boolean) => Promise<number>;
  apagar: (tabela: Tabela, id: string) => Promise<void>;
  /** upsert por chave única (ex.: registro do bloco no dia, medida do dia) */
  registrar: (tabela: Tabela, registro: object, onConflict: string) => Promise<void>;
  ocultar: boolean;
  setOcultar: (v: boolean) => void;
  moduloInstalado: boolean;
  rotinaInstalada: boolean;
}

const C = createContext<Ctx | null>(null);
const CHAVE_OCULTAR = "clyent-ocultar-valores";

export function FinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dados, setDados] = useState<DadosFin>(DADOS_VAZIOS);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [moduloInstalado, setModuloInstalado] = useState(true);
  const [rotinaInstalada, setRotinaInstalada] = useState(true);
  const [hoje, setHoje] = useState(hojeSP());
  const [ocultar, setOcultarSt] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_OCULTAR) === "1";
    } catch {
      return false;
    }
  });

  const setOcultar = (v: boolean) => {
    setOcultarSt(v);
    try {
      localStorage.setItem(CHAVE_OCULTAR, v ? "1" : "0");
    } catch {
      /* ok */
    }
  };

  // vira o dia sozinho se o app ficar aberto
  useEffect(() => {
    const t = window.setInterval(() => setHoje(hojeSP()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const recarregar = useCallback(async () => {
    if (!user) return;
    setErro(null);
    const q = (t: string, ordem = "created_at") => supabase.from(t).select("*").order(ordem, { ascending: true });
    const res = await Promise.all([
      supabase.from("fin_settings").select("*").maybeSingle(),
      q("fin_accounts"),
      q("fin_categories"),
      q("fin_frentes"),
      q("fin_goals"),
      supabase.from("fin_goal_history").select("*").order("versao", { ascending: false }),
      supabase.from("fin_milestones").select("*").order("semana_inicio"),
      q("fin_debts"),
      q("fin_recurrences"),
      q("fin_entries"),
      q("fin_tasks"),
      q("fin_reviews"),
    ]);
    // rotina/metas pessoais (migração 002): se ainda não existir no banco, o resto do app segue funcionando
    const extra = await Promise.all([
      supabase.from("rot_blocos").select("*").order("inicio"),
      supabase.from("rot_registros").select("*").gte("data", new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)).order("data"),
      q("pes_metas"),
      supabase.from("pes_medidas").select("*").order("data"),
    ]);
    setRotinaInstalada(!extra.some((r) => r.error));
    const falha = res.find((r) => r.error);
    if (falha?.error) {
      const msg = falha.error.message || "";
      if (/does not exist|relation .* not found|schema cache/i.test(msg)) setModuloInstalado(false);
      setErro(erroMsg(falha.error));
      setCarregando(false);
      return;
    }
    setModuloInstalado(true);
    const [aj, contas, cats, frentes, metas, hist, marcos, dividas, recs, lancs, tarefas, revisoes] = res.map((r) => r.data);
    const [blocos, registros, metasP, medidas] = extra.map((r) => (r.error ? [] : r.data));
    setDados({
      ajustes: (aj as DadosFin["ajustes"]) ?? null,
      contas: (contas ?? []) as DadosFin["contas"],
      categorias: (cats ?? []) as DadosFin["categorias"],
      frentes: (frentes ?? []) as DadosFin["frentes"],
      metas: (metas ?? []) as DadosFin["metas"],
      historicoMetas: (hist ?? []) as DadosFin["historicoMetas"],
      marcos: (marcos ?? []) as DadosFin["marcos"],
      dividas: (dividas ?? []) as DadosFin["dividas"],
      recorrencias: (recs ?? []) as DadosFin["recorrencias"],
      lancamentos: ((lancs ?? []) as DadosFin["lancamentos"]).map((l) => ({ ...l, valor_centavos: Number(l.valor_centavos) })),
      tarefas: ((tarefas ?? []) as DadosFin["tarefas"]).map((t) => ({ ...t, potencial_caixa_centavos: Number(t.potencial_caixa_centavos) })),
      revisoes: (revisoes ?? []) as DadosFin["revisoes"],
      blocos: (blocos ?? []) as DadosFin["blocos"],
      registros: (registros ?? []) as DadosFin["registros"],
      metasPessoais: ((metasP ?? []) as DadosFin["metasPessoais"]).map((m) => ({
        ...m,
        valor_inicial: m.valor_inicial === null ? null : Number(m.valor_inicial),
        alvo: m.alvo === null ? null : Number(m.alvo),
      })),
      medidas: ((medidas ?? []) as DadosFin["medidas"]).map((m) => ({ ...m, valor: Number(m.valor) })),
    });
    setAtualizadoEm(new Date());
    setCarregando(false);
  }, [user]);

  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, [recarregar]);

  const salvar = useCallback(
    async <T extends object>(tabela: Tabela, registro: T & { id?: string }) => {
      const limpo = { ...registro } as Record<string, unknown>;
      delete limpo.user_id;
      delete limpo.created_at;
      delete limpo.updated_at;
      const { id, ...resto } = limpo;
      const req = id
        ? supabase.from(tabela).update(resto).eq(tabela === "fin_settings" ? "user_id" : "id", id).select().single()
        : supabase.from(tabela).insert(resto).select().single();
      const { data, error } = await req;
      if (error) throw error;
      await recarregar();
      return data as T & { id: string };
    },
    [recarregar],
  );

  const inserirVarios = useCallback(
    async (tabela: Tabela, registros: object[], ignorarDuplicados = false) => {
      if (!registros.length) return 0;
      const req = ignorarDuplicados
        ? supabase.from(tabela).upsert(registros, { onConflict: "recorrencia_id,recorrencia_seq", ignoreDuplicates: true }).select("id")
        : supabase.from(tabela).insert(registros).select("id");
      const { data, error } = await req;
      if (error) throw error;
      await recarregar();
      return data?.length ?? 0;
    },
    [recarregar],
  );

  const apagar = useCallback(
    async (tabela: Tabela, id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
      await recarregar();
    },
    [recarregar],
  );

  const registrar = useCallback(
    async (tabela: Tabela, registro: object, onConflict: string) => {
      const { error } = await supabase.from(tabela).upsert(registro, { onConflict });
      if (error) throw error;
      await recarregar();
    },
    [recarregar],
  );

  const valor = useMemo(
    () => ({ dados, carregando, erro, atualizadoEm, hoje, recarregar, salvar, inserirVarios, apagar, registrar, ocultar, setOcultar, moduloInstalado, rotinaInstalada }),
    [dados, carregando, erro, atualizadoEm, hoje, recarregar, salvar, inserirVarios, apagar, registrar, ocultar, moduloInstalado, rotinaInstalada],
  );
  return <C.Provider value={valor}>{children}</C.Provider>;
}

export function useFin() {
  const c = useContext(C);
  if (!c) throw new Error("useFin fora do FinProvider");
  return c;
}
