import { describe, expect, it } from "vitest";
import { brl, paraCampo, paraCentavos } from "./dinheiro";
import { difDias, fimMes, hojeSP, inicioSemana, somaMeses, validaData } from "./datas";
import {
  alertas,
  compromissosProximos,
  faturamento,
  lucro,
  marcosSemanais,
  ocorrenciasFaltantes,
  patchLiquidar,
  prioridadesDoDia,
  progressoMeta,
  projecaoCaixa,
  resultadoCaixa,
  saldoCaixa,
  saldoCartoes,
  saldoConta,
  saldoDivida,
  semanasCompletas,
} from "./calc";
import { montarBackup, validarBackup } from "./backup";
import { resumoParaClaude } from "./resumo";
import { DADOS_VAZIOS, type Categoria, type Conta, type DadosFin, type Divida, type Lancamento, type Meta, type Recorrencia, type Tarefa } from "./tipos";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const conta = (p: Partial<Conta> = {}): Conta => ({
  id: id(), nome: "Nubank", tipo: "conta", escopo: "pessoal", saldo_inicial_centavos: 0, data_base: "2026-11-13", arquivada: false, ...p,
});
const lanc = (p: Partial<Lancamento>): Lancamento => ({
  id: id(), tipo: "saida", status: "realizado", valor_centavos: 1000, descricao: "x", conta_id: null, conta_destino_id: null,
  categoria_id: null, frente_id: null, divida_id: null, escopo: "pessoal", data_competencia: null, data_vencimento: null,
  data_pagamento: "2026-11-14", confirmacao: "confirmado", recorrencia_id: null, recorrencia_seq: null, chave_importacao: null, notas: "", ...p,
});
const divida = (p: Partial<Divida>): Divida => ({
  id: id(), credor: "Itaú", descricao: "", titular: "", saldo_informado_centavos: 80000, data_referencia: "2026-11-13",
  vencimento: null, em_atraso_desde: null, juros_info: "", goal_id: null, status: "aberta", notas: "", ...p,
});
const meta = (p: Partial<Meta>): Meta => ({
  id: id(), nome: "Sair do sufoco", tipo: "reducao_divida", alvo_centavos: null, valor_inicial_centavos: 0, data_base: "2026-11-13",
  prazo: "2026-12-10", escopo: "pessoal", regra: "", principal: true, status: "ativa", versao: 1, ...p,
});
const tarefa = (p: Partial<Tarefa>): Tarefa => ({
  id: id(), titulo: "t", frente_id: null, lead_id: null, proximo_passo: "", resultado_esperado: "", motivo: "", prazo: null,
  tempo_min: null, esforco: 2, potencial_caixa_centavos: 0, compromisso: false, foco_em: null, status: "aberta", concluida_em: null, ...p,
});
const dados = (p: Partial<DadosFin>): DadosFin => ({ ...DADOS_VAZIOS, ...p });

describe("dinheiro", () => {
  it("converte texto brasileiro em centavos sem float", () => {
    expect(paraCentavos("1.234,56")).toBe(123456);
    expect(paraCentavos("R$ 80")).toBe(8000);
    expect(paraCentavos("12,5")).toBe(1250);
    expect(paraCentavos("12.50")).toBe(1250);
    expect(paraCentavos("1.234")).toBe(123400);
    expect(paraCentavos("0,1")).toBe(10);
    expect(paraCentavos("abc")).toBeNull();
    expect(paraCentavos("1,2,3")).toBeNull();
    expect(paraCentavos("")).toBeNull();
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });
  it("formata e volta pro campo", () => {
    expect(brl(123456)).toMatch(/1\.234,56/);
    expect(paraCampo(8005)).toBe("80,05");
    expect(paraCampo(-150)).toBe("-1,50");
  });
});

describe("datas em São Paulo", () => {
  it("usa o dia local de SP, não o UTC", () => {
    // 01:30 UTC de 18/11 ainda é 17/11 em São Paulo (UTC-3)
    expect(hojeSP(new Date("2026-11-18T01:30:00Z"))).toBe("2026-11-17");
  });
  it("aritmética de datas", () => {
    expect(difDias("2026-11-17", "2026-12-10")).toBe(23);
    expect(inicioSemana("2026-11-17")).toBe("2026-11-16");
    expect(inicioSemana("2026-11-22")).toBe("2026-11-16");
    expect(fimMes("2026-02-10")).toBe("2026-02-28");
    expect(somaMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(validaData("2026-02-30")).toBe(false);
  });
});

describe("saldos", () => {
  it("saldo realizado = inicial + movimentos desde a data-base, sem previsto", () => {
    const c = conta({ saldo_inicial_centavos: 5000, data_base: "2026-11-13" });
    const ls = [
      lanc({ tipo: "entrada", conta_id: c.id, valor_centavos: 26000, data_pagamento: "2026-11-13" }),
      lanc({ tipo: "saida", conta_id: c.id, valor_centavos: 14000, data_pagamento: "2026-11-14" }),
      lanc({ tipo: "saida", conta_id: c.id, valor_centavos: 99999, data_pagamento: "2026-11-12" }), // antes da data-base: já está no saldo inicial
      lanc({ tipo: "entrada", status: "previsto", conta_id: c.id, valor_centavos: 125000, data_pagamento: null, data_vencimento: "2026-12-01" }),
    ];
    expect(saldoConta(c, ls)).toBe(5000 + 26000 - 14000);
  });

  it("transferência entre contas próprias não muda o consolidado", () => {
    const a = conta({ saldo_inicial_centavos: 10000 });
    const b = conta({ nome: "Carteira", tipo: "carteira" });
    const ls = [lanc({ tipo: "transferencia", conta_id: a.id, conta_destino_id: b.id, valor_centavos: 4000 })];
    expect(saldoConta(a, ls)).toBe(6000);
    expect(saldoConta(b, ls)).toBe(4000);
    expect(saldoCaixa([a, b], ls)).toBe(10000);
    expect(resultadoCaixa(ls, "2026-11-01", "2026-11-30").resultado).toBe(0);
  });

  it("cartão: compra é despesa uma vez; pagar a fatura é transferência", () => {
    const corrente = conta({ saldo_inicial_centavos: 50000 });
    const cartao = conta({ nome: "Cartão", tipo: "cartao" });
    const ls = [
      lanc({ tipo: "saida", conta_id: cartao.id, valor_centavos: 20000, descricao: "compra" }),
      lanc({ tipo: "transferencia", conta_id: corrente.id, conta_destino_id: cartao.id, valor_centavos: 20000, descricao: "pagamento fatura" }),
    ];
    expect(saldoCartoes([corrente, cartao], ls)).toBe(0);
    expect(saldoCaixa([corrente, cartao], ls)).toBe(30000);
    const r = resultadoCaixa(ls, "2026-11-01", "2026-11-30");
    expect(r.saidas).toBe(20000); // não conta 40.000
  });
});

describe("faturamento x lucro x empréstimo", () => {
  const catEmprestimo: Categoria = { id: id(), nome: "Empréstimo", tipo: "entrada", natureza: "financiamento", escopo: "pessoal", arquivada: false };
  const catVenda: Categoria = { id: id(), nome: "Venda", tipo: "entrada", natureza: "operacional", escopo: "negocio", arquivada: false };
  const catCusto: Categoria = { id: id(), nome: "Estoque", tipo: "saida", natureza: "operacional", escopo: "negocio", arquivada: false };
  const ls = [
    lanc({ tipo: "entrada", escopo: "negocio", categoria_id: catVenda.id, valor_centavos: 42000 }),
    lanc({ tipo: "entrada", escopo: "negocio", categoria_id: catEmprestimo.id, valor_centavos: 100000 }),
    lanc({ tipo: "saida", escopo: "negocio", categoria_id: catCusto.id, valor_centavos: 14000 }),
  ];
  const cats = [catEmprestimo, catVenda, catCusto];
  it("empréstimo recebido não é faturamento", () => {
    expect(faturamento(ls, cats, "2026-11-01", "2026-11-30")).toBe(42000);
    expect(lucro(ls, cats, "2026-11-01", "2026-11-30")).toBe(28000);
  });
});

describe("dívidas", () => {
  it("abate só pagamentos realizados desde a referência e não inventa juros", () => {
    const d = divida({ saldo_informado_centavos: 80000 });
    const ls = [
      lanc({ divida_id: d.id, valor_centavos: 20000, data_pagamento: "2026-11-14" }),
      lanc({ divida_id: d.id, valor_centavos: 5000, data_pagamento: "2026-11-10" }), // antes da referência
      lanc({ divida_id: d.id, status: "previsto", valor_centavos: 60000, data_pagamento: null, data_vencimento: "2026-12-01" }),
    ];
    const s = saldoDivida(d, ls);
    expect(s.saldo).toBe(60000);
    expect(s.jurosInformado).toBe(false);
  });
});

describe("meta principal (redução de dívida)", () => {
  const m = meta({});
  const d1 = divida({ goal_id: m.id, saldo_informado_centavos: 80000, em_atraso_desde: "2026-11-01" });
  const d2 = divida({ goal_id: m.id, credor: "Empréstimo", saldo_informado_centavos: 66000, vencimento: "2026-12-03" });

  it("sem pagamentos: alvo vem das dívidas e o ritmo necessário é calculado", () => {
    const p = progressoMeta(m, dados({ metas: [m], dividas: [d1, d2] }), "2026-11-17");
    expect(p.alvo).toBe(146000);
    expect(p.alvoOrigem).toBe("dividas");
    expect(p.realizado).toBe(0);
    expect(p.diasRestantes).toBe(24);
    expect(p.necessarioPorDia).toBe(Math.ceil(146000 / 24));
    expect(p.observado?.status).toBe("sem_base");
    expect(p.suficiente).toBeNull();
  });

  it("previsto não conta; realizado conta", () => {
    const ls = [
      lanc({ divida_id: d1.id, valor_centavos: 30000, data_pagamento: "2026-11-15" }),
      lanc({ divida_id: d2.id, status: "previsto", data_pagamento: null, data_vencimento: "2026-12-03", valor_centavos: 66000 }),
    ];
    const p = progressoMeta(m, dados({ metas: [m], dividas: [d1, d2], lancamentos: ls }), "2026-11-17");
    expect(p.realizado).toBe(30000);
    expect(p.restante).toBe(116000);
  });

  it("meta sem dados (sem alvo e sem dívidas)", () => {
    const vazia = meta({ alvo_centavos: null });
    const p = progressoMeta(vazia, dados({ metas: [vazia] }), "2026-11-17");
    expect(p.status).toBe("sem_alvo");
    expect(p.necessarioPorDia).toBeNull();
    expect(p.avisos.length).toBeGreaterThan(0);
  });

  it("prazo encerrado e prazo inválido", () => {
    const enc = meta({ alvo_centavos: 1000, prazo: "2026-11-10", data_base: "2026-11-01" });
    expect(progressoMeta(enc, dados({ metas: [enc] }), "2026-11-17").status).toBe("encerrada");
    const inv = meta({ alvo_centavos: 1000, prazo: "2026-10-01", data_base: "2026-11-01" });
    expect(progressoMeta(inv, dados({ metas: [inv] }), "2026-10-15").status).toBe("prazo_invalido");
  });

  it("meta atingida", () => {
    const ok = meta({ alvo_centavos: 1000 });
    const d = divida({ goal_id: ok.id, saldo_informado_centavos: 1000 });
    const p = progressoMeta(ok, dados({ metas: [ok], dividas: [d], lancamentos: [lanc({ divida_id: d.id, valor_centavos: 1000 })] }), "2026-11-17");
    expect(p.status).toBe("atingida");
    expect(p.restante).toBe(0);
  });

  it("ritmo observado só com 2 semanas completas", () => {
    expect(semanasCompletas("2026-11-13", "2026-11-17").n).toBe(0);
    expect(semanasCompletas("2026-11-13", "2026-11-30").n).toBe(2);
    const ls = [lanc({ divida_id: d1.id, valor_centavos: 14000, data_pagamento: "2026-11-20" })];
    const p = progressoMeta(m, dados({ metas: [m], dividas: [d1, d2], lancamentos: ls }), "2026-11-30");
    expect(p.observado?.status).toBe("ok");
    expect(p.observado?.porDia).toBe(1000);
    expect(p.suficiente).toBe(false);
  });

  it("marcos semanais por vencimento", () => {
    const linhas = marcosSemanais(m, dados({ metas: [m], dividas: [d1, d2] }), "2026-11-17");
    expect(linhas[0].semanaInicio).toBe("2026-11-09");
    expect(linhas[0].planejado).toBe(80000); // atrasada entra na 1ª semana
    const semana3 = linhas.find((l) => l.semanaInicio === "2026-11-30")!;
    expect(semana3.planejado).toBe(146000);
    expect(semana3.realizado).toBeNull(); // semana futura
  });
});

describe("meta mensal não acumula meses", () => {
  it("faturamento do mês olha só o mês corrente", () => {
    const m = meta({ tipo: "faturamento_mensal", alvo_centavos: 2_000_000, prazo: null, principal: false });
    const ls = [
      lanc({ tipo: "entrada", escopo: "negocio", valor_centavos: 500000, data_pagamento: "2026-10-20" }),
      lanc({ tipo: "entrada", escopo: "negocio", valor_centavos: 100000, data_pagamento: "2026-11-05" }),
    ];
    const p = progressoMeta(m, dados({ lancamentos: ls }), "2026-11-17");
    expect(p.realizado).toBe(100000);
    expect(p.necessarioPorDia).toBeNull();
    expect(p.periodo.fim).toBe("2026-11-30");
  });
});

describe("projeção e compromissos", () => {
  it("marca o dia em que o caixa fica negativo e põe atrasados em hoje", () => {
    const c = conta({ saldo_inicial_centavos: 10000 });
    const ls = [
      lanc({ status: "previsto", tipo: "saida", valor_centavos: 5000, data_pagamento: null, data_vencimento: "2026-11-10", descricao: "atrasado" }),
      lanc({ status: "previsto", tipo: "saida", valor_centavos: 66000, data_pagamento: null, data_vencimento: "2026-12-03", descricao: "empréstimo" }),
      lanc({ status: "previsto", tipo: "entrada", valor_centavos: 30000, data_pagamento: null, data_vencimento: "2026-11-20" }),
    ];
    const p = projecaoCaixa(dados({ contas: [c], lancamentos: ls }), "2026-11-17");
    expect(p.dias[0].saidas).toBe(5000);
    expect(p.dias[0].itens[0].atrasado).toBe(true);
    expect(p.primeiroNegativo).toBe("2026-12-03");
    expect(p.minimo?.saldo).toBe(10000 - 5000 + 30000 - 66000);
  });

  it("sem conta cadastrada o saldo inicial é desconhecido, não zero disfarçado", () => {
    const p = projecaoCaixa(dados({}), "2026-11-17");
    expect(p.saldoConhecido).toBe(false);
    expect(alertas(dados({}), "2026-11-17").some((a) => a.texto.includes("não informado"))).toBe(true);
  });

  it("dívida vencendo sem pagamento previsto aparece; com previsto não duplica", () => {
    const d = divida({ vencimento: "2026-12-01", saldo_informado_centavos: 55000 });
    const sem = compromissosProximos(dados({ dividas: [d] }), "2026-11-20");
    expect(sem).toHaveLength(1);
    const prev = lanc({ status: "previsto", divida_id: d.id, data_pagamento: null, data_vencimento: "2026-12-01", valor_centavos: 55000 });
    const com = compromissosProximos(dados({ dividas: [d], lancamentos: [prev] }), "2026-11-20");
    expect(com).toHaveLength(1);
    expect(com[0].tipo).toBe("previsto");
  });
});

describe("recorrência idempotente e liquidação sem duplicar", () => {
  const rec: Recorrencia = {
    id: id(), descricao: "Mesada", tipo: "entrada", valor_centavos: 40000, conta_id: null, categoria_id: null, frente_id: null,
    divida_id: null, frequencia: "mensal", inicio: "2026-11-05", fim: null, ativa: true,
  };
  it("rodar duas vezes não duplica", () => {
    const primeira = ocorrenciasFaltantes(rec, [], "2027-01-31");
    expect(primeira.map((o) => o.data_vencimento)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
    const salvas = primeira.map((o) => ({ ...o, id: id() }) as Lancamento);
    expect(ocorrenciasFaltantes(rec, salvas, "2027-01-31")).toHaveLength(0);
    expect(ocorrenciasFaltantes(rec, salvas, "2027-02-28")).toHaveLength(1);
  });
  it("liquidar altera o mesmo registro", () => {
    const p = patchLiquidar("conta-1", "2026-11-17");
    expect(p).toEqual({ status: "realizado", conta_id: "conta-1", data_pagamento: "2026-11-17" });
    expect("id" in p).toBe(false);
  });
});

describe("prioridades do dia", () => {
  it("fixadas primeiro, depois pontuação transparente", () => {
    const a = tarefa({ titulo: "fixada", foco_em: "2026-11-17" });
    const b = tarefa({ titulo: "vence hoje com caixa", prazo: "2026-11-17", potencial_caixa_centavos: 75000, compromisso: true });
    const c = tarefa({ titulo: "sem prazo", esforco: 3 });
    const d = tarefa({ titulo: "feita", status: "feita", prazo: "2026-11-10" });
    const p = prioridadesDoDia([c, b, a, d], [], "2026-11-17");
    expect(p.map((x) => x.tarefa.titulo)).toEqual(["fixada", "vence hoje com caixa", "sem prazo"]);
    expect(p[1].pontuacao.partes.map((x) => x.rotulo)).toContain("compromisso assumido");
  });
});

describe("backup", () => {
  const c = conta({});
  const m = meta({});
  const d = divida({ goal_id: m.id });
  const base = dados({ contas: [c], metas: [m], dividas: [d], lancamentos: [lanc({ conta_id: c.id, divida_id: d.id })] });

  it("ida e volta valida", () => {
    const b = JSON.parse(JSON.stringify(montarBackup(base)));
    const v = validarBackup(b);
    expect(v.ok).toBe(true);
    expect(v.contagens.lancamentos).toBe(1);
  });
  it("recusa outro esquema, versão futura, referência quebrada e centavos com vírgula", () => {
    expect(validarBackup({ esquema: "outro" }).ok).toBe(false);
    const b = montarBackup(base);
    expect(validarBackup({ ...b, versao_esquema: 99 }).erros.join()).toMatch(/mais nova/);
    const quebrado = JSON.parse(JSON.stringify(b));
    quebrado.dados.lancamentos[0].conta_id = "00000000-0000-4000-8000-999999999999";
    quebrado.dados.dividas[0].saldo_informado_centavos = 800.5;
    const v = validarBackup(quebrado);
    expect(v.ok).toBe(false);
    expect(v.erros.join()).toMatch(/aponta/);
    expect(v.erros.join()).toMatch(/centavos inteiros/);
  });
});

describe("resumo para o Claude", () => {
  it("não vaza ids", () => {
    const c = conta({ saldo_inicial_centavos: 1000 });
    const texto = resumoParaClaude(dados({ contas: [c] }), "2026-11-17");
    expect(texto).toContain("Saldo de caixa");
    expect(texto).not.toContain(c.id);
  });
});
