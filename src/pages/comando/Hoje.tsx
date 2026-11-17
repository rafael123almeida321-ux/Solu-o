import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, CheckCircle2, ChevronRight, ListPlus, Pin, PinOff, RefreshCw } from "lucide-react";
import { Secao } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useToast } from "../../context/ToastContext";
import { ESTAGIOS_ABERTOS } from "../../lib/constants";
import { cls, erroMsg, saudacao, statusFollowup } from "../../lib/utils";
import { alertas, compromissosProximos, prioridadesDoDia, progressoMeta, saldoCaixa, saldoCartoes } from "../../fin/calc";
import { dataCurta, difDias } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { FormLancamento, FormLiquidar, FormTarefa } from "../../fin/formularios";
import type { Lancamento, Tarefa } from "../../fin/tipos";
import { Barra, BotaoOcultar, Cartao, Explica, Pill, Valor } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

export default function Hoje() {
  const { nome, user } = useAuth();
  const { leads } = useTeam();
  const { dados, hoje, atualizadoEm, salvar, recarregar, carregando, erro, moduloInstalado } = useFin();
  const toast = useToast();
  const [form, setForm] = useState<null | "entrada" | "saida" | "tarefa">(null);
  const [liquidar, setLiquidar] = useState<Lancamento | null>(null);
  const [editarTarefa, setEditarTarefa] = useState<Tarefa | null>(null);

  const meta = dados.metas.find((m) => m.principal && m.status === "ativa") ?? null;
  const prog = useMemo(() => (meta ? progressoMeta(meta, dados, hoje) : null), [meta, dados, hoje]);
  const temCaixa = dados.contas.some((c) => c.tipo !== "cartao");
  const caixa = useMemo(() => saldoCaixa(dados.contas, dados.lancamentos), [dados]);
  const cartoes = useMemo(() => saldoCartoes(dados.contas, dados.lancamentos), [dados]);
  const comp = useMemo(() => compromissosProximos(dados, hoje, 14), [dados, hoje]);
  const avisos = useMemo(() => alertas(dados, hoje), [dados, hoje]);
  const prios = useMemo(() => prioridadesDoDia(dados.tarefas, dados.frentes, hoje), [dados, hoje]);
  const followups = useMemo(
    () =>
      leads.filter((l) => l.owner_id === user?.id && ESTAGIOS_ABERTOS.includes(l.estagio) && ["atrasado", "hoje"].includes(statusFollowup(l.proximo_followup) ?? "")).length,
    [leads, user?.id],
  );
  const frentes = new Map(dados.frentes.map((f) => [f.id, f]));

  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;

  async function concluir(t: Tarefa) {
    try {
      await salvar("fin_tasks", { id: t.id, status: "feita", concluida_em: new Date().toISOString() });
      toast("Ação concluída. Se entrou dinheiro, registre a entrada.");
    } catch (e) {
      toast(erroMsg(e), "erro");
    }
  }
  async function fixar(t: Tarefa, sim: boolean) {
    try {
      await salvar("fin_tasks", { id: t.id, foco_em: sim ? hoje : null });
    } catch (e) {
      toast(erroMsg(e), "erro");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-mute">{dataCurta(hoje, true)}</p>
          <h1 className="text-xl font-bold">
            {saudacao()}, {nome.split(" ")[0] || "sócio"}
          </h1>
        </div>
        <BotaoOcultar />
      </div>

      {/* Meta */}
      {meta && prog ? (
        <Link to="/meta" className="block">
          <Cartao className="space-y-3 border-neon/30">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="titulo-sec">Meta principal</p>
                <p className="mt-0.5 font-semibold">{meta.nome}</p>
              </div>
              <ChevronRight size={18} className="mt-1 text-mute" />
            </div>
            <Barra pct={prog.pct} rotulo="Progresso da meta" />
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-mute">Feito</p>
                <Valor c={prog.realizado} compacto className="font-semibold" />
              </div>
              <div>
                <p className="text-xs text-mute">Falta</p>
                <Valor c={prog.restante} compacto className="font-semibold" />
              </div>
              <div>
                <p className="text-xs text-mute">Prazo</p>
                <p className="font-semibold">
                  {meta.prazo ? dataCurta(meta.prazo) : "—"}
                  {prog.diasRestantes !== null && <span className="text-xs font-normal text-mute"> · {prog.diasRestantes}d</span>}
                </p>
              </div>
            </div>
            {prog.necessarioPorSemana !== null && (
              <p className="text-[13px] text-mute">
                Precisa de <Valor c={prog.necessarioPorSemana} compacto className="font-semibold text-ink" />/semana.{" "}
                {prog.observado?.status === "ok" ? (
                  <>
                    Ritmo atual: <Valor c={prog.observado.porSemana ?? 0} compacto className="font-semibold text-ink" />/semana
                    {prog.suficiente === false && <span className="text-morno"> — abaixo do necessário</span>}
                  </>
                ) : (
                  <span>Ritmo observado: sem base suficiente ainda.</span>
                )}
              </p>
            )}
            {prog.status === "atingida" && <Pill tom="ok">Meta atingida</Pill>}
            {prog.status === "encerrada" && <Pill tom="alto">Prazo encerrado</Pill>}
            {prog.status === "sem_alvo" && <Pill tom="medio">Alvo não informado</Pill>}
          </Cartao>
        </Link>
      ) : (
        <Cartao className="text-sm">
          Nenhuma meta principal ainda.{" "}
          <Link to="/meta" className="font-semibold text-neon">
            Definir meta
          </Link>
        </Cartao>
      )}

      {/* Saldo e ações rápidas */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/caixa?aba=contas">
          <Cartao className="h-full">
            <p className="titulo-sec">Saldo em caixa</p>
            {temCaixa ? <Valor c={caixa} className={cls("mt-1 block text-lg font-bold", caixa < 0 && "text-quente")} /> : <p className="mt-1 text-sm text-morno">não informado</p>}
            {cartoes !== 0 && (
              <p className="mt-1 text-xs text-mute">
                Cartões: <Valor c={cartoes} />
              </p>
            )}
            <p className="mt-1 text-[11px] text-dim">Só dinheiro já recebido. Previsto não entra.</p>
          </Cartao>
        </Link>
        <div className="grid gap-2">
          <button onClick={() => setForm("entrada")} className="btn btn-sec justify-start">
            <ArrowDownLeft size={17} className="text-neon" /> Entrada
          </button>
          <button onClick={() => setForm("saida")} className="btn btn-sec justify-start">
            <ArrowUpRight size={17} className="text-quente" /> Saída
          </button>
          <button onClick={() => setForm("tarefa")} className="btn btn-sec justify-start">
            <ListPlus size={17} /> Ação
          </button>
        </div>
      </div>

      {/* Alertas */}
      {avisos.length > 0 && (
        <div className="space-y-2">
          {avisos.map((a, i) => (
            <Link
              key={i}
              to={a.link ?? "#"}
              className={cls(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13.5px]",
                a.nivel === "alto" && "border-quente/40 bg-quente/10 text-[#ffd2cc]",
                a.nivel === "medio" && "border-morno/40 bg-morno/10 text-morno",
                a.nivel === "info" && "border-line bg-s1 text-mute",
              )}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">{a.nivel === "alto" ? "Atenção alta: " : a.nivel === "medio" ? "Atenção: " : "Aviso: "}</span>
                {a.texto}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Prioridades */}
      <Secao
        titulo="3 prioridades de hoje"
        acao={
          <Link to="/frentes" className="text-[13px] font-semibold text-neon">
            Todas as ações
          </Link>
        }
      >
        {prios.length === 0 ? (
          <Cartao className="text-sm text-mute">
            Nenhuma ação aberta.{" "}
            <button onClick={() => setForm("tarefa")} className="font-semibold text-neon">
              Criar a primeira
            </button>
          </Cartao>
        ) : (
          <ol className="space-y-2">
            {prios.map(({ tarefa: t, pontuacao, fixada }, i) => {
              const f = t.frente_id ? frentes.get(t.frente_id) : null;
              const atraso = t.prazo ? difDias(hoje, t.prazo) : null;
              return (
                <li key={t.id} className="cartao p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-s3 text-xs font-bold text-neon">{i + 1}</span>
                    <button onClick={() => setEditarTarefa(t)} className="min-w-0 flex-1 text-left">
                      <p className="font-semibold leading-snug">{t.titulo}</p>
                      {t.proximo_passo && <p className="mt-0.5 text-[13px] text-mute">→ {t.proximo_passo}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {f && <Pill>{f.nome}</Pill>}
                        {t.prazo && <Pill tom={atraso !== null && atraso < 0 ? "alto" : atraso === 0 ? "medio" : "neutro"}>{atraso !== null && atraso < 0 ? "atrasada" : `até ${dataCurta(t.prazo)}`}</Pill>}
                        {t.tempo_min && <Pill>{t.tempo_min} min</Pill>}
                        {fixada && <Pill tom="ok">fixada</Pill>}
                      </div>
                      <p className="mt-1.5 text-[12px] text-dim">
                        {t.motivo ? `Por quê: ${t.motivo}` : `Por quê: ${pontuacao.partes.filter((p) => p.pontos > 0).map((p) => p.rotulo).join(", ")}`}
                      </p>
                      {t.resultado_esperado && <p className="text-[12px] text-dim">Resultado esperado: {t.resultado_esperado}</p>}
                    </button>
                    <div className="flex flex-col gap-1.5">
                      <button onClick={() => concluir(t)} className="rounded-lg border border-neon/40 p-2 text-neon hover:bg-neon/10" aria-label={`Concluir ${t.titulo}`}>
                        <Check size={16} />
                      </button>
                      <button onClick={() => fixar(t, !fixada)} className="rounded-lg border border-line p-2 text-mute hover:text-ink" aria-label={fixada ? "Desafixar" : "Fixar para hoje"}>
                        {fixada ? <PinOff size={16} /> : <Pin size={16} />}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {followups > 0 && (
          <Link to="/crm" className="mt-2 flex items-center justify-between rounded-xl border border-line bg-s1 px-3.5 py-2.5 text-[13.5px]">
            <span>
              <b>{followups}</b> follow-up(s) do CRM pra hoje
            </span>
            <ChevronRight size={16} className="text-mute" />
          </Link>
        )}
      </Secao>

      {/* Compromissos */}
      <Secao
        titulo="Compromissos (14 dias)"
        acao={
          <Link to="/caixa?aba=projecao" className="text-[13px] font-semibold text-neon">
            Projeção
          </Link>
        }
      >
        {comp.length === 0 ? (
          <Cartao className="text-sm text-mute">Nada previsto para os próximos 14 dias.</Cartao>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-s1">
            {comp.map((c) => (
              <li key={c.tipo + c.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="w-14 shrink-0 text-center">
                  <p className={cls("text-[13px] font-bold", c.atrasado && "text-quente")}>{c.data ? dataCurta(c.data) : "—"}</p>
                  {c.atrasado && <p className="text-[10px] font-semibold uppercase text-quente">atrasado</p>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{c.titulo}</p>
                  <Valor c={c.entrada ? c.valor : -c.valor} sinal className={cls("text-[13px] font-semibold", c.entrada ? "text-neon" : "text-ink")} />
                </div>
                {c.lancamento && (
                  <button onClick={() => setLiquidar(c.lancamento!)} className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-mute hover:text-ink">
                    <CheckCircle2 size={14} className="mr-1 inline" />
                    {c.entrada ? "Recebi" : "Paguei"}
                  </button>
                )}
                {c.divida && (
                  <Link to="/caixa?aba=dividas" className="rounded-lg border border-morno/40 px-2.5 py-1.5 text-[12px] font-semibold text-morno">
                    Prever
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <div className="flex items-center justify-between text-[12px] text-dim">
        <span>Dados atualizados {atualizadoEm ? `às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—"}</span>
        <button onClick={() => recarregar()} className="inline-flex items-center gap-1 hover:text-ink">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
      <div className="text-[12px] text-dim">
        <Explica>
          Saldo em caixa = saldo informado de cada conta (no início do dia da data-base) + lançamentos realizados desde então, sem contar cartões. Prioridades: primeiro as que
          você fixou para hoje; depois as de maior pontuação por prazo, compromisso, potencial de caixa, esforço e prioridade da frente. Concluir uma ação não registra dinheiro
          sozinho.
        </Explica>
      </div>

      <FormLancamento aberto={form === "entrada" || form === "saida"} onFechar={() => setForm(null)} inicial={{ tipo: form === "entrada" ? "entrada" : "saida" }} />
      <FormTarefa aberto={form === "tarefa" || !!editarTarefa} onFechar={() => (setForm(null), setEditarTarefa(null))} inicial={editarTarefa ?? undefined} />
      <FormLiquidar key={liquidar?.id} lanc={liquidar} onFechar={() => setLiquidar(null)} />
    </div>
  );
}
