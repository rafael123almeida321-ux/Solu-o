// Datas de calendário como texto "AAAA-MM-DD", sempre no fuso de São Paulo.
// A aritmética usa UTC só como régua (meio-dia), então não há salto de fuso/horário de verão.
import type { DataISO } from "./tipos";

export const FUSO = "America/Sao_Paulo";

const fmtISO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** hoje em São Paulo (ou a data local SP de um instante) */
export function hojeSP(agora: Date = new Date()): DataISO {
  return fmtISO.format(agora);
}

function paraUTC(d: DataISO): number {
  const [a, m, dia] = d.split("-").map(Number);
  return Date.UTC(a, m - 1, dia, 12);
}

function deUTC(ms: number): DataISO {
  return new Date(ms).toISOString().slice(0, 10);
}

export function validaData(d: unknown): d is DataISO {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return deUTC(paraUTC(d)) === d;
}

export function somaDias(d: DataISO, n: number): DataISO {
  return deUTC(paraUTC(d) + n * 86_400_000);
}

/** b − a em dias inteiros */
export function difDias(a: DataISO, b: DataISO): number {
  return Math.round((paraUTC(b) - paraUTC(a)) / 86_400_000);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(d: DataISO): number {
  return new Date(paraUTC(d)).getUTCDay();
}

/** segunda-feira da semana de d */
export function inicioSemana(d: DataISO): DataISO {
  const w = diaDaSemana(d);
  return somaDias(d, w === 0 ? -6 : 1 - w);
}

export function fimSemana(d: DataISO): DataISO {
  return somaDias(inicioSemana(d), 6);
}

export function inicioMes(d: DataISO): DataISO {
  return `${d.slice(0, 7)}-01`;
}

export function fimMes(d: DataISO): DataISO {
  const [a, m] = d.split("-").map(Number);
  return deUTC(Date.UTC(a, m, 0, 12));
}

export function somaMeses(d: DataISO, n: number): DataISO {
  const [a, m, dia] = d.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1, 12));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return deUTC(alvo.getTime());
}

export function entre(d: DataISO, inicio: DataISO, fim: DataISO): boolean {
  return d >= inicio && d <= fim;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "17 nov" ou "ter, 17 nov" */
export function dataCurta(d: DataISO | null | undefined, comSemana = false): string {
  if (!d) return "—";
  const [, m, dia] = d.split("-").map(Number);
  const base = `${dia} ${MESES[m - 1]}`;
  return comSemana ? `${SEMANA[diaDaSemana(d)]}, ${base}` : base;
}

export function dataBR(d: DataISO | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}
