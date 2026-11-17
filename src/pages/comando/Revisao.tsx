import { useMemo, useState } from "react";
import { ClipboardCheck, History } from "lucide-react";
import { Campo, Secao, Sheet, Vazio } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { erroMsg } from "../../lib/utils";
import { compromissosProximos, marcosSemanais, progressoMeta, resultadoCaixa, resumoFrente, saldoCaixa, saldoDivida } from "../../fin/calc";
import { brl } from "../../fin/dinheiro";
import { dataBR, dataCurta, fimSemana, inicioSemana, somaDias } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import type { DadosFin, Revisao } from "../../fin/tipos";
import { Cartao, Pill, Valor } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

/** fotografia do momento: plano, resultados e premissas — fica gravada com a revisão */
function fotografar(d: DadosFin, hoje: string, ini: string, fim: string) {
  const meta = d.metas.find((m) => m.principal && m.status === "ativa");
  const p = meta ? progressoMeta(meta, d, hoje) : null;
  const marco = meta ? marcosSemanais(meta, d, hoje).find((m) => m.semanaInicio === ini) : undefined;
  const r = resultadoCaixa(d.lancamentos, ini, fim < hoje ? fim : hoje);
  return {
    gerado_em: new Date().toISOString(),
    hoje,
    periodo: { inicio: ini, fim },
    caixa: { saldo_realizado: d.contas.some((c) => c.tipo !== "cartao") ? saldoCaixa(d.contas, d.lancamentos) : null, ...r },
    meta: meta && p
      ? {
          nome: meta.nome,
          tipo: meta.tipo,
          versao: meta.versao,
          alvo: p.alvo,
          realizado: p.realizado,
          restante: p.restante,
          prazo: meta.prazo,
          necessario_semana: p.necessarioPorSemana,
          observado_semana: p.observado?.status === "ok" ? p.observado.porSemana : null,
          marco_semana: marco ? { planejado: marco.planejado, realizado: marco.realizado, diferenca: marco.diferenca } : null,
        }
      : null,
    dividas: d.dividas.filter((x) => x.status === "aberta").map((x) => ({ credor: x.credor, saldo: saldoDivida(x, d.lancamentos).saldo, vencimento: x.vencimento })),
    frentes: d.frentes
      .filter((f) => f.situacao !== "arquivada")
      .map((f) => {
        const rf = resumoFrente(f, d, ini);
        return { nome: f.nome, situacao: f.situacao, prioridade: f.prioridade, recebido: rf.recebido, custos: rf.custosInformados ? rf.custos : null };
      }),
    tarefas: {
      concluidas: d.tarefas.filter((t) => t.status === "feita" && t.concluida_em && t.concluida_em.slice(0, 10) >= ini && t.concluida_em.slice(0, 10) <= fim).map((t) => t.titulo),
      abertas: d.tarefas.filter((t) => t.status === "aberta").length,
    },
    proximos_compromissos: compromissosProximos(d, hoje, 14).map((c) => ({ data: c.data, valor: c.valor, titulo: c.titulo, atrasado: c.atrasado })),
    premissas: { capacidade_semanal_horas: d.ajustes?.capacidade_semanal_horas ?? null, simulacao: d.ajustes?.preferencias?.simulacao ?? null },
  };
}

type Foto = ReturnType<typeof fotografar>;

export default function RevisaoPage() {
  const { dados, hoje, salvar, carregando, erro, moduloInstalado } = useFin();
  const toast = useToast();
  // revisão de domingo/segunda olha a semana que está acabando
  const padrao = new Date().getDay() === 1 ? inicioSemana(somaDias(hoje, -1)) : inicioSemana(hoje);
  const [ini, setIni] = useState(padrao);
  const fim = fimSemana(ini);
  const [funcionou, setFuncionou] = useState("");
  const [obstaculos, setObstaculos] = useState("");
  const [mudancas, setMudancas] = useState("");
  const [cap, setCap] = useState<string>(dados.ajustes?.capacidade_semanal_horas?.toString() ?? "");
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  const [r3, setR3] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [ver, setVer] = useState<Revisao | null>(null);
  const [corrigir, setCorrigir] = useState<Revisao | null>(null);

  const foto = useMemo(() => fotografar(dados, hoje, ini, fim), [dados, hoje, ini, fim]);
  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;

  const historico = [...dados.revisoes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const corrigidas = new Set(dados.revisoes.map((r) => r.corrige_id).filter(Boolean));

  async function gravar(corrigeId: string | null) {
    setOcupado(true);
    try {
      const resultados = [r1, r2, r3].map((s) => s.trim()).filter(Boolean).slice(0, 3);
      await salvar("fin_reviews", {
        semana_inicio: ini,
        semana_fim: fim,
        snapshot: foto,
        funcionou: funcionou.trim(),
        obstaculos: obstaculos.trim(),
        mudancas: mudancas.trim(),
        capacidade_horas: cap ? Number(cap) : null,
        resultados_proxima: resultados,
        corrige_id: corrigeId,
      });
      toast(corrigeId ? "Correção salva — a revisão original continua guardada" : "Revisão salva");
      setFuncionou("");
      setObstaculos("");
      setMudancas("");
      setR1("");
      setR2("");
      setR3("");
      setCorrigir(null);
    } catch (e) {
      toast(erroMsg(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <h1 className="text-xl font-bold">Revisão semanal</h1>
      <p className="text-[13.5px] text-mute">Uns 15 minutos. Fica salva com a fotografia dos números de agora — não dá pra editar depois, só registrar uma correção.</p>

      <Cartao className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">
            Semana {dataCurta(ini)}–{dataCurta(fim)}
          </p>
          <div className="flex gap-1">
            <button className="btn btn-ghost px-2.5 py-1.5" onClick={() => setIni(somaDias(ini, -7))} aria-label="Semana anterior">
              ‹
            </button>
            <button className="btn btn-ghost px-2.5 py-1.5" onClick={() => setIni(somaDias(ini, 7))} aria-label="Próxima semana" disabled={ini >= inicioSemana(hoje)}>
              ›
            </button>
          </div>
        </div>

        <Passo n={1} titulo="Conferir dinheiro e compromissos">
          <div className="grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <p className="text-[11px] text-mute">Entrou</p>
              <Valor c={foto.caixa.entradas} compacto className="font-semibold text-neon" />
            </div>
            <div>
              <p className="text-[11px] text-mute">Saiu</p>
              <Valor c={foto.caixa.saidas} compacto className="font-semibold" />
            </div>
            <div>
              <p className="text-[11px] text-mute">Saldo hoje</p>
              <Valor c={foto.caixa.saldo_realizado} compacto className="font-semibold" />
            </div>
          </div>
          {foto.proximos_compromissos.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12.5px] text-mute">
              {foto.proximos_compromissos.slice(0, 6).map((c, i) => (
                <li key={i}>
                  {dataCurta(c.data)} · {brl(c.valor)} · {c.titulo}
                  {c.atrasado && <span className="text-quente"> · atrasado</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[12px] text-dim">Faltou lançar algo? Lance antes de salvar a revisão.</p>
        </Passo>

        <Passo n={2} titulo="Planejado x realizado">
          {foto.meta ? (
            <div className="space-y-1 text-[13px]">
              <p>
                Meta: <Valor c={foto.meta.realizado} compacto className="font-semibold" /> de <Valor c={foto.meta.alvo} compacto /> · falta <Valor c={foto.meta.restante} compacto />
              </p>
              {foto.meta.marco_semana && (
                <p>
                  Marco da semana: planejado <Valor c={foto.meta.marco_semana.planejado} compacto /> · realizado <Valor c={foto.meta.marco_semana.realizado} compacto /> ·{" "}
                  <Valor c={foto.meta.marco_semana.diferenca} compacto sinal className={foto.meta.marco_semana.diferenca !== null && foto.meta.marco_semana.diferenca < 0 ? "text-quente" : "text-neon"} />
                </p>
              )}
              <p className="text-mute">Ações concluídas na semana: {foto.tarefas.concluidas.length}</p>
            </div>
          ) : (
            <p className="text-[13px] text-mute">Sem meta principal.</p>
          )}
        </Passo>

        <Passo n={3} titulo="O que funcionou, obstáculos e mudanças">
          <div className="space-y-2.5">
            <Campo rotulo="O que funcionou">
              <textarea className="campo" value={funcionou} onChange={(e) => setFuncionou(e.target.value)} />
            </Campo>
            <Campo rotulo="Obstáculos">
              <textarea className="campo" value={obstaculos} onChange={(e) => setObstaculos(e.target.value)} placeholder="Sem culpa: o que travou de verdade?" />
            </Campo>
            <Campo rotulo="Mudanças de contexto">
              <textarea className="campo" value={mudancas} onChange={(e) => setMudancas(e.target.value)} placeholder="Ex.: Dancar respondeu, novo cliente, gasto inesperado" />
            </Campo>
          </div>
        </Passo>

        <Passo n={4} titulo="Capacidade e prioridades">
          <Campo rotulo="Horas disponíveis na próxima semana">
            <input className="campo" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Campo>
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-mute">
            {foto.frentes.map((f) => (
              <li key={f.nome}>
                {f.nome} [{f.situacao}, prioridade {f.prioridade}] · recebido na semana {brl(f.recebido, true)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-dim">Mudar prioridade de frente: aba Frentes.</p>
        </Passo>

        <Passo n={5} titulo="Até 3 resultados importantes para a próxima semana">
          <div className="space-y-2">
            {[
              [r1, setR1],
              [r2, setR2],
              [r3, setR3],
            ].map(([v, set], i) => (
              <input key={i} className="campo" value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} placeholder={`Resultado ${i + 1}`} maxLength={140} />
            ))}
          </div>
        </Passo>

        <button className="btn btn-neon w-full" disabled={ocupado} onClick={() => gravar(null)}>
          <ClipboardCheck size={17} /> {ocupado ? "Salvando…" : "6. Salvar revisão"}
        </button>
      </Cartao>

      <Secao titulo="Revisões anteriores">
        {historico.length === 0 ? (
          <Vazio icone={<History size={22} />} titulo="Nenhuma revisão salva ainda" />
        ) : (
          <ul className="space-y-2">
            {historico.map((r) => (
              <li key={r.id}>
                <button onClick={() => setVer(r)} className="cartao w-full p-3.5 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {dataCurta(r.semana_inicio)}–{dataCurta(r.semana_fim)}
                    </span>
                    <span className="flex gap-1">
                      {r.corrige_id && <Pill tom="info">correção</Pill>}
                      {corrigidas.has(r.id) && <Pill tom="medio">corrigida depois</Pill>}
                    </span>
                  </div>
                  <p className="text-[12px] text-mute">salva em {new Date(r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  {r.resultados_proxima.length > 0 && <p className="mt-1 text-[13px]">→ {r.resultados_proxima.join(" · ")}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Sheet aberto={!!ver} onFechar={() => setVer(null)} titulo={ver ? `Revisão ${dataBR(ver.semana_inicio)}` : ""}>
        {ver && (
          <div className="space-y-3 text-[13.5px]">
            {ver.corrige_id && <Pill tom="info">Esta é uma correção de uma revisão anterior</Pill>}
            <Bloco t="Funcionou" v={ver.funcionou} />
            <Bloco t="Obstáculos" v={ver.obstaculos} />
            <Bloco t="Mudanças" v={ver.mudancas} />
            <Bloco t="Capacidade" v={ver.capacidade_horas !== null ? `${ver.capacidade_horas} h` : ""} />
            <Bloco t="Resultados combinados" v={ver.resultados_proxima.join(" · ")} />
            <FotoResumo foto={ver.snapshot as unknown as Foto} />
            <button
              className="btn btn-sec w-full"
              onClick={() => {
                setCorrigir(ver);
                setIni(ver.semana_inicio);
                setFuncionou(ver.funcionou);
                setObstaculos(ver.obstaculos);
                setMudancas(ver.mudancas);
                setCap(ver.capacidade_horas?.toString() ?? "");
                setR1(ver.resultados_proxima[0] ?? "");
                setR2(ver.resultados_proxima[1] ?? "");
                setR3(ver.resultados_proxima[2] ?? "");
                setVer(null);
              }}
            >
              Registrar correção
            </button>
          </div>
        )}
      </Sheet>

      <Sheet aberto={!!corrigir} onFechar={() => setCorrigir(null)} titulo="Correção da revisão">
        <p className="text-[13.5px] text-mute">
          Os textos acima no formulário foram preenchidos com a revisão original. Ajuste o que estava errado e salve: será criada uma nova revisão ligada à original (com os números
          de agora), sem apagar nada.
        </p>
        <button className="btn btn-neon mt-4 w-full" disabled={ocupado} onClick={() => corrigir && gravar(corrigir.id)}>
          Salvar correção
        </button>
      </Sheet>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h2 className="mb-2 text-[13px] font-bold">
        <span className="mr-1.5 text-neon">{n}.</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Bloco({ t, v }: { t: string; v: string }) {
  if (!v) return null;
  return (
    <div>
      <p className="rotulo">{t}</p>
      <p className="whitespace-pre-wrap">{v}</p>
    </div>
  );
}

function FotoResumo({ foto }: { foto: Foto | undefined }) {
  if (!foto || !foto.caixa) return null;
  return (
    <div className="rounded-xl border border-line bg-s2 p-3 text-[12.5px] text-mute">
      <p className="rotulo">Números daquele momento</p>
      <p>
        Entrou {brl(foto.caixa.entradas)} · saiu {brl(foto.caixa.saidas)} · saldo {foto.caixa.saldo_realizado === null ? "não informado" : brl(foto.caixa.saldo_realizado)}
      </p>
      {foto.meta && (
        <p>
          Meta {foto.meta.nome}: {brl(foto.meta.realizado)} de {foto.meta.alvo === null ? "—" : brl(foto.meta.alvo)}
        </p>
      )}
      {foto.tarefas && <p>Ações concluídas: {foto.tarefas.concluidas.length}</p>}
    </div>
  );
}
