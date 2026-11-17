import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, KeyRound, Loader2, LogOut, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Campo, Sheet, Vazio } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import type { TeamListItem } from "../lib/types";
import { cls, erroMsg } from "../lib/utils";

export default function Equipes() {
  const { sair, nome } = useAuth();
  const { recarregarEquipes, trocarEquipe, minhasEquipes } = useTeam();
  const toast = useToast();
  const nav = useNavigate();
  const [lista, setLista] = useState<TeamListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [codigo, setCodigo] = useState(() => sessionStorage.getItem("clyent-convite") ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ nome: "", descricao: "", publica: true });

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("listar_equipes");
    if (error) toast(erroMsg(error), "erro");
    setLista((data ?? []) as TeamListItem[]);
    setCarregando(false);
  }, [toast]);

  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 15000); // detecta aprovação
    return () => window.clearInterval(t);
  }, [carregar]);

  // se o pedido foi aprovado enquanto esperava
  useEffect(() => {
    if (lista.some((t) => t.sou_membro && !minhasEquipes.some((m) => m.id === t.id))) recarregarEquipes();
  }, [lista, minhasEquipes, recarregarEquipes]);

  async function abrir(id: string) {
    await recarregarEquipes();
    trocarEquipe(id);
    nav("/");
  }

  async function entrarComCodigo() {
    if (!codigo.trim()) return;
    setOcupado("codigo");
    const { data, error } = await supabase.rpc("entrar_com_codigo", { p_codigo: codigo.trim() });
    setOcupado(null);
    if (error) return toast(erroMsg(error), "erro");
    sessionStorage.removeItem("clyent-convite");
    toast("Você entrou na equipe!");
    await abrir(data as string);
  }

  async function pedir(t: TeamListItem) {
    setOcupado(t.id);
    const { error } = await supabase.rpc("pedir_entrada", { p_team: t.id, p_mensagem: `Oi! Sou ${nome}.` });
    setOcupado(null);
    if (error) return toast(erroMsg(error), "erro");
    toast(`Pedido enviado pra ${t.nome}. Assim que aprovarem, ela aparece aqui.`);
    carregar();
  }

  async function criar() {
    if (nova.nome.trim().length < 2) return toast("Dê um nome pra equipe.", "erro");
    setOcupado("criar");
    const { data, error } = await supabase.rpc("criar_equipe", {
      p_nome: nova.nome.trim(),
      p_descricao: nova.descricao.trim(),
      p_publica: nova.publica,
    });
    setOcupado(null);
    if (error) return toast(erroMsg(error), "erro");
    setCriando(false);
    toast("Equipe criada! Chame o time pelo código de convite na aba Equipe.");
    await abrir(data as string);
  }

  const filtradas = lista.filter((t) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-16 pt-6">
      <div className="mb-6 flex items-center justify-between">
        {minhasEquipes.length ? (
          <Link to="/" className="btn-ghost -ml-3 px-3">
            <ArrowLeft size={18} /> Voltar
          </Link>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon font-display font-black text-fundo">C</div>
        )}
        <button onClick={sair} className="btn-ghost -mr-3 px-3 text-[13px]">
          <LogOut size={16} /> Sair
        </button>
      </div>

      <h1 className="text-[26px] font-bold leading-tight">{minhasEquipes.length ? "Equipes" : `Bem-vindo, ${nome.split(" ")[0] || "sócio"}!`}</h1>
      <p className="mt-1 text-mute">
        {minhasEquipes.length ? "Entre em outra equipe ou crie uma nova." : "Agora entre na sua equipe pra começar a registrar leads."}
      </p>

      <div className="cartao mt-6 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} className="text-neon" /> Tenho um código de convite
        </p>
        <div className="flex gap-2">
          <input
            className="campo font-display uppercase tracking-[0.3em]"
            value={codigo}
            maxLength={12}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="ABC123"
            aria-label="Código de convite"
          />
          <button className="btn-neon shrink-0" onClick={entrarComCodigo} disabled={!codigo.trim() || ocupado === "codigo"}>
            {ocupado === "codigo" ? <Loader2 size={16} className="animate-spin" /> : "Entrar"}
          </button>
        </div>
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="titulo-sec">Equipes abertas</h2>
        <button onClick={carregar} className="btn-ghost -mr-3 px-3 py-1 text-xs" aria-label="Atualizar lista">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
        <input className="campo pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar equipe (ex.: CLYENT)" />
      </div>

      {carregando ? (
        <p className="carregando py-8 text-center text-sm text-mute">Buscando equipes…</p>
      ) : filtradas.length === 0 ? (
        <Vazio icone={<Users size={24} />} titulo="Nenhuma equipe aberta encontrada" texto="Peça o código de convite pro dono da equipe ou crie a sua." />
      ) : (
        <div className="space-y-2.5">
          {filtradas.map((t) => (
            <div key={t.id} className={cls("cartao flex items-center gap-3 p-3.5", t.sou_membro && "border-neon/40")}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-s3 font-display text-lg font-black text-neon">
                {t.nome[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.nome}</p>
                <p className="truncate text-xs text-mute">
                  {t.membros} membro{t.membros === 1 ? "" : "s"} · dono: {t.dono_nome}
                  {t.descricao ? ` · ${t.descricao}` : ""}
                </p>
              </div>
              {t.sou_membro ? (
                <button className="btn-neon shrink-0 px-3 py-2" onClick={() => abrir(t.id)}>
                  Abrir
                </button>
              ) : t.pedido_status === "pendente" ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-morno">
                  <Clock size={14} /> Aguardando
                </span>
              ) : (
                <button className="btn-sec shrink-0 px-3 py-2" onClick={() => pedir(t)} disabled={ocupado === t.id}>
                  {ocupado === t.id ? <Loader2 size={16} className="animate-spin" /> : t.pedido_status === "recusado" ? "Pedir de novo" : "Pedir pra entrar"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button className="btn-sec mt-8 w-full" onClick={() => setCriando(true)}>
        <Plus size={18} /> Criar uma equipe
      </button>

      <Sheet aberto={criando} onFechar={() => setCriando(false)} titulo="Nova equipe">
        <div className="space-y-4">
          <Campo rotulo="Nome da equipe">
            <input className="campo" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: CLYENT" autoFocus />
          </Campo>
          <Campo rotulo="Descrição (opcional)">
            <input className="campo" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="Ex.: Agência de marketing — Zona Leste" />
          </Campo>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-s2 p-3.5">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#39FF14]" checked={nova.publica} onChange={(e) => setNova({ ...nova, publica: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold">Aparecer na lista de equipes</span>
              <span className="block text-xs text-mute">Qualquer pessoa pode pedir pra entrar — você aprova. Desmarcado: só entra quem tiver o código.</span>
            </span>
          </label>
          <button className="btn-neon w-full" onClick={criar} disabled={ocupado === "criar"}>
            {ocupado === "criar" && <Loader2 size={16} className="animate-spin" />} Criar equipe
          </button>
        </div>
      </Sheet>
    </div>
  );
}
