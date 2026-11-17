import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, CloudOff, Grid2x2, List, ListPlus, Map, Plus, Sparkles, Sun, UserPlus, UsersRound } from "lucide-react";
import { FormLancamento, FormTarefa } from "../fin/formularios";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { enviarFila, fila } from "../lib/outbox";
import { cls } from "../lib/utils";
import { Avatar, Contador, Sheet } from "./ui";

export default function Layout() {
  const { team, minhasEquipes, teamId, trocarEquipe, recarregar, pedidosAcesso, pedidosEntrada } = useTeam();
  const { nome, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const local = useLocation();
  const [trocador, setTrocador] = useState(false);
  const [rapido, setRapido] = useState(false);
  const [form, setForm] = useState<null | "entrada" | "saida" | "tarefa">(null);
  const [naFila, setNaFila] = useState(() => fila.listar().length);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const atualizar = () => setNaFila(fila.listar().length);
    const subir = async () => {
      setOnline(navigator.onLine);
      const n = await enviarFila();
      if (n) {
        toast(`${n} lead${n > 1 ? "s" : ""} sincronizado${n > 1 ? "s" : ""}`);
        recarregar();
      }
    };
    const caiu = () => setOnline(false);
    window.addEventListener("fila-mudou", atualizar);
    window.addEventListener("online", subir);
    window.addEventListener("offline", caiu);
    subir();
    return () => {
      window.removeEventListener("fila-mudou", atualizar);
      window.removeEventListener("online", subir);
      window.removeEventListener("offline", caiu);
    };
  }, [toast, recarregar]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [local.pathname]);

  const avisos = pedidosAcesso.length + pedidosEntrada.length;

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-[900] border-b border-line/70 bg-fundo/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neon font-display text-sm font-black text-fundo" aria-label="Início">
            C
          </Link>
          <button onClick={() => setTrocador(true)} className="flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-1 text-left">
            <span className="min-w-0">
              <span className="block font-display text-[9px] font-extrabold tracking-[0.22em] text-mute">CLYENT COMANDO</span>
              <span className="block truncate text-[15px] font-bold leading-tight">{team?.nome ?? "…"}</span>
            </span>
            <ChevronDown size={16} className="shrink-0 text-mute" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/agente"
              className={cls(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition",
                local.pathname === "/agente" ? "border-neon bg-neon text-fundo" : "border-neon/50 text-neon hover:bg-neon/10",
              )}
            >
              <Sparkles size={15} /> Agente
            </Link>
            <Link to="/equipe?aba=conta" aria-label="Minha conta">
              <Avatar id={user?.id ?? "x"} nome={nome || "?"} tamanho={32} />
            </Link>
          </div>
        </div>
        {(!online || naFila > 0) && (
          <div className="flex items-center justify-center gap-2 border-t border-line/70 bg-morno/10 px-4 py-1.5 text-[12.5px] text-morno">
            <CloudOff size={14} />
            {!online ? "Sem internet — dá pra cadastrar leads, eles sobem quando o sinal voltar." : null}
            {online && naFila > 0 ? `${naFila} lead(s) aguardando envio…` : null}
            {!online && naFila > 0 ? ` (${naFila} na fila)` : null}
          </div>
        )}
      </header>

      <main className="pb-nav">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-[900] border-t border-line bg-s1/95 backdrop-blur-md" aria-label="Navegação">
        <div className="pb-safe mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
          <ItemNav to="/" icone={<Sun size={22} />} rotulo="Hoje" fim />
          <ItemNav to="/leads" icone={<List size={22} />} rotulo="Leads" />
          <div className="flex justify-center">
            <button
              onClick={() => setRapido(true)}
              className="-mt-6 flex h-[58px] w-[58px] items-center justify-center rounded-2xl bg-neon text-fundo shadow-neon transition active:scale-95"
              aria-label="Registrar: lead, entrada, saída ou ação"
            >
              <Plus size={30} strokeWidth={2.6} />
            </button>
          </div>
          <ItemNav to="/mapa" icone={<Map size={22} />} rotulo="Mapa" />
          <ItemNav to="/mais" icone={<Grid2x2 size={22} />} rotulo="Mais" extra={<Contador n={avisos} />} />
        </div>
      </nav>

      <Sheet aberto={rapido} onFechar={() => setRapido(false)} titulo="Registrar">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { t: "Novo lead", i: <UserPlus size={20} />, f: () => nav("/leads/novo") },
            { t: "Ação / tarefa", i: <ListPlus size={20} />, f: () => setForm("tarefa") },
            { t: "Entrada", i: <ArrowDownLeft size={20} className="text-neon" />, f: () => setForm("entrada") },
            { t: "Saída", i: <ArrowUpRight size={20} className="text-quente" />, f: () => setForm("saida") },
          ].map((o) => (
            <button
              key={o.t}
              onClick={() => {
                setRapido(false);
                o.f();
              }}
              className="cartao flex flex-col items-start gap-2 p-4 text-left font-semibold"
            >
              {o.i}
              {o.t}
            </button>
          ))}
        </div>
      </Sheet>
      <FormLancamento aberto={form === "entrada" || form === "saida"} onFechar={() => setForm(null)} inicial={{ tipo: form === "entrada" ? "entrada" : "saida" }} />
      <FormTarefa aberto={form === "tarefa"} onFechar={() => setForm(null)} />

      <Sheet aberto={trocador} onFechar={() => setTrocador(false)} titulo="Suas equipes">
        <div className="space-y-2">
          {minhasEquipes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                trocarEquipe(t.id);
                setTrocador(false);
                nav("/");
              }}
              className={cls("cartao flex w-full items-center gap-3 p-3.5 text-left", t.id === teamId && "border-neon/50")}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s3 font-display font-black text-neon">
                {t.nome[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.nome}</span>
                <span className="block text-xs text-mute">
                  {t.membros} membro{t.membros === 1 ? "" : "s"} · {t.meu_papel}
                </span>
              </span>
              {t.id === teamId && <Check size={18} className="text-neon" />}
            </button>
          ))}
          <button
            onClick={() => {
              setTrocador(false);
              nav("/equipes");
            }}
            className="btn-sec w-full"
          >
            <UsersRound size={16} /> Entrar ou criar outra equipe
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function ItemNav({ to, icone, rotulo, extra, fim }: { to: string; icone: React.ReactNode; rotulo: string; extra?: React.ReactNode; fim?: boolean }) {
  return (
    <NavLink
      to={to}
      end={fim}
      className={({ isActive }) =>
        cls("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition", isActive ? "text-neon" : "text-mute hover:text-ink")
      }
    >
      <span className="relative">
        {icone}
        {extra && <span className="absolute -right-3 -top-2">{extra}</span>}
      </span>
      {rotulo}
    </NavLink>
  );
}
