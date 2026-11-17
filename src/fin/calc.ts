// Regras financeiras do CLYENT Comando. Funções puras, sem tela e sem banco — testadas em calc.test.ts.
//
// Convenções (também explicadas na tela):
//  * Saldo de conta: saldo_inicial é o saldo no INÍCIO do dia data_base. Entram todos os lançamentos
//    REALIZADOS com data_pagamento >= data_base. Previsto nunca entra no saldo realizado.
//  * "Caixa" = contas que não são cartão. Cartão guarda a obrigação: compra no cartão é saída do cartão;
//    pagar a fatura é TRANSFERÊNCIA conta → cartão (não é despesa de novo).
//  * Transferência entre contas próprias não é entrada nem saída no consolidado.
//  * Compra parcelada: lance só as parcelas (uma por mês), nunca o valor cheio junto.
//  * Empréstimo recebido = entrada com categoria de natureza "financiamento": entra no caixa, não no faturamento.
//  * Dívida: saldo_informado é o saldo no INÍCIO de data_referencia; pagamentos realizados ligados à dívida
//    com data_pagamento >= data_referencia abatem. Juros não informados não são inventados.
import { soma } from "./dinheiro";
import { difDias, fimMes, inicioMes, inicioSemana, somaDias, somaMeses } from "./datas";
import type { Categoria, Conta, DadosFin, DataISO, Divida, Frente, Lancamento, Marco, Meta, Recorrencia, Tarefa } from "./tipos";

// ------------------------------------------------------------------ saldos

/** efeito de um lançamento REALIZADO no saldo de uma conta específica */
export function efeitoNaConta(l: Lancamento, contaId: string): number {
  if (l.status !== "realizado") return 0;
  if (l.tipo === "entrada") return l.conta_id === contaId ? l.valor_centavos : 0;
  if (l.tipo === "saida") return l.conta_id === contaId ? -l.valor_centavos : 0;
  // transferência
  let e = 0;
  if (l.conta_id === contaId) e -= l.valor_centavos;
  if (l.conta_destino_id === contaId) e += l.valor_centavos;
  return e;
}

export function saldoConta(conta: Conta, lancs: Lancamento[], ate?: DataISO): number {
  const movs = lancs.filter(
    (l) => l.status === "realizado" && l.data_pagamento && l.data_pagamento >= conta.data_base && (!ate || l.data_pagamento <= ate),
  );
  return conta.saldo_inicial_centavos + soma(movs.map((l) => efeitoNaConta(l, conta.id)));
}

export const ehCaixa = (c: Conta) => c.tipo !== "cartao";

/** saldo realizado somando só contas de caixa (sem cartão). Transferências entre elas se anulam. */
export function saldoCaixa(contas: Conta[], lancs: Lancamento[], ate?: DataISO): number {
  return soma(contas.filter(ehCaixa).map((c) => saldoConta(c, lancs, ate)));
}

/** saldo dos cartões (negativo = quanto você deve no cartão) */
export function saldoCartoes(contas: Conta[], lancs: Lancamento[]): number {
  return soma(contas.filter((c) => c.tipo === "cartao").map((c) => saldoConta(c, lancs)));
}

// ------------------------------------------------------------------ resultados

function naturezaDe(l: Lancamento, cats: Map<string, Categoria>) {
  return l.categoria_id ? cats.get(l.categoria_id)?.natureza ?? null : null;
}

function mapaCategorias(categorias: Categoria[]) {
  return new Map(categorias.map((c) => [c.id, c]));
}

const realizadoEntre = (l: Lancamento, inicio: DataISO, fim: DataISO) =>
  l.status === "realizado" && !!l.data_pagamento && l.data_pagamento >= inicio && l.data_pagamento <= fim;

/** Faturamento = entradas REALIZADAS de negócio, sem empréstimo (natureza financiamento) */
export function faturamento(lancs: Lancamento[], categorias: Categoria[], inicio: DataISO, fim: DataISO): number {
  const cats = mapaCategorias(categorias);
  return soma(
    lancs
      .filter((l) => l.tipo === "entrada" && l.escopo === "negocio" && realizadoEntre(l, inicio, fim))
      .filter((l) => naturezaDe(l, cats) !== "financiamento")
      .map((l) => l.valor_centavos),
  );
}

/** Custos do negócio = saídas REALIZADAS de negócio, sem pagamento de dívida/financiamento */
export function custosNegocio(lancs: Lancamento[], categorias: Categoria[], inicio: DataISO, fim: DataISO): number {
  const cats = mapaCategorias(categorias);
  return soma(
    lancs
      .filter((l) => l.tipo === "saida" && l.escopo === "negocio" && realizadoEntre(l, inicio, fim))
      .filter((l) => {
        const n = naturezaDe(l, cats);
        return n !== "divida" && n !== "financiamento";
      })
      .map((l) => l.valor_centavos),
  );
}

/** Lucro do negócio no período = faturamento − custos do negócio */
export function lucro(lancs: Lancamento[], categorias: Categoria[], inicio: DataISO, fim: DataISO): number {
  return faturamento(lancs, categorias, inicio, fim) - custosNegocio(lancs, categorias, inicio, fim);
}

/** Resultado de caixa = tudo que entrou − tudo que saiu (pessoal + negócio), sem transferências */
export function resultadoCaixa(lancs: Lancamento[], inicio: DataISO, fim: DataISO) {
  const r = lancs.filter((l) => realizadoEntre(l, inicio, fim));
  const entradas = soma(r.filter((l) => l.tipo === "entrada").map((l) => l.valor_centavos));
  const saidas = soma(r.filter((l) => l.tipo === "saida").map((l) => l.valor_centavos));
  return { entradas, saidas, resultado: entradas - saidas };
}

// ------------------------------------------------------------------ dívidas

export function pagamentosDivida(d: Divida, lancs: Lancamento[], desde?: DataISO, ate?: DataISO): Lancamento[] {
  const inicio = desde && desde > d.data_referencia ? desde : d.data_referencia;
  return lancs.filter(
    (l) =>
      l.divida_id === d.id &&
      l.status === "realizado" &&
      l.tipo !== "entrada" &&
      !!l.data_pagamento &&
      l.data_pagamento >= inicio &&
      (!ate || l.data_pagamento <= ate),
  );
}

export function saldoDivida(d: Divida, lancs: Lancamento[]) {
  const pago = soma(pagamentosDivida(d, lancs).map((l) => l.valor_centavos));
  const bruto = d.saldo_informado_centavos - pago;
  return {
    pago,
    saldo: Math.max(0, bruto),
    pagoAMais: bruto < 0 ? -bruto : 0,
    jurosInformado: d.juros_info.trim().length > 0,
  };
}

export function dividaEmAtraso(d: Divida, lancs: Lancamento[], hoje: DataISO): boolean {
  if (d.status !== "aberta" || saldoDivida(d, lancs).saldo === 0) return false;
  return !!d.em_atraso_desde || (!!d.vencimento && d.vencimento < hoje);
}

// ------------------------------------------------------------------ meta

export type StatusMeta = "sem_alvo" | "prazo_invalido" | "sem_prazo" | "atingida" | "encerrada" | "em_andamento";

export interface Observado {
  status: "ok" | "sem_base";
  semanasCompletas: number;
  janelaInicio?: DataISO;
  janelaFim?: DataISO;
  porDia?: number;
  porSemana?: number;
  explicacao: string;
}

export interface ProgressoMeta {
  meta: Meta;
  alvo: number | null;
  alvoOrigem: "informado" | "dividas" | "nenhum";
  realizado: number;
  restante: number | null;
  pct: number | null;
  status: StatusMeta;
  diasRestantes: number | null;
  necessarioPorDia: number | null;
  necessarioPorSemana: number | null;
  observado: Observado | null;
  suficiente: boolean | null;
  acumulativa: boolean;
  periodo: { inicio: DataISO; fim: DataISO | null };
  regra: string;
  avisos: string[];
}

export const META_ACUMULATIVA: Record<Meta["tipo"], boolean> = {
  reducao_divida: true,
  reserva: true,
  faturamento_mensal: false,
  lucro_mensal: false,
};

export const NOME_TIPO_META: Record<Meta["tipo"], string> = {
  reducao_divida: "Redução de dívida",
  reserva: "Reserva acumulada",
  faturamento_mensal: "Faturamento do mês",
  lucro_mensal: "Lucro do mês",
};

export function dividasDaMeta(meta: Meta, dividas: Divida[]): Divida[] {
  return dividas.filter((d) => d.goal_id === meta.id && d.status !== "arquivada");
}

/** quanto a meta acumulou entre duas datas (inclusive) — usado pro realizado e pro ritmo observado */
export function acumuladoMetaEntre(meta: Meta, dados: DadosFin, inicio: DataISO, fim: DataISO): number {
  if (meta.tipo === "reducao_divida") {
    return soma(
      dividasDaMeta(meta, dados.dividas).flatMap((d) => pagamentosDivida(d, dados.lancamentos, inicio, fim).map((l) => l.valor_centavos)),
    );
  }
  if (meta.tipo === "reserva") {
    return saldoCaixa(dados.contas, dados.lancamentos, fim) - saldoCaixa(dados.contas, dados.lancamentos, somaDias(inicio, -1));
  }
  return 0;
}

/** semanas completas (seg–dom) entre o início da meta e o último domingo antes de hoje */
export function semanasCompletas(dataBase: DataISO, hoje: DataISO) {
  const primeiraSeg = inicioSemana(dataBase) === dataBase ? dataBase : somaDias(inicioSemana(dataBase), 7);
  const ultimoDom = somaDias(inicioSemana(hoje), -1);
  const dias = difDias(primeiraSeg, ultimoDom) + 1;
  return { n: dias > 0 ? Math.floor(dias / 7) : 0, ultimoDom };
}

export const SEMANAS_MINIMAS = 2;

export function ritmoObservado(meta: Meta, dados: DadosFin, hoje: DataISO): Observado {
  const { n, ultimoDom } = semanasCompletas(meta.data_base, hoje);
  if (n < SEMANAS_MINIMAS) {
    return {
      status: "sem_base",
      semanasCompletas: n,
      explicacao: `Sem base suficiente: ${n} semana(s) completa(s) desde o início da meta. O ritmo observado aparece depois de ${SEMANAS_MINIMAS} semanas completas (seg–dom).`,
    };
  }
  const janelaFim = ultimoDom;
  const janelaInicio = somaDias(ultimoDom, -(SEMANAS_MINIMAS * 7) + 1);
  const total = acumuladoMetaEntre(meta, dados, janelaInicio, janelaFim);
  const dias = SEMANAS_MINIMAS * 7;
  return {
    status: "ok",
    semanasCompletas: n,
    janelaInicio,
    janelaFim,
    porDia: Math.round(total / dias),
    porSemana: Math.round((total / dias) * 7),
    explicacao: `Média das últimas ${SEMANAS_MINIMAS} semanas completas.`,
  };
}

export function progressoMeta(meta: Meta, dados: DadosFin, hoje: DataISO): ProgressoMeta {
  const avisos: string[] = [];
  const acumulativa = META_ACUMULATIVA[meta.tipo];
  let alvo = meta.alvo_centavos && meta.alvo_centavos > 0 ? meta.alvo_centavos : null;
  let alvoOrigem: ProgressoMeta["alvoOrigem"] = alvo ? "informado" : "nenhum";
  let realizado = 0;
  let periodo: ProgressoMeta["periodo"] = { inicio: meta.data_base, fim: meta.prazo };
  let regra = "";

  if (meta.tipo === "reducao_divida") {
    const ds = dividasDaMeta(meta, dados.dividas);
    if (!ds.length) avisos.push("Nenhuma dívida ligada a esta meta — o progresso fica em zero até você ligar as dívidas.");
    if (!alvo && ds.length) {
      alvo = soma(ds.map((d) => d.saldo_informado_centavos));
      alvoOrigem = "dividas";
    }
    realizado = acumuladoMetaEntre(meta, dados, meta.data_base, hoje);
    const semJuros = ds.filter((d) => !d.juros_info.trim());
    if (semJuros.length) avisos.push(`${semJuros.length} dívida(s) sem juros informados: o saldo mostrado é o informado, sem correção.`);
    regra = "Soma dos pagamentos REALIZADOS ligados às dívidas desta meta, desde a data-base. Previsto não conta.";
  } else if (meta.tipo === "reserva") {
    realizado = saldoCaixa(dados.contas, dados.lancamentos) - meta.valor_inicial_centavos;
    if (!dados.contas.some(ehCaixa)) avisos.push("Nenhuma conta de caixa cadastrada — sem saldo para medir a reserva.");
    regra = "Saldo realizado das contas de caixa (sem cartão) menos o valor inicial da meta.";
  } else {
    const ini = inicioMes(hoje);
    const fim = fimMes(hoje);
    periodo = { inicio: ini, fim };
    realizado =
      meta.tipo === "faturamento_mensal"
        ? faturamento(dados.lancamentos, dados.categorias, ini, fim)
        : lucro(dados.lancamentos, dados.categorias, ini, fim);
    regra =
      meta.tipo === "faturamento_mensal"
        ? "Entradas REALIZADAS de negócio neste mês, sem empréstimos. Não soma meses diferentes."
        : "Faturamento do mês menos custos do negócio do mês (pagamento de dívida e empréstimo não entram).";
    const semCat = dados.lancamentos.filter((l) => l.escopo === "negocio" && l.status === "realizado" && !l.categoria_id).length;
    if (semCat) avisos.push(`${semCat} lançamento(s) de negócio sem categoria — confira se algum é empréstimo.`);
  }

  if (meta.regra.trim()) regra = `${regra} Observação: ${meta.regra.trim()}`;

  const base: ProgressoMeta = {
    meta,
    alvo,
    alvoOrigem,
    realizado,
    restante: alvo === null ? null : Math.max(0, alvo - realizado),
    pct: alvo ? Math.min(1000, Math.round((realizado / alvo) * 1000) / 10) : null,
    status: "em_andamento",
    diasRestantes: null,
    necessarioPorDia: null,
    necessarioPorSemana: null,
    observado: null,
    suficiente: null,
    acumulativa,
    periodo,
    regra,
    avisos,
  };

  if (alvo === null) return { ...base, status: "sem_alvo" };
  if (realizado >= alvo) return { ...base, status: "atingida" };

  const prazo = acumulativa ? meta.prazo : periodo.fim;
  if (!prazo) return { ...base, status: "sem_prazo" };
  if (acumulativa && prazo < meta.data_base) return { ...base, status: "prazo_invalido" };
  if (hoje > prazo) return { ...base, status: "encerrada" };

  const diasRestantes = difDias(hoje, prazo) + 1; // conta hoje e o dia do prazo
  base.diasRestantes = diasRestantes;

  if (acumulativa) {
    const restante = base.restante ?? 0;
    base.necessarioPorDia = Math.ceil(restante / diasRestantes);
    base.necessarioPorSemana = Math.ceil((restante / diasRestantes) * 7);
    base.observado = ritmoObservado(meta, dados, hoje);
    if (base.observado.status === "ok" && base.observado.porDia !== undefined) {
      base.suficiente = base.observado.porDia * diasRestantes >= restante;
    }
  }
  return base;
}

// ------------------------------------------------------------------ marcos semanais

export interface LinhaMarco {
  semanaInicio: DataISO;
  semanaFim: DataISO;
  planejado: number | null; // acumulado planejado até o fim da semana
  realizado: number | null; // acumulado realizado até o fim da semana (null = semana futura)
  diferenca: number | null;
  pct: number | null;
  origem: "manual" | "vencimentos" | "linear" | "nenhum";
  nota: string;
}

/** marcos: manuais (se houver) ou automáticos — por vencimento das dívidas (meta de dívida) ou linear */
export function marcosSemanais(meta: Meta, dados: DadosFin, hoje: DataISO): LinhaMarco[] {
  const prog = progressoMeta(meta, dados, hoje);
  if (!META_ACUMULATIVA[meta.tipo] || !meta.prazo || meta.prazo < meta.data_base) return [];
  const manuais = new Map<string, Marco>(dados.marcos.filter((m) => m.goal_id === meta.id).map((m) => [m.semana_inicio, m]));
  const ds = dividasDaMeta(meta, dados.dividas);
  const semanas: DataISO[] = [];
  for (let s = inicioSemana(meta.data_base); s <= meta.prazo; s = somaDias(s, 7)) semanas.push(s);
  const alvo = prog.alvo;

  return semanas.map((ini, i) => {
    const fim = somaDias(ini, 6);
    const corte = fim > meta.prazo! ? meta.prazo! : fim;
    let planejado: number | null = null;
    let origem: LinhaMarco["origem"] = "nenhum";
    let nota = "";
    const manual = manuais.get(ini);
    if (manual) {
      planejado = manual.alvo_acumulado_centavos;
      origem = "manual";
      nota = manual.nota;
    } else if (meta.tipo === "reducao_divida" && ds.length) {
      // compromisso: tudo que vence (ou já venceu) até o fim da semana
      planejado = soma(
        ds.filter((d) => (d.em_atraso_desde ? meta.data_base : d.vencimento ?? meta.prazo!) <= corte).map((d) => d.saldo_informado_centavos),
      );
      if (alvo !== null) planejado = Math.min(planejado, alvo);
      origem = "vencimentos";
    } else if (alvo !== null) {
      planejado = Math.round((alvo * (i + 1)) / semanas.length);
      origem = "linear";
    }
    const futura = ini > hoje;
    const realizado = futura ? null : acumuladoMetaEntre(meta, dados, meta.data_base, corte < hoje ? corte : hoje);
    const diferenca = realizado !== null && planejado !== null ? realizado - planejado : null;
    return {
      semanaInicio: ini,
      semanaFim: fim,
      planejado,
      realizado,
      diferenca,
      pct: realizado !== null && planejado ? Math.round((realizado / planejado) * 1000) / 10 : null,
      origem,
      nota,
    };
  });
}

// ------------------------------------------------------------------ projeção de caixa

export interface ItemProjecao {
  lancamento: Lancamento;
  efeito: number;
  atrasado: boolean;
}
export interface DiaProjecao {
  data: DataISO;
  entradas: number;
  saidas: number;
  saldo: number;
  itens: ItemProjecao[];
}
export interface Projecao {
  saldoInicial: number;
  saldoConhecido: boolean;
  dias: DiaProjecao[];
  primeiroNegativo: DataISO | null;
  minimo: { data: DataISO; saldo: number } | null;
}

/** efeito no CAIXA (contas que não são cartão) de um lançamento previsto */
export function efeitoPrevistoNoCaixa(l: Lancamento, contas: Map<string, Conta>): number {
  const eCaixa = (id: string | null) => id === null || (contas.get(id) ? ehCaixa(contas.get(id)!) : true);
  if (l.tipo === "entrada") return eCaixa(l.conta_id) ? l.valor_centavos : 0;
  if (l.tipo === "saida") return eCaixa(l.conta_id) ? -l.valor_centavos : 0;
  const origem = eCaixa(l.conta_id);
  const destino = eCaixa(l.conta_destino_id);
  if (origem && !destino) return -l.valor_centavos;
  if (!origem && destino) return l.valor_centavos;
  return 0;
}

export function projecaoCaixa(dados: DadosFin, hoje: DataISO, horizonte = 30): Projecao {
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  const saldoConhecido = dados.contas.some(ehCaixa);
  const saldoInicial = saldoConhecido ? saldoCaixa(dados.contas, dados.lancamentos, hoje) : 0;
  const fim = somaDias(hoje, horizonte - 1);
  const porDia = new Map<string, ItemProjecao[]>();
  for (const l of dados.lancamentos) {
    if (l.status !== "previsto" || !l.data_vencimento || l.data_vencimento > fim) continue;
    const atrasado = l.data_vencimento < hoje;
    const dia = atrasado ? hoje : l.data_vencimento;
    const efeito = efeitoPrevistoNoCaixa(l, contas);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push({ lancamento: l, efeito, atrasado });
  }
  const dias: DiaProjecao[] = [];
  let saldo = saldoInicial;
  let primeiroNegativo: DataISO | null = null;
  let minimo: Projecao["minimo"] = null;
  for (let i = 0; i < horizonte; i++) {
    const data = somaDias(hoje, i);
    const itens = porDia.get(data) ?? [];
    const entradas = soma(itens.filter((x) => x.efeito > 0).map((x) => x.efeito));
    const saidas = -soma(itens.filter((x) => x.efeito < 0).map((x) => x.efeito));
    saldo += entradas - saidas;
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = data;
    if (!minimo || saldo < minimo.saldo) minimo = { data, saldo };
    dias.push({ data, entradas, saidas, saldo, itens });
  }
  return { saldoInicial, saldoConhecido, dias, primeiroNegativo, minimo };
}

// ------------------------------------------------------------------ compromissos e alertas

export interface Compromisso {
  tipo: "previsto" | "divida";
  id: string;
  titulo: string;
  data: DataISO | null;
  valor: number;
  atrasado: boolean;
  entrada: boolean;
  lancamento?: Lancamento;
  divida?: Divida;
}

export function compromissosProximos(dados: DadosFin, hoje: DataISO, dias = 14): Compromisso[] {
  const limite = somaDias(hoje, dias);
  const out: Compromisso[] = [];
  const dividasComPrevisto = new Set(
    dados.lancamentos.filter((l) => l.status === "previsto" && l.divida_id).map((l) => l.divida_id as string),
  );
  for (const l of dados.lancamentos) {
    if (l.status !== "previsto" || !l.data_vencimento || l.data_vencimento > limite) continue;
    out.push({
      tipo: "previsto",
      id: l.id,
      titulo: l.descricao,
      data: l.data_vencimento,
      valor: l.valor_centavos,
      atrasado: l.data_vencimento < hoje,
      entrada: l.tipo === "entrada",
      lancamento: l,
    });
  }
  for (const d of dados.dividas) {
    if (d.status !== "aberta" || dividasComPrevisto.has(d.id)) continue;
    const { saldo } = saldoDivida(d, dados.lancamentos);
    if (!saldo) continue;
    const atrasado = dividaEmAtraso(d, dados.lancamentos, hoje);
    if (!atrasado && (!d.vencimento || d.vencimento > limite)) continue;
    out.push({
      tipo: "divida",
      id: d.id,
      titulo: `${d.credor}${d.descricao ? ` — ${d.descricao}` : ""} (sem pagamento previsto lançado)`,
      data: d.vencimento ?? d.em_atraso_desde,
      valor: saldo,
      atrasado,
      entrada: false,
      divida: d,
    });
  }
  return out.sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || (a.data ?? "9999").localeCompare(b.data ?? "9999"));
}

export interface Alerta {
  nivel: "alto" | "medio" | "info";
  texto: string;
  link?: string;
}

export function alertas(dados: DadosFin, hoje: DataISO): Alerta[] {
  const out: Alerta[] = [];
  const vencidos = dados.lancamentos.filter((l) => l.status === "previsto" && l.tipo !== "entrada" && l.data_vencimento && l.data_vencimento < hoje);
  if (vencidos.length) {
    out.push({
      nivel: "alto",
      texto: `${vencidos.length} pagamento(s) previsto(s) vencido(s): ${vencidos.slice(0, 2).map((l) => l.descricao).join(", ")}${vencidos.length > 2 ? "…" : ""}`,
      link: "/caixa?aba=lancamentos&status=previsto",
    });
  }
  const atrasadas = dados.dividas.filter((d) => dividaEmAtraso(d, dados.lancamentos, hoje));
  if (atrasadas.length) {
    out.push({ nivel: "alto", texto: `${atrasadas.length} dívida(s) em atraso: ${atrasadas.map((d) => d.credor).join(", ")}`, link: "/caixa?aba=dividas" });
  }
  const proj = projecaoCaixa(dados, hoje);
  if (proj.saldoConhecido && proj.primeiroNegativo) {
    out.push({ nivel: "alto", texto: `Caixa projetado fica negativo em ${proj.primeiroNegativo.split("-").reverse().slice(0, 2).join("/")}.`, link: "/caixa?aba=projecao" });
  }
  if (!proj.saldoConhecido) {
    out.push({ nivel: "medio", texto: "Saldo atual não informado: cadastre suas contas com o saldo de hoje.", link: "/caixa?aba=contas" });
  }
  const principal = dados.metas.find((m) => m.principal && m.status === "ativa");
  if (principal) {
    const p = progressoMeta(principal, dados, hoje);
    if (p.suficiente === false) out.push({ nivel: "medio", texto: "Pelo ritmo observado, a meta principal não fecha no prazo.", link: "/meta" });
    if (p.status === "encerrada") out.push({ nivel: "medio", texto: "O prazo da meta principal passou sem atingir o alvo. Revise a meta.", link: "/meta" });
  }
  const ultimo = dados.lancamentos.reduce<string | null>((m, l) => (l.updated_at && (!m || l.updated_at > m) ? l.updated_at : m), null);
  if (ultimo && difDias(ultimo.slice(0, 10), hoje) >= 3) {
    out.push({ nivel: "info", texto: "Nenhum lançamento há 3 dias ou mais — registre o que entrou e saiu.", link: "/caixa" });
  }
  return out;
}

// ------------------------------------------------------------------ recorrências

/** gera as ocorrências que faltam até `ate`. Idempotente: não repete (recorrencia_id, seq) já existentes. */
export function ocorrenciasFaltantes(rec: Recorrencia, existentes: Lancamento[], ate: DataISO): Omit<Lancamento, "id">[] {
  if (!rec.ativa) return [];
  const ja = new Set(existentes.filter((l) => l.recorrencia_id === rec.id).map((l) => l.recorrencia_seq));
  const out: Omit<Lancamento, "id">[] = [];
  for (let seq = 0; seq < 500; seq++) {
    const data = rec.frequencia === "mensal" ? somaMeses(rec.inicio, seq) : somaDias(rec.inicio, seq * 7);
    if (data > ate || (rec.fim && data > rec.fim)) break;
    if (ja.has(seq)) continue;
    out.push({
      tipo: rec.tipo,
      status: "previsto",
      valor_centavos: rec.valor_centavos,
      descricao: rec.descricao,
      conta_id: rec.conta_id,
      conta_destino_id: null,
      categoria_id: rec.categoria_id,
      frente_id: rec.frente_id,
      divida_id: rec.divida_id,
      escopo: "pessoal",
      data_competencia: data,
      data_vencimento: data,
      data_pagamento: null,
      confirmacao: "confirmado",
      recorrencia_id: rec.id,
      recorrencia_seq: seq,
      chave_importacao: null,
      notas: "",
    });
  }
  return out;
}

/** liquidar um previsto: altera O MESMO registro (não cria outro) */
export function patchLiquidar(conta_id: string, data_pagamento: DataISO, valor_centavos?: number): Partial<Lancamento> {
  return { status: "realizado", conta_id, data_pagamento, ...(valor_centavos ? { valor_centavos } : {}) };
}

// ------------------------------------------------------------------ prioridades

export interface Pontuacao {
  total: number;
  partes: { rotulo: string; pontos: number }[];
}

/** critérios transparentes: prazo, compromisso, potencial de caixa, esforço e prioridade da frente */
export function pontuarTarefa(t: Tarefa, frentes: Map<string, Frente>, hoje: DataISO): Pontuacao {
  const partes: Pontuacao["partes"] = [];
  if (t.prazo) {
    const d = difDias(hoje, t.prazo);
    const p = d < 0 ? 40 : d === 0 ? 35 : d <= 2 ? 28 : d <= 7 ? 15 : 5;
    partes.push({ rotulo: d < 0 ? "prazo vencido" : d === 0 ? "prazo hoje" : `prazo em ${d} dia(s)`, pontos: p });
  } else partes.push({ rotulo: "sem prazo", pontos: 3 });
  if (t.compromisso) partes.push({ rotulo: "compromisso assumido", pontos: 20 });
  const c = t.potencial_caixa_centavos;
  const pc = c >= 100_000 ? 25 : c >= 30_000 ? 18 : c >= 10_000 ? 10 : c > 0 ? 5 : 0;
  if (pc) partes.push({ rotulo: "potencial de caixa", pontos: pc });
  partes.push({ rotulo: t.esforco === 1 ? "esforço baixo" : t.esforco === 2 ? "esforço médio" : "esforço alto", pontos: t.esforco === 1 ? 10 : t.esforco === 2 ? 5 : 0 });
  const f = t.frente_id ? frentes.get(t.frente_id) : undefined;
  if (f) {
    if (f.situacao === "pausada" || f.situacao === "arquivada") partes.push({ rotulo: `frente ${f.situacao}`, pontos: -30 });
    else partes.push({ rotulo: `prioridade da frente (${f.prioridade})`, pontos: f.prioridade * 2 });
  }
  return { total: soma(partes.map((p) => p.pontos)), partes };
}

/** até 3: primeiro as fixadas pra hoje, depois as de maior pontuação */
export function prioridadesDoDia(tarefas: Tarefa[], frentes: Frente[], hoje: DataISO, n = 3) {
  const mf = new Map(frentes.map((f) => [f.id, f]));
  const abertas = tarefas.filter((t) => t.status === "aberta");
  const fixadas = abertas.filter((t) => t.foco_em === hoje);
  const resto = abertas
    .filter((t) => t.foco_em !== hoje)
    .map((t) => ({ t, p: pontuarTarefa(t, mf, hoje) }))
    .sort((a, b) => b.p.total - a.p.total);
  const lista = [
    ...fixadas.map((t) => ({ tarefa: t, pontuacao: pontuarTarefa(t, mf, hoje), fixada: true })),
    ...resto.map((x) => ({ tarefa: x.t, pontuacao: x.p, fixada: false })),
  ];
  return lista.slice(0, n);
}

// ------------------------------------------------------------------ frentes

export interface ResumoFrente {
  frente: Frente;
  recebido: number;
  previsto: number;
  custos: number;
  resultado: number;
  custosInformados: boolean;
  tarefasAbertas: Tarefa[];
  proximaTarefa: Tarefa | null;
  avisos: string[];
}

export function resumoFrente(f: Frente, dados: DadosFin, desde?: DataISO): ResumoFrente {
  const ls = dados.lancamentos.filter((l) => l.frente_id === f.id && (!desde || (l.data_pagamento ?? l.data_vencimento ?? "") >= desde));
  const recebido = soma(ls.filter((l) => l.tipo === "entrada" && l.status === "realizado").map((l) => l.valor_centavos));
  const previsto = soma(ls.filter((l) => l.tipo === "entrada" && l.status === "previsto").map((l) => l.valor_centavos));
  const custos = soma(ls.filter((l) => l.tipo === "saida" && l.status === "realizado").map((l) => l.valor_centavos));
  const custosInformados = ls.some((l) => l.tipo === "saida");
  const tarefasAbertas = dados.tarefas
    .filter((t) => t.frente_id === f.id && t.status === "aberta")
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
  const avisos: string[] = [];
  if (recebido && !custosInformados) avisos.push("Custos não lançados: o resultado pode estar maior que o real.");
  if (ls.some((l) => l.confirmacao !== "confirmado")) avisos.push("Há valores estimados ou incertos nesta frente.");
  return { frente: f, recebido, previsto, custos, resultado: recebido - custos, custosInformados, tarefasAbertas, proximaTarefa: tarefasAbertas[0] ?? null, avisos };
}
