// Exportação (JSON completo e CSV) e validação de backup antes de restaurar.
import { paraCampo } from "./dinheiro";
import { validaData } from "./datas";
import type { DadosFin } from "./tipos";

export const ESQUEMA = "clyent-comando";
export const VERSAO_ESQUEMA = 1;

export interface Backup {
  esquema: typeof ESQUEMA;
  versao_esquema: number;
  exportado_em: string;
  dados: {
    settings: unknown[];
    contas: unknown[];
    categorias: unknown[];
    frentes: unknown[];
    metas: unknown[];
    historico_metas: unknown[];
    marcos: unknown[];
    dividas: unknown[];
    recorrencias: unknown[];
    lancamentos: unknown[];
    tarefas: unknown[];
    revisoes: unknown[];
  };
}

export function montarBackup(d: DadosFin, agora = new Date()): Backup {
  return {
    esquema: ESQUEMA,
    versao_esquema: VERSAO_ESQUEMA,
    exportado_em: agora.toISOString(),
    dados: {
      settings: d.ajustes ? [d.ajustes] : [],
      contas: d.contas,
      categorias: d.categorias,
      frentes: d.frentes,
      metas: d.metas,
      historico_metas: d.historicoMetas,
      marcos: d.marcos,
      dividas: d.dividas,
      recorrencias: d.recorrencias,
      lancamentos: d.lancamentos,
      tarefas: d.tarefas,
      revisoes: d.revisoes,
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;

export interface Validacao {
  ok: boolean;
  erros: string[];
  avisos: string[];
  contagens: Record<string, number>;
}

const REGRAS: Record<string, { obrigatorios: string[]; centavos?: string[]; datas?: string[]; refs?: [string, string][] }> = {
  contas: { obrigatorios: ["id", "nome", "tipo", "data_base"], centavos: ["saldo_inicial_centavos"], datas: ["data_base"] },
  categorias: { obrigatorios: ["id", "nome", "tipo", "natureza"] },
  frentes: { obrigatorios: ["id", "nome", "situacao"] },
  metas: { obrigatorios: ["id", "nome", "tipo", "data_base"], datas: ["data_base", "prazo"] },
  historico_metas: { obrigatorios: ["goal_id", "versao", "dados"], refs: [["goal_id", "metas"]] },
  marcos: { obrigatorios: ["id", "goal_id", "semana_inicio"], centavos: ["alvo_acumulado_centavos"], datas: ["semana_inicio"], refs: [["goal_id", "metas"]] },
  dividas: {
    obrigatorios: ["id", "credor", "saldo_informado_centavos", "data_referencia"],
    centavos: ["saldo_informado_centavos"],
    datas: ["data_referencia", "vencimento", "em_atraso_desde"],
    refs: [["goal_id", "metas"]],
  },
  recorrencias: {
    obrigatorios: ["id", "descricao", "tipo", "valor_centavos", "inicio"],
    centavos: ["valor_centavos"],
    datas: ["inicio", "fim"],
    refs: [["conta_id", "contas"], ["categoria_id", "categorias"], ["frente_id", "frentes"], ["divida_id", "dividas"]],
  },
  lancamentos: {
    obrigatorios: ["id", "tipo", "status", "valor_centavos", "descricao"],
    centavos: ["valor_centavos"],
    datas: ["data_competencia", "data_vencimento", "data_pagamento"],
    refs: [
      ["conta_id", "contas"],
      ["conta_destino_id", "contas"],
      ["categoria_id", "categorias"],
      ["frente_id", "frentes"],
      ["divida_id", "dividas"],
      ["recorrencia_id", "recorrencias"],
    ],
  },
  tarefas: { obrigatorios: ["id", "titulo", "status"], centavos: ["potencial_caixa_centavos"], datas: ["prazo", "foco_em"], refs: [["frente_id", "frentes"]] },
  revisoes: { obrigatorios: ["id", "semana_inicio", "semana_fim", "created_at"], datas: ["semana_inicio", "semana_fim"], refs: [["corrige_id", "revisoes"]] },
};

export function validarBackup(entrada: unknown): Validacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const contagens: Record<string, number> = {};
  const b = entrada as Obj;
  if (!b || typeof b !== "object") return { ok: false, erros: ["O arquivo não é um JSON de backup."], avisos, contagens };
  if (b.esquema !== ESQUEMA) erros.push("Este arquivo não é um backup do CLYENT Comando.");
  const versao = Number(b.versao_esquema);
  if (!Number.isInteger(versao)) erros.push("Backup sem versão de esquema.");
  else if (versao > VERSAO_ESQUEMA) erros.push(`Backup de uma versão mais nova do app (${versao}). Atualize o app antes de restaurar.`);
  else if (versao < VERSAO_ESQUEMA) erros.push(`Backup da versão ${versao}, que este app não sabe converter.`);
  const d = b.dados as Obj | undefined;
  if (!d || typeof d !== "object") {
    erros.push("Backup sem a seção de dados.");
    return { ok: false, erros, avisos, contagens };
  }

  const ids: Record<string, Set<string>> = {};
  for (const tabela of Object.keys(REGRAS)) {
    const linhas = d[tabela];
    if (linhas === undefined) {
      avisos.push(`Seção "${tabela}" ausente — será restaurada vazia.`);
      ids[tabela] = new Set();
      contagens[tabela] = 0;
      continue;
    }
    if (!Array.isArray(linhas)) {
      erros.push(`Seção "${tabela}" inválida.`);
      continue;
    }
    contagens[tabela] = linhas.length;
    ids[tabela] = new Set(linhas.map((l) => String((l as Obj)?.id ?? "")));
  }
  if (d.settings !== undefined && !Array.isArray(d.settings)) erros.push('Seção "settings" inválida.');

  for (const [tabela, regra] of Object.entries(REGRAS)) {
    const linhas = d[tabela];
    if (!Array.isArray(linhas)) continue;
    const vistos = new Set<string>();
    linhas.forEach((bruta, i) => {
      const l = bruta as Obj;
      const onde = `${tabela}[${i + 1}]`;
      if (!l || typeof l !== "object") return void erros.push(`${onde}: registro inválido.`);
      for (const c of regra.obrigatorios) if (l[c] === undefined || l[c] === null || l[c] === "") erros.push(`${onde}: falta "${c}".`);
      if (l.id !== undefined) {
        if (tabela !== "historico_metas" && !UUID.test(String(l.id))) erros.push(`${onde}: id inválido.`);
        if (vistos.has(String(l.id))) erros.push(`${onde}: id repetido.`);
        vistos.add(String(l.id));
      }
      for (const c of regra.centavos ?? []) {
        if (l[c] !== undefined && l[c] !== null && !Number.isSafeInteger(Number(l[c]))) erros.push(`${onde}: "${c}" precisa ser centavos inteiros.`);
      }
      for (const c of regra.datas ?? []) {
        if (l[c] !== undefined && l[c] !== null && !validaData(l[c])) erros.push(`${onde}: data "${c}" inválida.`);
      }
      for (const [campo, alvo] of regra.refs ?? []) {
        const v = l[campo];
        if (v !== undefined && v !== null && !ids[alvo]?.has(String(v))) erros.push(`${onde}: "${campo}" aponta para um registro que não está no backup.`);
      }
    });
  }
  return { ok: erros.length === 0, erros: erros.slice(0, 50), avisos, contagens };
}

export function csvLancamentos(d: DadosFin): string {
  const conta = new Map(d.contas.map((c) => [c.id, c.nome]));
  const cat = new Map(d.categorias.map((c) => [c.id, c.nome]));
  const frente = new Map(d.frentes.map((f) => [f.id, f.nome]));
  const div = new Map(d.dividas.map((x) => [x.id, x.credor]));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ["id", "tipo", "status", "valor", "descricao", "conta", "conta_destino", "categoria", "frente", "divida", "escopo", "competencia", "vencimento", "pagamento", "confirmacao", "notas"];
  const linhas = d.lancamentos.map((l) => [
    l.id,
    l.tipo,
    l.status,
    paraCampo(l.valor_centavos),
    l.descricao,
    l.conta_id ? conta.get(l.conta_id) : "",
    l.conta_destino_id ? conta.get(l.conta_destino_id) : "",
    l.categoria_id ? cat.get(l.categoria_id) : "",
    l.frente_id ? frente.get(l.frente_id) : "",
    l.divida_id ? div.get(l.divida_id) : "",
    l.escopo,
    l.data_competencia,
    l.data_vencimento,
    l.data_pagamento,
    l.confirmacao,
    l.notas,
  ]);
  // separador ";" e BOM: abre certo no Excel em português
  return "﻿" + [cab, ...linhas].map((r) => r.map(esc).join(";")).join("\n");
}
