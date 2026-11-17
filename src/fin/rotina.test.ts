import { describe, expect, it } from "vitest";
import { agendaDoDia, agoraMinSP, blocosDoDia, placarDoDia, progressoMetaPessoal, sequenciaHabito } from "./rotina";
import type { Bloco, Medida, MetaPessoal, RegistroRotina } from "./tipos";

const bloco = (p: Partial<Bloco>): Bloco => ({
  id: p.id ?? Math.random().toString(), titulo: "x", dias: [1, 2, 3, 4, 5], inicio: "06:30:00", fim: "08:00:00", categoria: "treino",
  habito: "", detalhe: "", frente_id: null, ativo: true, ...p,
});
const reg = (p: Partial<RegistroRotina>): RegistroRotina => ({ id: Math.random().toString(), data: "2026-11-17", bloco_id: null, titulo: "", habito: "", status: "feito", nota: "", ...p });
const metaP = (p: Partial<MetaPessoal>): MetaPessoal => ({
  id: "m", nome: "Peso", area: "corpo", tipo: "numero", metrica: "peso", unidade: "kg", valor_inicial: 83, alvo: 93, direcao: "subir",
  habito: "", vezes_semana: null, data_inicio: "2026-10-30", prazo: "2026-12-30", status: "ativa", notas: "", ...p,
});
const med = (data: string, valor: number): Medida => ({ id: data, data, metrica: "peso", valor, nota: "" });

describe("agenda", () => {
  const a = bloco({ id: "a", titulo: "Basquete", inicio: "06:30", fim: "08:00", habito: "basquete" });
  const b = bloco({ id: "b", titulo: "Ligações", inicio: "09:00", fim: "11:30", categoria: "venda" });
  const s = bloco({ id: "s", titulo: "Brigadeiro", dias: [5, 6], inicio: "10:00", fim: "18:00" });
  it("filtra pelo dia da semana e ordena por horário", () => {
    expect(blocosDoDia([b, s, a], "2026-11-17").map((x) => x.id)).toEqual(["a", "b"]); // terça
    expect(blocosDoDia([b, s, a], "2026-11-20").map((x) => x.id)).toEqual(["a", "b", "s"]); // sexta
  });
  it("marca passado / agora / futuro e casa os registros", () => {
    const ag = agendaDoDia([a, b], [reg({ bloco_id: "a" })], "2026-11-17", "2026-11-17", 9 * 60 + 15);
    expect(ag.map((i) => i.estado)).toEqual(["passado", "agora"]);
    expect(ag[0].registro?.status).toBe("feito");
    expect(placarDoDia(ag)).toEqual({ total: 2, feitos: 1, parciais: 0, pendentesPassados: 0 });
  });
  it("hora em São Paulo", () => {
    expect(agoraMinSP(new Date("2026-11-17T12:30:00Z"))).toBe(9 * 60 + 30);
  });
});

describe("metas pessoais", () => {
  it("peso: progresso do inicial ao alvo e ritmo com 2 medidas", () => {
    const p = progressoMetaPessoal(metaP({}), [med("2026-10-30", 83), med("2026-11-13", 85)], [], "2026-11-17");
    expect(p.atual).toBe(85);
    expect(p.falta).toBe(8);
    expect(p.pct).toBe(20);
    expect(p.ritmo?.porSemana).toBe(1);
    expect(p.ritmo?.necessarioPorSemana).toBeGreaterThan(1);
  });
  it("sem medida = sem dados (não zero)", () => {
    expect(progressoMetaPessoal(metaP({}), [], [], "2026-11-17").status).toBe("sem_dados");
  });
  it("hábito conta a semana (pulado não conta)", () => {
    const m = metaP({ tipo: "habito", habito: "basquete", vezes_semana: 5 });
    const regs = [
      reg({ data: "2026-11-16", habito: "basquete" }),
      reg({ data: "2026-11-17", habito: "basquete", status: "parcial" }),
      reg({ data: "2026-11-15", habito: "basquete" }), // semana passada
      reg({ data: "2026-11-17", habito: "basquete", status: "pulado", bloco_id: "z" }),
    ];
    const p = progressoMetaPessoal(m, [], regs, "2026-11-17");
    expect(p.semana?.feitos).toBe(2);
    expect(p.falta).toBe(3);
    expect(sequenciaHabito(regs, "basquete", "2026-11-17")).toBe(3);
  });
});
