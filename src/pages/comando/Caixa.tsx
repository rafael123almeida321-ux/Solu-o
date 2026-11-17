import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, CalendarClock, CheckCircle2, CreditCard, Plus, Repeat, Search, Wallet } from "lucide-react";
import { Secao, Vazio } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { ocorrenciasFaltantes, projecaoCaixa, resultadoCaixa, saldoCaixa, saldoConta, saldoDivida, dividaEmAtraso } from "../../fin/calc";
import { dataCurta, fimMes, inicioMes, inicioSemana, somaDias, somaMeses } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { FormConta, FormDivida, FormLancamento, FormLiquidar, FormRecorrencia } from "../../fin/formularios";
import type { Conta, Divida, Lancamento } from "../../fin/tipos";
import { BotaoOcultar, Cartao, Explica, Pill, Valor } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

type Aba = "lancamentos" | "contas" | "dividas" | "projecao" | "recorrencias";
const ABAS: { id: Aba; label: string }[] = [
  { id: "lancamentos", label: "Lançamentos" },
  { id: "contas", label: "Contas" },
  { id: "dividas", label: "Dívidas" },
  { id: "projecao", label: "30 dias" },
  { id: "recorrencias", label: "Recorrências" },
];

export default function Caixa() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get("aba") as Aba) || "lancamentos";
  const { carregando, erro, moduloInstalado } = useFin();
  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Caixa</h1>
        <BotaoOcultar />
      </div>
      <div className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setParams({ aba: a.id })}
            className={cls("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", aba === a.id ? "border-neon bg-neon text-fundo" : "border-line text-mute")}
          >
            {a.label}
          </button>
        ))}
      </div>
      {aba === "lancamentos" && <AbaLancamentos statusInicial={params.get("status")} />}
      {aba === "contas" && <AbaContas />}
      {aba === "dividas" && <AbaDividas />}
      {aba === "projecao" && <AbaProjecao />}
      {aba === "recorrencias" && <AbaRecorrencias />}
    </div>
  );
}

// ------------------------------------------------------------------ lançamentos

function AbaLancamentos({ statusInicial }: { statusInicial: string | null }) {
  const { dados, hoje } = useFin();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>(statusInicial ?? "todos");
  const [tipo, setTipo] = useState("todos");
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "tudo">("mes");
  const [mesRef, setMesRef] = useState(hoje);
  const [editar, setEditar] = useState<Partial<Lancamento> | null>(null);
  const [liquidar, setLiquidar] = useState<Lancamento | null>(null);
  const contas = new Map(dados.contas.map((c) => [c.id, c.nome]));
  const cats = new Map(dados.categorias.map((c) => [c.id, c.nome]));

  const [ini, fim] =
    periodo === "semana" ? [inicioSemana(hoje), somaDias(inicioSemana(hoje), 6)] : periodo === "mes" ? [inicioMes(mesRef), fimMes(mesRef)] : ["0000-01-01", "9999-12-31"];

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.lancamentos
      .filter((l) => {
        const d = l.data_pagamento ?? l.data_vencimento ?? "";
        // "previstos" mostra todos os previstos, de qualquer data; os outros filtros respeitam o período
        if (status !== "previsto" && !(d >= ini && d <= fim)) return false;
        if (status !== "todos" && l.status !== status) return false;
        if (tipo !== "todos" && l.tipo !== tipo) return false;
        if (q && !`${l.descricao} ${l.notas}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (b.data_pagamento ?? b.data_vencimento ?? "").localeCompare(a.data_pagamento ?? a.data_vencimento ?? ""));
  }, [dados.lancamentos, busca, status, tipo, ini, fim]);

  const res = resultadoCaixa(dados.lancamentos, ini, fim > hoje ? hoje : fim);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setEditar({ tipo: "entrada" })} className="btn btn-sec flex-1">
          <Plus size={16} /> Entrada
        </button>
        <button onClick={() => setEditar({ tipo: "saida" })} className="btn btn-sec flex-1">
          <Plus size={16} /> Saída
        </button>
        <button onClick={() => setEditar({ tipo: "transferencia" })} className="btn btn-sec flex-1">
          <Plus size={16} /> Transf.
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className="campo py-2" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)} aria-label="Período">
          <option value="semana">Esta semana</option>
          <option value="mes">Mês</option>
          <option value="tudo">Tudo</option>
        </select>
        {periodo === "mes" ? (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost px-2 py-2" onClick={() => setMesRef(somaMeses(mesRef, -1))} aria-label="Mês anterior">
              ‹
            </button>
            <span className="flex-1 text-center text-sm font-semibold">{mesRef.slice(5, 7)}/{mesRef.slice(0, 4)}</span>
            <button className="btn btn-ghost px-2 py-2" onClick={() => setMesRef(somaMeses(mesRef, 1))} aria-label="Próximo mês">
              ›
            </button>
          </div>
        ) : (
          <span />
        )}
        <select className="campo py-2" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="todos">Todos</option>
          <option value="realizado">Realizados</option>
          <option value="previsto">Previstos (todos)</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <select className="campo py-2" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="todos">Entradas e saídas</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
          <option value="transferencia">Transferências</option>
        </select>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
        <input className="campo pl-9" placeholder="Buscar descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {status !== "previsto" && (
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <Cartao className="p-2.5">
            <p className="text-[11px] text-mute">Entrou</p>
            <Valor c={res.entradas} compacto className="font-semibold text-neon" />
          </Cartao>
          <Cartao className="p-2.5">
            <p className="text-[11px] text-mute">Saiu</p>
            <Valor c={res.saidas} compacto className="font-semibold" />
          </Cartao>
          <Cartao className="p-2.5">
            <p className="text-[11px] text-mute">Resultado de caixa</p>
            <Valor c={res.resultado} compacto className={cls("font-semibold", res.resultado < 0 && "text-quente")} />
          </Cartao>
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio icone={<Wallet size={22} />} titulo="Nada aqui" texto="Mude o filtro ou registre um lançamento." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-s1">
          {lista.map((l) => {
            const venc = l.status === "previsto" && l.data_vencimento && l.data_vencimento < hoje;
            return (
              <li key={l.id} className="flex items-center gap-3 px-3.5 py-3">
                <button onClick={() => setEditar(l)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-medium">{l.descricao}</p>
                  <p className="text-[12px] text-mute">
                    {dataCurta(l.data_pagamento ?? l.data_vencimento)} · {l.conta_id ? contas.get(l.conta_id) : "sem conta"}
                    {l.tipo === "transferencia" && l.conta_destino_id ? ` → ${contas.get(l.conta_destino_id)}` : ""}
                    {l.categoria_id ? ` · ${cats.get(l.categoria_id)}` : ""}
                  </p>
                  <div className="mt-1 flex gap-1">
                    {l.status === "previsto" && <Pill tom={venc ? "alto" : "info"}>{venc ? "vencido" : "previsto"}</Pill>}
                    {l.status === "cancelado" && <Pill>cancelado</Pill>}
                    {l.confirmacao !== "confirmado" && <Pill tom="medio">{l.confirmacao}</Pill>}
                    {l.divida_id && <Pill>dívida</Pill>}
                  </div>
                </button>
                <div className="text-right">
                  <Valor
                    c={l.tipo === "entrada" ? l.valor_centavos : l.tipo === "saida" ? -l.valor_centavos : l.valor_centavos}
                    sinal={l.tipo === "entrada"}
                    className={cls("text-[14px] font-semibold", l.tipo === "entrada" ? "text-neon" : l.tipo === "transferencia" ? "text-mute" : "text-ink", l.status !== "realizado" && "opacity-60")}
                  />
                  {l.status === "previsto" && (
                    <button onClick={() => setLiquidar(l)} className="mt-1 block text-[12px] font-semibold text-neon">
                      <CheckCircle2 size={13} className="mr-0.5 inline" />
                      {l.tipo === "entrada" ? "Recebi" : "Paguei"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormLancamento key={editar?.id ?? editar?.tipo ?? "x"} aberto={!!editar} onFechar={() => setEditar(null)} inicial={editar ?? undefined} />
      <FormLiquidar key={liquidar?.id} lanc={liquidar} onFechar={() => setLiquidar(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ contas

function AbaContas() {
  const { dados, hoje } = useFin();
  const [editar, setEditar] = useState<Partial<Conta> | null>(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const temCaixa = dados.contas.some((c) => c.tipo !== "cartao");
  const lista = dados.contas.filter((c) => verArquivadas || !c.arquivada);
  return (
    <div className="space-y-3">
      <Cartao>
        <p className="titulo-sec">Saldo de caixa (sem cartões)</p>
        {temCaixa ? <Valor c={saldoCaixa(dados.contas, dados.lancamentos)} className="mt-1 block text-2xl font-bold" /> : <p className="mt-1 text-morno">não informado</p>}
        <div className="mt-2">
          <Explica>
            Para cada conta: saldo informado no início do dia da data-base + entradas − saídas ± transferências realizadas a partir dessa data. Transferências entre suas contas não
            mudam o total. Cartão fica fora do caixa: o saldo dele (negativo) é quanto você deve; pagar a fatura é uma transferência da conta para o cartão.
          </Explica>
        </div>
      </Cartao>
      <button onClick={() => setEditar({})} className="btn btn-sec w-full">
        <Plus size={16} /> Nova conta
      </button>
      {lista.length === 0 ? (
        <Vazio icone={<Wallet size={22} />} titulo="Nenhuma conta" texto="Cadastre onde seu dinheiro está (Nubank, dinheiro vivo…) com o saldo de hoje." />
      ) : (
        <ul className="space-y-2">
          {lista.map((c) => {
            const s = saldoConta(c, dados.lancamentos);
            return (
              <li key={c.id}>
                <button onClick={() => setEditar(c)} className="cartao flex w-full items-center gap-3 p-3.5 text-left">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s3 text-mute">{c.tipo === "cartao" ? <CreditCard size={18} /> : <Wallet size={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {c.nome} {c.arquivada && <Pill>arquivada</Pill>}
                    </span>
                    <span className="block text-[12px] text-mute">
                      {c.tipo === "cartao" ? "cartão" : c.tipo} · {c.escopo} · saldo-base em {dataCurta(c.data_base)}
                    </span>
                  </span>
                  <Valor c={s} className={cls("font-bold", s < 0 && "text-quente")} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {dados.contas.some((c) => c.arquivada) && (
        <button onClick={() => setVerArquivadas(!verArquivadas)} className="text-[13px] text-mute">
          <Archive size={13} className="mr-1 inline" />
          {verArquivadas ? "Esconder arquivadas" : "Ver arquivadas"}
        </button>
      )}
      <p className="text-[12px] text-dim">Hoje: {dataCurta(hoje, true)}</p>
      <FormConta key={editar?.id ?? "nova"} aberto={!!editar} onFechar={() => setEditar(null)} inicial={editar ?? undefined} />
    </div>
  );
}

// ------------------------------------------------------------------ dívidas

function AbaDividas() {
  const { dados, hoje } = useFin();
  const [editar, setEditar] = useState<Partial<Divida> | null>(null);
  const [prever, setPrever] = useState<Partial<Lancamento> | null>(null);
  const abertas = dados.dividas.filter((d) => d.status === "aberta");
  const outras = dados.dividas.filter((d) => d.status !== "aberta");
  const total = abertas.reduce((s, d) => s + saldoDivida(d, dados.lancamentos).saldo, 0);
  return (
    <div className="space-y-3">
      <Cartao>
        <p className="titulo-sec">Total em aberto (dívidas cadastradas)</p>
        <Valor c={total} className="mt-1 block text-2xl font-bold" />
        <div className="mt-2">
          <Explica>
            Saldo de cada dívida = saldo que você informou (no início do dia da data) − pagamentos REALIZADOS ligados a ela depois disso. Quando os juros não foram informados, o
            app mostra o saldo informado e não inventa correção. Pagamento previsto não abate.
          </Explica>
        </div>
      </Cartao>
      <button onClick={() => setEditar({})} className="btn btn-sec w-full">
        <Plus size={16} /> Nova dívida
      </button>
      {abertas.length === 0 && <Vazio icone={<CalendarClock size={22} />} titulo="Nenhuma dívida aberta" />}
      <ul className="space-y-2">
        {abertas.map((d) => {
          const s = saldoDivida(d, dados.lancamentos);
          const atraso = dividaEmAtraso(d, dados.lancamentos, hoje);
          const temPrevisto = dados.lancamentos.some((l) => l.divida_id === d.id && l.status === "previsto");
          return (
            <li key={d.id} className="cartao p-3.5">
              <button onClick={() => setEditar(d)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {d.credor}
                      {d.titular && <span className="font-normal text-mute"> · {d.titular}</span>}
                    </p>
                    {d.descricao && <p className="text-[13px] text-mute">{d.descricao}</p>}
                  </div>
                  <Valor c={s.saldo} className="font-bold" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {atraso && <Pill tom="alto">em atraso{d.em_atraso_desde ? ` desde ${dataCurta(d.em_atraso_desde)}` : ""}</Pill>}
                  {d.vencimento && <Pill tom={!atraso && d.vencimento <= somaDias(hoje, 7) ? "medio" : "neutro"}>vence {dataCurta(d.vencimento)}</Pill>}
                  {!s.jurosInformado && <Pill>juros não informados</Pill>}
                  {s.pago > 0 && (
                    <Pill tom="ok">
                      pago <Valor c={s.pago} compacto />
                    </Pill>
                  )}
                  {d.goal_id && <Pill tom="info">na meta</Pill>}
                </div>
              </button>
              <div className="mt-2.5 flex gap-2">
                <button
                  className="btn btn-sec flex-1 py-2 text-[13px]"
                  onClick={() => setPrever({ tipo: "saida", status: "realizado", divida_id: d.id, descricao: `Pagamento ${d.credor}`, valor_centavos: s.saldo })}
                >
                  Registrar pagamento
                </button>
                {!temPrevisto && (
                  <button
                    className="btn btn-sec flex-1 py-2 text-[13px]"
                    onClick={() =>
                      setPrever({
                        tipo: "saida",
                        status: "previsto",
                        divida_id: d.id,
                        descricao: `Pagar ${d.credor}`,
                        valor_centavos: s.saldo,
                        data_vencimento: d.vencimento && d.vencimento >= hoje ? d.vencimento : hoje,
                      })
                    }
                  >
                    Prever pagamento
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {outras.length > 0 && (
        <Secao titulo="Quitadas / arquivadas">
          <ul className="space-y-1.5">
            {outras.map((d) => (
              <li key={d.id}>
                <button onClick={() => setEditar(d)} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-left text-sm text-mute">
                  {d.credor} · {d.status}
                </button>
              </li>
            ))}
          </ul>
        </Secao>
      )}
      <FormDivida key={editar?.id ?? "nova"} aberto={!!editar} onFechar={() => setEditar(null)} inicial={editar ?? undefined} />
      <FormLancamento key={`p-${prever?.divida_id}-${prever?.status}`} aberto={!!prever} onFechar={() => setPrever(null)} inicial={prever ?? undefined} />
    </div>
  );
}

// ------------------------------------------------------------------ projeção

function AbaProjecao() {
  const { dados, hoje } = useFin();
  const [liquidar, setLiquidar] = useState<Lancamento | null>(null);
  const p = useMemo(() => projecaoCaixa(dados, hoje, 30), [dados, hoje]);
  const comMov = p.dias.filter((d) => d.itens.length);
  return (
    <div className="space-y-3">
      <Cartao className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-[11px] text-mute">Saldo hoje</p>
            {p.saldoConhecido ? <Valor c={p.saldoInicial} compacto className="font-semibold" /> : <span className="text-morno">não informado</span>}
          </div>
          <div>
            <p className="text-[11px] text-mute">Menor saldo</p>
            {p.minimo && <Valor c={p.minimo.saldo} compacto className={cls("font-semibold", p.minimo.saldo < 0 && "text-quente")} />}
            <p className="text-[11px] text-dim">{p.minimo && dataCurta(p.minimo.data)}</p>
          </div>
          <div>
            <p className="text-[11px] text-mute">Fica negativo</p>
            <p className={cls("font-semibold", p.primeiroNegativo ? "text-quente" : "text-neon")}>{p.primeiroNegativo ? dataCurta(p.primeiroNegativo) : "não"}</p>
          </div>
        </div>
        {!p.saldoConhecido && <p className="text-[12.5px] text-morno">Sem conta cadastrada a projeção parte de zero — mostra só o que entra e sai, não o saldo real.</p>}
        <Explica>
          Parte do saldo realizado de hoje (contas sem cartão) e soma os lançamentos PREVISTOS dos próximos 30 dias na data de vencimento. Previstos já vencidos entram hoje.
          Compras no cartão não saem do caixa; o pagamento da fatura (transferência) sai. Dívidas sem pagamento previsto lançado não entram — use "Prever pagamento" na aba Dívidas.
          Recebimentos incertos entram como estão: confira a coluna de certeza.
        </Explica>
      </Cartao>
      {comMov.length === 0 ? (
        <Vazio icone={<CalendarClock size={22} />} titulo="Nada previsto nos próximos 30 dias" texto="Lance contas a pagar e a receber como 'Previsto'." />
      ) : (
        <ul className="space-y-2">
          {comMov.map((d) => (
            <li key={d.data} className={cls("cartao p-3.5", d.saldo < 0 && "border-quente/50")}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-bold">{dataCurta(d.data, true)}</p>
                <p className="text-[13px]">
                  saldo <Valor c={d.saldo} compacto className={cls("font-bold", d.saldo < 0 && "text-quente")} />
                </p>
              </div>
              <ul className="space-y-1">
                {d.itens.map((it) => (
                  <li key={it.lancamento.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-mute">
                      {it.atrasado && <span className="text-quente">[vencido] </span>}
                      {it.lancamento.descricao}
                      {it.lancamento.confirmacao !== "confirmado" && <span className="text-morno"> ({it.lancamento.confirmacao})</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Valor c={it.efeito} sinal className={it.efeito > 0 ? "text-neon" : "text-ink"} />
                      <button onClick={() => setLiquidar(it.lancamento)} className="text-[11px] font-semibold text-neon" aria-label="Marcar como feito">
                        ✓
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <FormLiquidar key={liquidar?.id} lanc={liquidar} onFechar={() => setLiquidar(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ recorrências

function AbaRecorrencias() {
  const { dados, hoje, inserirVarios, salvar } = useFin();
  const toast = useToast();
  const [nova, setNova] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ate = somaDias(hoje, 60);

  async function gerar() {
    setOcupado(true);
    try {
      const novos = dados.recorrencias.flatMap((r) => ocorrenciasFaltantes(r, dados.lancamentos, ate));
      const n = await inserirVarios("fin_entries", novos, true);
      toast(n ? `${n} previsto(s) criado(s) até ${dataCurta(ate)}` : "Tudo em dia — nada novo para criar");
    } catch (e) {
      toast(erroMsg(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setNova(true)} className="btn btn-sec flex-1">
          <Plus size={16} /> Nova
        </button>
        <button onClick={gerar} disabled={ocupado || !dados.recorrencias.length} className="btn btn-neon flex-1">
          <Repeat size={16} /> {ocupado ? "Gerando…" : "Gerar previstos (60 dias)"}
        </button>
      </div>
      <p className="text-[12.5px] text-dim">Pode apertar quantas vezes quiser: o que já foi gerado não se repete.</p>
      {dados.recorrencias.length === 0 ? (
        <Vazio icone={<Repeat size={22} />} titulo="Nenhuma recorrência" texto="Ex.: mesada mensal, parcela de empréstimo, assinatura." />
      ) : (
        <ul className="space-y-2">
          {dados.recorrencias.map((r) => (
            <li key={r.id} className="cartao flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.descricao}</p>
                <p className="text-[12px] text-mute">
                  {r.frequencia} desde {dataCurta(r.inicio)}
                  {r.fim ? ` até ${dataCurta(r.fim)}` : ""}
                </p>
              </div>
              <Valor c={r.tipo === "entrada" ? r.valor_centavos : -r.valor_centavos} sinal className={r.tipo === "entrada" ? "text-neon" : ""} />
              <button
                className="text-[12px] text-mute"
                onClick={() => salvar("fin_recurrences", { id: r.id, ativa: !r.ativa }).catch((e) => toast(erroMsg(e), "erro"))}
              >
                {r.ativa ? "Pausar" : "Ativar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormRecorrencia aberto={nova} onFechar={() => setNova(false)} />
    </div>
  );
}
