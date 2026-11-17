import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Clock, Plus, Search, SlidersHorizontal } from "lucide-react";
import LeadCard from "../components/LeadCard";
import MotivoPerda from "../components/MotivoPerda";
import { Segmentado, Vazio } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useAcoesLead } from "../context/useAcoesLead";
import { ESTAGIOS, ESTAGIOS_ABERTOS, NICHOS, PRODUCAO, SLA_PRODUCAO_DIAS_UTEIS } from "../lib/constants";
import type { Estagio, Lead, ProducaoStatus } from "../lib/types";
import { cls, diasUteisDesde, FAIXA_INFO, faixaTemp, fmtBRL, type Faixa } from "../lib/utils";

type Visao = "temperatura" | "funil" | "producao";

export default function Leads() {
  const { user } = useAuth();
  const { leads, membros, podeEditar, carregando } = useTeam();
  const { mover, moverProducao } = useAcoesLead();
  const [params, setParams] = useSearchParams();
  const visao = (params.get("v") as Visao) || "temperatura";
  const semPasso = params.get("filtro") === "sempasso";
  const [busca, setBusca] = useState("");
  const [dono, setDono] = useState("todos");
  const [nicho, setNicho] = useState("");
  const [faixa, setFaixa] = useState<Faixa>("quente");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [perdendo, setPerdendo] = useState<Lead | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (dono === "meus" && l.owner_id !== user?.id) return false;
      if (dono !== "todos" && dono !== "meus" && l.owner_id !== dono) return false;
      if (nicho && l.nicho !== nicho) return false;
      if (semPasso && (l.proximo_followup || !ESTAGIOS_ABERTOS.includes(l.estagio))) return false;
      if (q) {
        const alvoBusca = [l.nome_negocio, l.bairro, l.nicho, l.cidade, ...(l.tags ?? [])].join(" ").toLowerCase();
        if (!alvoBusca.includes(q)) return false;
      }
      return true;
    });
  }, [leads, busca, dono, nicho, semPasso, user?.id]);

  const abertos = filtrados.filter((l) => ESTAGIOS_ABERTOS.includes(l.estagio));
  const porFaixa = (f: Faixa) => abertos.filter((l) => faixaTemp(l.temperatura) === f).sort((a, b) => b.temperatura - a.temperatura);

  function soltarEstagio(e: React.DragEvent, estagio: Estagio) {
    e.preventDefault();
    setAlvo(null);
    const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/plain"));
    if (!lead || !podeEditar(lead)) return;
    if (estagio === "perdido") setPerdendo(lead);
    else mover(lead, estagio);
  }

  function soltarProducao(e: React.DragEvent, status: ProducaoStatus) {
    e.preventDefault();
    setAlvo(null);
    const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/plain"));
    if (lead && podeEditar(lead)) moverProducao(lead, status);
  }

  const filtrosAtivos = (dono !== "todos" ? 1 : 0) + (nicho ? 1 : 0);

  return (
    <div className="pt-4">
      <div className="mx-auto max-w-7xl space-y-3 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold">Leads</h1>
          <span className="text-sm text-mute">{filtrados.length} no filtro</span>
        </div>

        <Segmentado
          opcoes={[
            { id: "temperatura", label: "Termômetro" },
            { id: "funil", label: "Funil" },
            { id: "producao", label: "Produção" },
          ]}
          valor={visao}
          onChange={(v) => {
            params.set("v", v);
            setParams(params, { replace: true });
          }}
        />

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="campo py-2.5 pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar negócio, bairro, tag…" />
          </div>
          <button onClick={() => setFiltrosAbertos((v) => !v)} className={cls("btn-sec relative px-3", filtrosAtivos > 0 && "border-neon/60 text-neon")} aria-label="Filtros">
            <SlidersHorizontal size={18} />
            {filtrosAtivos > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-neon text-[10px] font-bold text-fundo">{filtrosAtivos}</span>}
          </button>
        </div>

        {filtrosAbertos && (
          <div className="grid grid-cols-2 gap-2">
            <select className="campo py-2.5" value={dono} onChange={(e) => setDono(e.target.value)} aria-label="De quem">
              <option value="todos">Toda a equipe</option>
              <option value="meus">Só os meus</option>
              {membros
                .filter((m) => m.user_id !== user?.id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    De {m.nome}
                  </option>
                ))}
            </select>
            <select className="campo py-2.5" value={nicho} onChange={(e) => setNicho(e.target.value)} aria-label="Nicho">
              <option value="">Todos os nichos</option>
              {NICHOS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {semPasso && (
          <div className="flex items-center justify-between rounded-xl border border-morno/40 bg-morno/10 px-3.5 py-2.5 text-sm text-morno">
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} /> Mostrando só leads sem próximo passo
            </span>
            <button
              className="font-semibold underline"
              onClick={() => {
                params.delete("filtro");
                setParams(params, { replace: true });
              }}
            >
              limpar
            </button>
          </div>
        )}
      </div>

      {!carregando && leads.length === 0 ? (
        <Vazio
          icone={<Plus size={24} />}
          titulo="Nenhum lead na equipe ainda"
          texto="Bateu numa porta? Registra aqui na hora — leva menos de 30 segundos."
          acao={
            <Link to="/leads/novo" className="btn-neon">
              <Plus size={18} /> Registrar primeiro lead
            </Link>
          }
        />
      ) : visao === "temperatura" ? (
        <div className="mx-auto mt-4 max-w-7xl px-4">
          <div className="sem-barra -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {(["quente", "morno", "frio"] as Faixa[]).map((f) => (
              <button
                key={f}
                onClick={() => setFaixa(f)}
                className={cls("chip shrink-0 px-4 py-2 text-sm font-semibold", faixa === f && "border-transparent text-fundo")}
                style={faixa === f ? { background: FAIXA_INFO[f].cor } : undefined}
              >
                {FAIXA_INFO[f].emoji} {FAIXA_INFO[f].label}s · {porFaixa(f).length}
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {(["quente", "morno", "frio"] as Faixa[]).map((f) => {
              const lista = porFaixa(f);
              return (
                <section key={f} className={cls(faixa !== f && "hidden lg:block")}>
                  <h2 className="mb-2.5 hidden items-center gap-2 text-sm font-bold lg:flex" style={{ color: FAIXA_INFO[f].cor }}>
                    {FAIXA_INFO[f].emoji} {FAIXA_INFO[f].label}s <span className="text-mute">· {lista.length}</span>
                    <span className="ml-auto text-xs font-semibold text-mute">{fmtBRL(lista.reduce((s, l) => s + Number(l.valor_estimado || 0), 0))}</span>
                  </h2>
                  <div className="space-y-2">
                    {lista.map((l) => (
                      <LeadCard key={l.id} lead={l} mostrarEstagio />
                    ))}
                    {!lista.length && <p className="cartao p-4 text-center text-sm text-dim">Nenhum lead {FAIXA_INFO[f].label.toLowerCase()} nesse filtro.</p>}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-dim">Fechados e perdidos ficam na visão Funil.</p>
        </div>
      ) : visao === "funil" ? (
        <div className="rolagem mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {ESTAGIOS.map((est) => {
            const lista = filtrados.filter((l) => l.estagio === est.id).sort((a, b) => b.temperatura - a.temperatura);
            return (
              <section
                key={est.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(est.id);
                }}
                onDragLeave={() => setAlvo((a) => (a === est.id ? null : a))}
                onDrop={(e) => soltarEstagio(e, est.id)}
                className={cls("flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border bg-s1/60 transition", alvo === est.id ? "border-neon/60 bg-neon/5" : "border-line")}
              >
                <header className="border-b border-line px-3.5 py-3" style={{ boxShadow: `inset 0 3px 0 ${est.cor}` }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold" style={{ color: est.cor }}>
                      {est.label}
                    </h2>
                    <span className="text-xs font-semibold text-mute">{lista.length}</span>
                  </div>
                  <p className="text-[11px] text-dim">{fmtBRL(lista.reduce((s, l) => s + Number(l.valor_estimado || 0), 0))}</p>
                </header>
                <div className="flex-1 space-y-2 p-2" style={{ minHeight: 120 }}>
                  {lista.map((l) => (
                    <LeadCard key={l.id} lead={l} arrastavel={podeEditar(l)} />
                  ))}
                  {!lista.length && <p className="px-2 py-6 text-center text-xs text-dim">{est.dica}</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rolagem mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {PRODUCAO.map((col) => {
            const lista = filtrados
              .filter((l) => l.estagio === "fechado" && (l.producao_status ?? "afazer") === col.id)
              .sort((a, b) => +new Date(a.fechado_em ?? 0) - +new Date(b.fechado_em ?? 0));
            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(col.id);
                }}
                onDragLeave={() => setAlvo((a) => (a === col.id ? null : a))}
                onDrop={(e) => soltarProducao(e, col.id)}
                className={cls("flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border bg-s1/60", alvo === col.id ? "border-neon/60" : "border-line")}
              >
                <header className="flex items-center justify-between border-b border-line px-3.5 py-3">
                  <h2 className="text-sm font-bold text-neon">{col.label}</h2>
                  <span className="text-xs font-semibold text-mute">{lista.length}</span>
                </header>
                <div className="space-y-2 p-2" style={{ minHeight: 120 }}>
                  {lista.map((l) => {
                    const dias = diasUteisDesde(l.fechado_em);
                    const estourou = col.id !== "entregue" && dias > SLA_PRODUCAO_DIAS_UTEIS;
                    return (
                      <Link
                        key={l.id}
                        to={`/leads/${l.id}`}
                        draggable={podeEditar(l)}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                        className={cls("cartao block p-3", estourou && "border-quente/60")}
                      >
                        <p className="truncate font-semibold">{l.nome_negocio}</p>
                        <p className="truncate text-xs text-mute">{l.produtos.join(", ") || "Sem produto"} · {fmtBRL(l.valor_estimado)}</p>
                        {col.id !== "entregue" && (
                          <p className={cls("mt-1.5 flex items-center gap-1 text-xs font-semibold", estourou ? "text-quente" : "text-mute")}>
                            {estourou ? <AlertTriangle size={12} /> : <Clock size={12} />}
                            {estourou ? `Prazo estourado (${dias} dias úteis)` : `${dias} de ${SLA_PRODUCAO_DIAS_UTEIS} dias úteis`}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                  {!lista.length && <p className="px-2 py-6 text-center text-xs text-dim">Vazio</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <MotivoPerda
        aberto={!!perdendo}
        onFechar={() => setPerdendo(null)}
        onConfirmar={(m) => {
          if (perdendo) mover(perdendo, "perdido", m);
          setPerdendo(null);
        }}
      />
    </div>
  );
}
