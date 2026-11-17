// Texto "Resumo para revisão com o Claude": sem ids, sem e-mail, sem números de conta.
import { brl } from "./dinheiro";
import { dataBR, inicioSemana, somaDias } from "./datas";
import {
  NOME_TIPO_META,
  compromissosProximos,
  progressoMeta,
  projecaoCaixa,
  resultadoCaixa,
  resumoFrente,
  saldoCaixa,
  saldoCartoes,
  saldoDivida,
} from "./calc";
import type { DadosFin, DataISO } from "./tipos";

export function resumoParaClaude(d: DadosFin, hoje: DataISO): string {
  const ini = inicioSemana(somaDias(hoje, -7));
  const fim = somaDias(ini, 13);
  const L: string[] = [];
  L.push(`# Resumo CLYENT Comando — ${dataBR(hoje)}`);
  L.push(`Período analisado: ${dataBR(ini)} a ${dataBR(hoje)} (semana passada + semana atual)`);
  L.push("");

  const temCaixa = d.contas.some((c) => c.tipo !== "cartao");
  L.push("## Dinheiro");
  L.push(`- Saldo de caixa (realizado): ${temCaixa ? brl(saldoCaixa(d.contas, d.lancamentos)) : "não informado"}`);
  if (d.contas.some((c) => c.tipo === "cartao")) L.push(`- Saldo nos cartões: ${brl(saldoCartoes(d.contas, d.lancamentos))}`);
  const r = resultadoCaixa(d.lancamentos, ini, fim > hoje ? hoje : fim);
  L.push(`- No período: entrou ${brl(r.entradas)}, saiu ${brl(r.saidas)}, resultado ${brl(r.resultado)}`);
  const proj = projecaoCaixa(d, hoje);
  if (proj.saldoConhecido) {
    L.push(`- Projeção 30 dias: menor saldo ${brl(proj.minimo?.saldo ?? 0)} em ${dataBR(proj.minimo?.data)}${proj.primeiroNegativo ? ` · fica negativo em ${dataBR(proj.primeiroNegativo)}` : ""}`);
  }
  L.push("");

  const metas = d.metas.filter((m) => m.status === "ativa");
  if (metas.length) {
    L.push("## Metas");
    for (const m of metas) {
      const p = progressoMeta(m, d, hoje);
      L.push(`- ${m.principal ? "[principal] " : ""}${m.nome} (${NOME_TIPO_META[m.tipo]}): ${brl(p.realizado)} de ${p.alvo === null ? "alvo não informado" : brl(p.alvo)}${p.pct !== null ? ` (${p.pct}%)` : ""} · prazo ${dataBR(m.prazo)} · status: ${p.status}`);
      if (p.necessarioPorSemana !== null) L.push(`  - Ritmo necessário: ${brl(p.necessarioPorSemana)}/semana`);
      if (p.observado) L.push(`  - Ritmo observado: ${p.observado.status === "ok" ? `${brl(p.observado.porSemana ?? 0)}/semana` : "sem base suficiente"}`);
    }
    L.push("");
  }

  const abertas = d.dividas.filter((x) => x.status === "aberta");
  if (abertas.length) {
    L.push("## Dívidas abertas");
    for (const x of abertas) {
      const s = saldoDivida(x, d.lancamentos);
      L.push(`- ${x.credor}${x.titular ? ` (${x.titular})` : ""}: saldo ${brl(s.saldo)} · vence ${dataBR(x.vencimento)}${x.em_atraso_desde ? ` · em atraso desde ${dataBR(x.em_atraso_desde)}` : ""} · juros: ${x.juros_info || "não informado"}`);
    }
    L.push("");
  }

  const comp = compromissosProximos(d, hoje, 14);
  if (comp.length) {
    L.push("## Compromissos dos próximos 14 dias");
    for (const c of comp) L.push(`- ${dataBR(c.data)} · ${c.entrada ? "+" : "−"}${brl(c.valor)} · ${c.titulo}${c.atrasado ? " · ATRASADO" : ""}`);
    L.push("");
  }

  const frentes = d.frentes.filter((f) => f.situacao !== "arquivada");
  if (frentes.length) {
    L.push("## Frentes de renda (últimos 14 dias)");
    for (const f of frentes) {
      const rf = resumoFrente(f, d, ini);
      L.push(`- ${f.nome} [${f.situacao}, prioridade ${f.prioridade}]: recebido ${brl(rf.recebido)}, previsto ${brl(rf.previsto)}, custos ${rf.custosInformados ? brl(rf.custos) : "não lançados"} · próxima: ${rf.proximaTarefa?.titulo ?? f.proxima_oportunidade ?? "—"}`);
    }
    L.push("");
  }

  const feitas = d.tarefas.filter((t) => t.status === "feita" && t.concluida_em && t.concluida_em.slice(0, 10) >= ini);
  const pendentes = d.tarefas.filter((t) => t.status === "aberta");
  L.push("## Execução");
  L.push(`- Tarefas concluídas no período: ${feitas.length}${feitas.length ? ` (${feitas.slice(0, 6).map((t) => t.titulo).join("; ")})` : ""}`);
  L.push(`- Tarefas em aberto: ${pendentes.length}${pendentes.length ? ` (${pendentes.slice(0, 6).map((t) => t.titulo).join("; ")})` : ""}`);
  const rev = [...d.revisoes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (rev) {
    L.push("");
    L.push(`## Última revisão (${dataBR(rev.semana_inicio)}–${dataBR(rev.semana_fim)})`);
    if (rev.funcionou) L.push(`- Funcionou: ${rev.funcionou}`);
    if (rev.obstaculos) L.push(`- Obstáculos: ${rev.obstaculos}`);
    if (rev.mudancas) L.push(`- Mudanças: ${rev.mudancas}`);
    if (rev.resultados_proxima.length) L.push(`- Resultados combinados: ${rev.resultados_proxima.join(" · ")}`);
  }
  L.push("");
  L.push("Pergunta: com base nisso, quais devem ser minhas 3 prioridades na próxima semana?");
  return L.join("\n");
}
