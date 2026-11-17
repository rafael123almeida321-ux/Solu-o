import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COLS_LEAD, supabase } from "../lib/supabase";
import type { AccessRequest, JoinRequest, Lead, Member, Papel, Team, TeamEvent, TeamListItem } from "../lib/types";
import { useAuth } from "./AuthContext";

const CHAVE_EQUIPE = "clyent-equipe-atual";

export interface TeamCtx {
  minhasEquipes: TeamListItem[];
  carregandoEquipes: boolean;
  recarregarEquipes: () => Promise<TeamListItem[]>;
  teamId: string | null;
  trocarEquipe: (id: string | null) => void;
  team: Team | null;
  meuPapel: Papel | null;
  isAdmin: boolean;
  membros: Member[];
  nomeDe: (id: string | null | undefined) => string;
  leads: Lead[];
  compartilhados: Set<string>;
  eventos: TeamEvent[];
  pedidosAcesso: AccessRequest[];
  meusPedidos: Record<string, AccessRequest["status"]>;
  pedidosEntrada: JoinRequest[];
  carregando: boolean;
  recarregar: () => Promise<void>;
  atualizarLeadLocal: (id: string, patch: Partial<Lead>) => void;
  podeVerContato: (l: Lead) => boolean;
  podeEditar: (l: Lead) => boolean;
}

export const TeamContext = createContext<TeamCtx | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [minhasEquipes, setMinhasEquipes] = useState<TeamListItem[]>([]);
  const [carregandoEquipes, setCarregandoEquipes] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_EQUIPE);
    } catch {
      return null;
    }
  });
  const [team, setTeam] = useState<Team | null>(null);
  const [membros, setMembros] = useState<Member[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [compartilhados, setCompartilhados] = useState<Set<string>>(new Set());
  const [eventos, setEventos] = useState<TeamEvent[]>([]);
  const [pedidos, setPedidos] = useState<AccessRequest[]>([]);
  const [pedidosEntrada, setPedidosEntrada] = useState<JoinRequest[]>([]);
  const [carregando, setCarregando] = useState(false);
  const teamIdRef = useRef(teamId);
  teamIdRef.current = teamId;

  const trocarEquipe = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(CHAVE_EQUIPE, id);
      else localStorage.removeItem(CHAVE_EQUIPE);
    } catch {
      /* ok */
    }
    setTeam(null);
    setLeads([]);
    setMembros([]);
    setEventos([]);
    setTeamId(id);
  }, []);

  const recarregarEquipes = useCallback(async () => {
    if (!uid) return [];
    setCarregandoEquipes(true);
    const { data, error } = await supabase.rpc("listar_equipes");
    setCarregandoEquipes(false);
    if (error) return [];
    const minhas = ((data ?? []) as TeamListItem[]).filter((t) => t.sou_membro);
    setMinhasEquipes(minhas);
    const atual = teamIdRef.current;
    if (!atual || !minhas.some((t) => t.id === atual)) trocarEquipe(minhas[0]?.id ?? null);
    return minhas;
  }, [uid, trocarEquipe]);

  useEffect(() => {
    if (uid) recarregarEquipes();
    else {
      setMinhasEquipes([]);
      setCarregandoEquipes(false);
    }
  }, [uid, recarregarEquipes]);

  const carregar = useCallback(
    async (tid: string) => {
      if (!uid) return;
      const [t, m, l, s, e, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", tid).maybeSingle(),
        supabase.from("team_members").select("user_id,papel,created_at,profiles(nome)").eq("team_id", tid),
        supabase.from("leads").select(COLS_LEAD).eq("team_id", tid).order("updated_at", { ascending: false }).limit(3000),
        supabase.from("lead_shares").select("lead_id").eq("user_id", uid),
        supabase.from("team_events").select("*").eq("team_id", tid).order("created_at", { ascending: false }).limit(40),
        supabase.from("lead_access_requests").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      if (teamIdRef.current !== tid) return; // trocou de equipe no meio
      if (!t.data) {
        // não é mais membro dessa equipe
        recarregarEquipes();
        return;
      }
      setTeam(t.data as Team);
      const ms = ((m.data ?? []) as unknown as { user_id: string; papel: Papel; created_at: string; profiles: { nome: string } | null }[]).map(
        (x) => ({ user_id: x.user_id, papel: x.papel, created_at: x.created_at, nome: x.profiles?.nome || "Sem nome" }),
      );
      setMembros(ms);
      setLeads((l.data ?? []) as unknown as Lead[]);
      setCompartilhados(new Set(((s.data ?? []) as { lead_id: string }[]).map((x) => x.lead_id)));
      setEventos((e.data ?? []) as TeamEvent[]);
      setPedidos((a.data ?? []) as AccessRequest[]);

      const papel = ms.find((x) => x.user_id === uid)?.papel;
      if (papel === "dono" || papel === "admin") {
        const j = await supabase
          .from("team_join_requests")
          .select("team_id,user_id,mensagem,status,created_at,profiles(nome)")
          .eq("team_id", tid)
          .eq("status", "pendente");
        setPedidosEntrada(
          ((j.data ?? []) as unknown as (Omit<JoinRequest, "nome"> & { profiles: { nome: string } | null })[]).map((x) => ({
            ...x,
            nome: x.profiles?.nome || "Alguém",
          })),
        );
      } else setPedidosEntrada([]);
    },
    [uid, recarregarEquipes],
  );

  const recarregar = useCallback(async () => {
    if (teamIdRef.current) await carregar(teamIdRef.current);
  }, [carregar]);

  useEffect(() => {
    if (!teamId || !uid) return;
    setCarregando(true);
    carregar(teamId).finally(() => setCarregando(false));
  }, [teamId, uid, carregar]);

  // tempo real: qualquer mudança da equipe recarrega (com folga pra agrupar)
  useEffect(() => {
    if (!teamId || !uid) return;
    let timer: number | undefined;
    const agendar = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => carregar(teamId), 700);
    };
    const ch = supabase
      .channel(`equipe-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `team_id=eq.${teamId}` }, agendar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_events", filter: `team_id=eq.${teamId}` }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_access_requests" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_join_requests", filter: `team_id=eq.${teamId}` }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members", filter: `team_id=eq.${teamId}` }, agendar)
      .subscribe();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") agendar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(ch);
    };
  }, [teamId, uid, carregar]);

  const meuPapel = membros.find((m) => m.user_id === uid)?.papel ?? null;
  const isAdmin = meuPapel === "dono" || meuPapel === "admin";

  const nomesMap = useMemo(() => new Map(membros.map((m) => [m.user_id, m.nome])), [membros]);
  const nomeDe = useCallback(
    (id: string | null | undefined) => (id ? (id === uid ? "Você" : nomesMap.get(id) || "Ex-membro") : "—"),
    [nomesMap, uid],
  );

  const podeVerContato = useCallback(
    (l: Lead) =>
      l.owner_id === uid || l.contato_liberado || compartilhados.has(l.id) || (isAdmin && !!team?.admin_ve_contatos),
    [uid, compartilhados, isAdmin, team?.admin_ve_contatos],
  );
  const podeEditar = useCallback((l: Lead) => l.owner_id === uid || isAdmin, [uid, isAdmin]);

  const atualizarLeadLocal = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const pedidosAcesso = useMemo(
    () => pedidos.filter((p) => p.status === "pendente" && p.requester_id !== uid && leadIds.has(p.lead_id)),
    [pedidos, uid, leadIds],
  );
  const meusPedidos = useMemo(() => {
    const r: Record<string, AccessRequest["status"]> = {};
    pedidos.filter((p) => p.requester_id === uid).forEach((p) => (r[p.lead_id] = p.status));
    return r;
  }, [pedidos, uid]);

  const value: TeamCtx = {
    minhasEquipes,
    carregandoEquipes,
    recarregarEquipes,
    teamId,
    trocarEquipe,
    team,
    meuPapel,
    isAdmin,
    membros,
    nomeDe,
    leads,
    compartilhados,
    eventos,
    pedidosAcesso,
    meusPedidos,
    pedidosEntrada,
    carregando,
    recarregar,
    atualizarLeadLocal,
    podeVerContato,
    podeEditar,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const c = useContext(TeamContext);
  if (!c) throw new Error("useTeam fora do TeamProvider");
  return c;
}
