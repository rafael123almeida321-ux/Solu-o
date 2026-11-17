import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Check, ChevronRight, Plus, RotateCcw, Rocket } from "lucide-react";
import { Secao, Segmentado, Vazio } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { pontuarTarefa, resumoFrente } from "../../fin/calc";
import { dataCurta, difDias, inicioMes } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { FormFrente, FormTarefa } from "../../fin/formularios";
import type { Frente, Tarefa } from "../../fin/tipos";
import { BotaoOcultar, Explica, Pill, Valor } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

const SIT: Record<Frente["situacao"], { t: string; tom: "ok" | "info" | "medio" | "neutro" }> = {
  ativa: { t: "ativa", tom: "ok" },
  negociacao: { t: "em negociação", tom: "info" },
  pausada: { t: "pausada", tom: "medio" },
  arquivada: { t: "arquivada", tom: "neutro" },
};

export default function Frentes() {
  const { dados, hoje, salvar, carregando, erro, moduloInstalado } = useFin();
  const { user } = useAuth();
  const { leads } = useTeam();
  const toast = useToast();
  const [aba, setAba] = useState<"frentes" | "acoes">("frentes");
  const [editarFrente, setEditarFrente] = useState<Partial<Frente> | null>(null);
  const [editarTarefa, setEditarTarefa] = useState<Partial<Tarefa> | null>(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [filtroFrente, setFiltroFrente] = useState<string>("todas");

  const funil = useMemo(() => {
    const meus = leads.filter((l) => l.owner_id === user?.id);
    const conta = (e: string) => meus.filter((l) => l.estagio === e).length;
    const mes = inicioMes(hoje);
    return {
      abertos: meus.filter((l) => !["fechado", "perdido"].includes(l.estagio)).length,
      apresentacao: conta("apresentacao"),
      proposta: conta("proposta"),
      fechadosMes: meus.filter((l) => l.estagio === "fechado" && l.fechado_em && l.fechado_em.slice(0, 10) >= mes).length,
    };
  }, [leads, user?.id, hoje]);

  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;

  const frentesMap = new Map(dados.frentes.map((f) => [f.id, f]));
  const frentes = dados.frentes
    .filter((f) => verArquivadas || f.situacao !== "arquivada")
    .sort((a, b) => b.prioridade - a.prioridade || a.nome.localeCompare(b.nome));
  const abertas = dados.tarefas
    .filter((t) => t.status === "aberta" && (filtroFrente === "todas" || t.frente_id === filtroFrente))
    .map((t) => ({ t, p: pontuarTarefa(t, frentesMap, hoje) }))
    .sort((a, b) => b.p.total - a.p.total);
  const feitas = dados.tarefas
    .filter((t) => t.status === "feita" && (filtroFrente === "todas" || t.frente_id === filtroFrente))
    .sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? ""))
    .slice(0, 15);

  async function mudar(t: Tarefa, patch: Partial<Tarefa>, msg: string) {
    try {
      await salvar("fin_tasks", { id: t.id, ...patch });
      toast(msg);
    } catch (e) {
      toast(erroMsg(e), "erro");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Frentes e ações</h1>
        <BotaoOcultar />
      </div>
      <Segmentado
        opcoes={[
          { id: "frentes", label: "Frentes de renda" },
          { id: "acoes", label: `Ações (${dados.tarefas.filter((t) => t.status === "aberta").length})` },
        ]}
        valor={aba}
        onChange={setAba}
      />

      {aba === "frentes" && (
        <>
          <button onClick={() => setEditarFrente({})} className="btn btn-sec w-full">
            <Plus size={16} /> Nova frente
          </button>
          {frentes.length === 0 && <Vazio icone={<Rocket size={22} />} titulo="Nenhuma frente" texto="Cadastre de onde vem (ou pode vir) seu dinheiro." />}
          <ul className="space-y-2.5">
            {frentes.map((f) => {
              const r = resumoFrente(f, dados);
              return (
                <li key={f.id} className={cls("cartao p-4", f.situacao === "arquivada" && "opacity-60")}>
                  <button onClick={() => setEditarFrente(f)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{f.nome}</p>
                        {f.objetivo && <p className="text-[13px] text-mute">{f.objetivo}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Pill tom={SIT[f.situacao].tom}>{SIT[f.situacao].t}</Pill>
                        <span className="text-[11px] text-dim">prioridade {f.prioridade}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[12.5px]">
                      <div>
                        <p className="text-[10.5px] text-mute">Recebido</p>
                        <Valor c={r.recebido} compacto className="font-semibold text-neon" />
                      </div>
                      <div>
                        <p className="text-[10.5px] text-mute">Previsto</p>
                        <Valor c={r.previsto} compacto className="font-semibold" />
                      </div>
                      <div>
                        <p className="text-[10.5px] text-mute">Custos</p>
                        {r.custosInformados ? <Valor c={r.custos} compacto className="font-semibold" /> : <span className="text-dim">não lançados</span>}
                      </div>
                      <div>
                        <p className="text-[10.5px] text-mute">Resultado</p>
                        <Valor c={r.resultado} compacto className={cls("font-semibold", r.resultado < 0 && "text-quente")} />
                      </div>
                    </div>
                    {(r.proximaTarefa || f.proxima_oportunidade) && (
                      <p className="mt-2.5 text-[13px]">
                        <span className="text-mute">Próximo: </span>
                        {r.proximaTarefa ? `${r.proximaTarefa.titulo}${r.proximaTarefa.prazo ? ` (até ${dataCurta(r.proximaTarefa.prazo)})` : ""}` : f.proxima_oportunidade}
                      </p>
                    )}
                    {f.indicador_nome && <p className="mt-1 text-[12px] text-dim">Indicador: {f.indicador_nome}</p>}
                    {r.avisos.map((a) => (
                      <p key={a} className="mt-1 text-[12px] text-morno">
                        {a}
                      </p>
                    ))}
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-sec flex-1 py-2 text-[13px]" onClick={() => setEditarTarefa({ frente_id: f.id })}>
                      <Plus size={14} /> Ação
                    </button>
                    <button
                      className="btn btn-ghost py-2 text-[13px]"
                      onClick={() => {
                        setFiltroFrente(f.id);
                        setAba("acoes");
                      }}
                    >
                      {r.tarefasAbertas.length} aberta(s) <ChevronRight size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {dados.frentes.some((f) => f.situacao === "arquivada") && (
            <button onClick={() => setVerArquivadas(!verArquivadas)} className="text-[13px] text-mute">
              <Archive size={13} className="mr-1 inline" />
              {verArquivadas ? "Esconder arquivadas" : "Ver arquivadas"}
            </button>
          )}
          <Secao titulo="Funil do CRM (seus leads)">
            <Link to="/leads" className="cartao grid grid-cols-4 gap-2 p-3.5 text-center text-[12.5px]">
              <div>
                <p className="text-lg font-bold">{funil.abertos}</p>
                <p className="text-mute">abertos</p>
              </div>
              <div>
                <p className="text-lg font-bold">{funil.apresentacao}</p>
                <p className="text-mute">apresentação</p>
              </div>
              <div>
                <p className="text-lg font-bold">{funil.proposta}</p>
                <p className="text-mute">proposta</p>
              </div>
              <div>
                <p className="text-lg font-bold text-neon">{funil.fechadosMes}</p>
                <p className="text-mute">fechados no mês</p>
              </div>
            </Link>
            <p className="mt-1 text-[12px] text-dim">Venda fechada no CRM não vira dinheiro aqui sozinha: registre a entrada quando o Pix cair.</p>
          </Secao>
        </>
      )}

      {aba === "acoes" && (
        <>
          <div className="flex gap-2">
            <select className="campo flex-1 py-2" value={filtroFrente} onChange={(e) => setFiltroFrente(e.target.value)} aria-label="Filtrar por frente">
              <option value="todas">Todas as frentes</option>
              {dados.frentes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <button onClick={() => setEditarTarefa({ frente_id: filtroFrente !== "todas" ? filtroFrente : null })} className="btn btn-neon">
              <Plus size={16} /> Ação
            </button>
          </div>
          <Explica>
            Ordem sugerida pela pontuação: prazo (vencido 40, hoje 35, até 2 dias 28, até 7 dias 15), compromisso assumido (+20), potencial de caixa (até +25), esforço baixo (+10)
            ou médio (+5) e prioridade da frente (×2). Frente pausada perde 30. Você pode fixar qualquer ação como prioridade de hoje.
          </Explica>
          {abertas.length === 0 && <Vazio icone={<Check size={22} />} titulo="Nenhuma ação aberta" />}
          <ul className="space-y-2">
            {abertas.map(({ t, p }) => {
              const f = t.frente_id ? frentesMap.get(t.frente_id) : null;
              const d = t.prazo ? difDias(hoje, t.prazo) : null;
              return (
                <li key={t.id} className="cartao flex items-start gap-3 p-3.5">
                  <button
                    onClick={() => mudar(t, { status: "feita", concluida_em: new Date().toISOString() }, "Ação concluída")}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-transparent hover:border-neon hover:text-neon"
                    aria-label={`Concluir ${t.titulo}`}
                  >
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditarTarefa(t)} className="min-w-0 flex-1 text-left">
                    <p className="font-medium leading-snug">{t.titulo}</p>
                    {t.proximo_passo && <p className="text-[12.5px] text-mute">→ {t.proximo_passo}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {f && <Pill>{f.nome}</Pill>}
                      {t.prazo && <Pill tom={d !== null && d < 0 ? "alto" : d === 0 ? "medio" : "neutro"}>{d !== null && d < 0 ? `atrasada (${dataCurta(t.prazo)})` : dataCurta(t.prazo)}</Pill>}
                      {t.tempo_min && <Pill>{t.tempo_min} min</Pill>}
                      {t.foco_em === hoje && <Pill tom="ok">hoje</Pill>}
                      <Pill tom="info">{p.total} pts</Pill>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {feitas.length > 0 && (
            <Secao titulo="Concluídas recentemente">
              <ul className="space-y-1.5">
                {feitas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2 text-[13px] text-mute">
                    <span className="truncate line-through">{t.titulo}</span>
                    <button onClick={() => mudar(t, { status: "aberta", concluida_em: null }, "Ação reaberta")} className="shrink-0 text-[12px]" aria-label="Reabrir">
                      <RotateCcw size={13} className="mr-0.5 inline" /> reabrir
                    </button>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}

      <FormFrente key={editarFrente?.id ?? "nova"} aberto={!!editarFrente} onFechar={() => setEditarFrente(null)} inicial={editarFrente ?? undefined} />
      <FormTarefa key={editarTarefa?.id ?? `n-${editarTarefa?.frente_id}`} aberto={!!editarTarefa} onFechar={() => setEditarTarefa(null)} inicial={editarTarefa ?? undefined} />
    </div>
  );
}
