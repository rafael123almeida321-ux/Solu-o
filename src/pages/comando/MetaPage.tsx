import { useMemo, useState } from "react";
import { History, Pencil, Plus, Target } from "lucide-react";
import { Secao, Vazio } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { NOME_TIPO_META, marcosSemanais, progressoMeta, resumoFrente, type ProgressoMeta } from "../../fin/calc";
import { brl } from "../../fin/dinheiro";
import { dataCurta, difDias, fimSemana, inicioSemana } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { FormMeta } from "../../fin/formularios";
import type { Meta } from "../../fin/tipos";
import { Barra, BotaoOcultar, CampoDinheiro, Cartao, Explica, Pill, Valor } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

const STATUS_TXT: Record<ProgressoMeta["status"], { t: string; tom: "ok" | "alto" | "medio" | "neutro" | "info" }> = {
  atingida: { t: "Atingida", tom: "ok" },
  encerrada: { t: "Prazo encerrado sem atingir", tom: "alto" },
  prazo_invalido: { t: "Prazo antes da data-base", tom: "alto" },
  sem_alvo: { t: "Alvo não informado", tom: "medio" },
  sem_prazo: { t: "Sem prazo", tom: "medio" },
  em_andamento: { t: "Em andamento", tom: "info" },
};

export default function MetaPage() {
  const { dados, hoje, carregando, erro, moduloInstalado } = useFin();
  const [editar, setEditar] = useState<Partial<Meta> | null>(null);
  const [verHist, setVerHist] = useState(false);
  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;

  const ativas = dados.metas.filter((m) => m.status === "ativa").sort((a, b) => Number(b.principal) - Number(a.principal));
  const principal = ativas.find((m) => m.principal) ?? ativas[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meta e plano</h1>
        <BotaoOcultar />
      </div>
      {!principal ? (
        <Vazio
          icone={<Target size={22} />}
          titulo="Nenhuma meta"
          texto="Defina uma meta com nome, tipo, alvo e prazo."
          acao={
            <button className="btn btn-neon" onClick={() => setEditar({})}>
              Criar meta
            </button>
          }
        />
      ) : (
        <>
          <DetalheMeta meta={principal} onEditar={() => setEditar(principal)} />
          <PlanoSemana />
          <Simulacao meta={principal} />
          {ativas.length > 1 && (
            <Secao titulo="Outras metas">
              <ul className="space-y-2">
                {ativas
                  .filter((m) => m.id !== principal.id)
                  .map((m) => {
                    const p = progressoMeta(m, dados, hoje);
                    return (
                      <li key={m.id}>
                        <button onClick={() => setEditar(m)} className="cartao w-full p-3.5 text-left">
                          <div className="flex justify-between">
                            <span className="font-semibold">{m.nome}</span>
                            <span className="text-sm">
                              <Valor c={p.realizado} compacto /> / <Valor c={p.alvo} compacto />
                            </span>
                          </div>
                          <div className="mt-2">
                            <Barra pct={p.pct} rotulo={`Progresso ${m.nome}`} cor="bg-frio" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </Secao>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sec" onClick={() => setEditar({ principal: false })}>
              <Plus size={16} /> Meta secundária
            </button>
            <button className="btn btn-ghost" onClick={() => setVerHist(!verHist)}>
              <History size={16} /> Versões anteriores
            </button>
          </div>
          {verHist && <Historico />}
        </>
      )}
      <FormMeta key={editar?.id ?? "nova"} aberto={!!editar} onFechar={() => setEditar(null)} inicial={editar ?? undefined} />
    </div>
  );
}

function DetalheMeta({ meta, onEditar }: { meta: Meta; onEditar: () => void }) {
  const { dados, hoje } = useFin();
  const p = useMemo(() => progressoMeta(meta, dados, hoje), [meta, dados, hoje]);
  const marcos = useMemo(() => marcosSemanais(meta, dados, hoje), [meta, dados, hoje]);
  const st = STATUS_TXT[p.status];
  return (
    <>
      <Cartao className="space-y-3 border-neon/30">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="titulo-sec">{meta.principal ? "Meta principal" : "Meta"} · versão {meta.versao}</p>
            <h2 className="mt-0.5 text-lg font-bold">{meta.nome}</h2>
            <p className="text-[13px] text-mute">
              {NOME_TIPO_META[meta.tipo]} · {meta.escopo} · início {dataCurta(meta.data_base)} · prazo {meta.prazo ? dataCurta(meta.prazo) : "—"}
            </p>
          </div>
          <button onClick={onEditar} className="rounded-lg border border-line p-2 text-mute hover:text-ink" aria-label="Editar meta">
            <Pencil size={16} />
          </button>
        </div>
        <Pill tom={st.tom}>{st.t}</Pill>
        <Barra pct={p.pct} rotulo="Progresso da meta" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num rot="Realizado" c={p.realizado} />
          <Num rot={p.alvoOrigem === "dividas" ? "Alvo (soma das dívidas)" : "Alvo"} c={p.alvo} />
          <Num rot="Falta" c={p.restante} />
          <div>
            <p className="text-[11px] text-mute">{p.acumulativa ? "Dias restantes" : "Período"}</p>
            <p className="font-semibold">{p.acumulativa ? (p.diasRestantes ?? "—") : `${dataCurta(p.periodo.inicio)}–${dataCurta(p.periodo.fim)}`}</p>
          </div>
        </div>
        {p.acumulativa && p.necessarioPorDia !== null && (
          <div className="grid gap-2 rounded-xl border border-line bg-s2 p-3 text-[13.5px] sm:grid-cols-2">
            <div>
              <p className="text-[11px] text-mute">Ritmo necessário</p>
              <p>
                <Valor c={p.necessarioPorSemana} compacto className="font-semibold" />
                /semana (<Valor c={p.necessarioPorDia} compacto />
                /dia)
              </p>
              <p className="text-[11px] text-dim">Falta ÷ dias de hoje até o prazo (contando os dois).</p>
            </div>
            <div>
              <p className="text-[11px] text-mute">Ritmo observado</p>
              {p.observado?.status === "ok" ? (
                <>
                  <p>
                    <Valor c={p.observado.porSemana ?? 0} compacto className={cls("font-semibold", p.suficiente === false && "text-morno")} />
                    /semana
                  </p>
                  <p className="text-[11px] text-dim">
                    {dataCurta(p.observado.janelaInicio)}–{dataCurta(p.observado.janelaFim)} · {p.observado.semanasCompletas} semana(s) completas de dados
                  </p>
                  {p.suficiente === false && <p className="text-[12px] text-morno">Nesse ritmo não fecha no prazo. É projeção, não promessa.</p>}
                  {p.suficiente === true && <p className="text-[12px] text-neon">Nesse ritmo fecha no prazo.</p>}
                </>
              ) : (
                <p className="text-[12.5px] text-mute">{p.observado?.explicacao}</p>
              )}
            </div>
          </div>
        )}
        {p.avisos.map((a) => (
          <p key={a} className="text-[12.5px] text-morno">
            {a}
          </p>
        ))}
        <Explica>
          <b>O que entra na conta:</b> {p.regra}
        </Explica>
        {meta.tipo === "reducao_divida" && (
          <div className="text-[13px] text-mute">
            Dívidas ligadas:{" "}
            {dados.dividas.filter((d) => d.goal_id === meta.id).map((d) => d.credor + (d.titular ? ` (${d.titular})` : "")).join(", ") || "nenhuma"}
          </div>
        )}
      </Cartao>

      {marcos.length > 0 && (
        <Secao titulo="Marcos semanais — planejado x realizado">
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="bg-s2 text-left text-[11px] uppercase tracking-wide text-mute">
                <tr>
                  <th className="px-3 py-2">Semana</th>
                  <th className="px-3 py-2 text-right">Planejado (acum.)</th>
                  <th className="px-3 py-2 text-right">Realizado (acum.)</th>
                  <th className="px-3 py-2 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-s1">
                {marcos.map((m) => {
                  const atual = m.semanaInicio === inicioSemana(hoje);
                  return (
                    <tr key={m.semanaInicio} className={cls(atual && "bg-neon/5")}>
                      <td className="px-3 py-2">
                        {dataCurta(m.semanaInicio)}–{dataCurta(m.semanaFim)}
                        {atual && <span className="ml-1 text-[11px] text-neon">agora</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Valor c={m.planejado} compacto />
                      </td>
                      <td className="px-3 py-2 text-right">{m.realizado === null ? <span className="text-dim">—</span> : <Valor c={m.realizado} compacto />}</td>
                      <td className={cls("px-3 py-2 text-right", m.diferenca !== null && m.diferenca < 0 && "text-quente", m.diferenca !== null && m.diferenca >= 0 && "text-neon")}>
                        {m.diferenca === null ? "—" : (
                          <>
                            <Valor c={m.diferenca} compacto sinal />
                            {m.pct !== null && <span className="text-[11px] text-mute"> ({m.pct}%)</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[12px] text-dim">
            Planejado: {marcos[0].origem === "vencimentos" ? "soma das dívidas que vencem (ou já venceram) até o fim de cada semana" : marcos[0].origem === "linear" ? "alvo dividido igualmente pelas semanas" : "definido por você"}.
          </p>
        </Secao>
      )}
    </>
  );
}

function Num({ rot, c }: { rot: string; c: number | null }) {
  return (
    <div>
      <p className="text-[11px] text-mute">{rot}</p>
      <Valor c={c} compacto className="font-semibold" />
    </div>
  );
}

/** plano da semana: tempo das ações abertas com prazo até domingo x capacidade informada */
function PlanoSemana() {
  const { dados, hoje, salvar } = useFin();
  const toast = useToast();
  const fim = fimSemana(hoje);
  const daSemana = dados.tarefas.filter((t) => t.status === "aberta" && t.prazo && t.prazo <= fim);
  const minutos = daSemana.reduce((s, t) => s + (t.tempo_min ?? 0), 0);
  const semTempo = daSemana.filter((t) => !t.tempo_min).length;
  const cap = dados.ajustes?.capacidade_semanal_horas ?? null;
  const [capTxt, setCapTxt] = useState(cap?.toString() ?? "");
  const diasRest = difDias(hoje, fim) + 1;
  return (
    <Secao titulo={`Plano da semana (até ${dataCurta(fim)})`}>
      <Cartao className="space-y-2 text-[13.5px]">
        <p>
          <b>{daSemana.length}</b> ação(ões) com prazo nesta semana · <b>{Math.round((minutos / 60) * 10) / 10} h</b> estimadas
          {semTempo > 0 && <span className="text-mute"> ({semTempo} sem tempo estimado)</span>}
        </p>
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="rotulo">Horas disponíveis por semana</span>
            <input className="campo" inputMode="numeric" value={capTxt} onChange={(e) => setCapTxt(e.target.value.replace(/\D/g, ""))} placeholder="não informado" />
          </label>
          <button
            className="btn btn-sec"
            onClick={async () => {
              try {
                const v = capTxt ? Math.min(120, Number(capTxt)) : null;
                await salvar("fin_settings", dados.ajustes ? { id: dados.ajustes.user_id, capacidade_semanal_horas: v } : { capacidade_semanal_horas: v, preferencias: {} });
                toast("Capacidade salva");
              } catch (e) {
                toast(erroMsg(e), "erro");
              }
            }}
          >
            Salvar
          </button>
        </div>
        {cap !== null && minutos / 60 > (cap * diasRest) / 7 && (
          <p className="text-morno">O que está planejado passa do tempo que sobra na semana. Escolha o que adiar.</p>
        )}
        {daSemana.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-mute">
            {daSemana.slice(0, 8).map((t) => (
              <li key={t.id}>
                {t.titulo} · {dataCurta(t.prazo)}
                {t.tempo_min ? ` · ${t.tempo_min} min` : ""}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </Secao>
  );
}

/** simulação: premissas editáveis por frente, separada dos registros reais */
function Simulacao({ meta }: { meta: Meta }) {
  const { dados, hoje, salvar } = useFin();
  const toast = useToast();
  const p = progressoMeta(meta, dados, hoje);
  const frentes = dados.frentes.filter((f) => f.situacao === "ativa" || f.situacao === "negociacao");
  const salvo = (dados.ajustes?.preferencias?.simulacao ?? {}) as Record<string, number>;
  const [prem, setPrem] = useState<Record<string, number>>(salvo);
  if (!p.acumulativa || p.diasRestantes === null || p.restante === null) return null;
  const semanas = p.diasRestantes / 7;
  const porSemana = Object.values(prem).reduce((s, v) => s + (v || 0), 0);
  const projetado = Math.round(porSemana * semanas);
  return (
    <Secao titulo="Simulação (não é registro real)">
      <Cartao className="space-y-3 text-[13.5px]">
        <p className="text-mute">
          Quanto cada frente pode <b>sobrar por semana</b> para a meta? Isso só simula — não entra no caixa nem no progresso.
        </p>
        {frentes.length === 0 && <p className="text-dim">Cadastre frentes de renda para simular.</p>}
        {frentes.map((f) => {
          const r = resumoFrente(f, dados);
          return (
            <div key={f.id} className="grid grid-cols-[1fr_140px] items-center gap-2">
              <span>
                {f.nome}
                <span className="block text-[11px] text-dim">recebido até hoje: {brl(r.recebido, true)}</span>
              </span>
              <CampoDinheiro valor={prem[f.id] ?? null} onChange={(c) => setPrem((x) => ({ ...x, [f.id]: c ?? 0 }))} />
            </div>
          );
        })}
        <div className="rounded-xl border border-line bg-s2 p-3">
          <p>
            Com <Valor c={porSemana} compacto className="font-semibold" />
            /semana por {Math.round(semanas * 10) / 10} semanas: <Valor c={projetado} compacto className="font-semibold" />
          </p>
          <p className={cls("mt-0.5", projetado >= p.restante ? "text-neon" : "text-morno")}>
            {projetado >= p.restante ? "Cobre o que falta." : (
              <>
                Faltariam <Valor c={p.restante - projetado} compacto />.
              </>
            )}
          </p>
        </div>
        <button
          className="btn btn-sec"
          onClick={async () => {
            try {
              const preferencias = { ...(dados.ajustes?.preferencias ?? {}), simulacao: prem };
              await salvar("fin_settings", dados.ajustes ? { id: dados.ajustes.user_id, preferencias } : { preferencias, capacidade_semanal_horas: null });
              toast("Premissas salvas");
            } catch (e) {
              toast(erroMsg(e), "erro");
            }
          }}
        >
          Guardar premissas
        </button>
      </Cartao>
    </Secao>
  );
}

function Historico() {
  const { dados } = useFin();
  if (!dados.historicoMetas.length) return <p className="text-sm text-mute">Nenhuma alteração registrada ainda.</p>;
  return (
    <ul className="space-y-1.5 text-[13px]">
      {dados.historicoMetas.map((h) => (
        <li key={h.id} className="rounded-xl border border-line px-3.5 py-2.5">
          <span className="font-semibold">
            {h.dados.nome} · v{h.versao}
          </span>{" "}
          <span className="text-mute">
            (até {new Date(h.alterado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}) · alvo {h.dados.alvo_centavos ? brl(h.dados.alvo_centavos) : "—"} · prazo{" "}
            {dataCurta(h.dados.prazo)}
          </span>
        </li>
      ))}
    </ul>
  );
}
