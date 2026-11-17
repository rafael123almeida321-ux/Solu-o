// Dinheiro em centavos inteiros. Nada de float em soma.

/** "1.234,56" | "1234,5" | "1234.56" | "R$ 80" → centavos. Retorna null se não for número válido. */
export function paraCentavos(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") {
    if (!Number.isFinite(texto)) return null;
    return Math.round(texto * 100);
  }
  let s = texto.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!s) return null;
  const negativo = s.startsWith("-");
  if (negativo) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const temVirgula = s.includes(",");
  let inteiro: string;
  let fracao = "";
  if (temVirgula) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    const partes = s.split(",");
    if (partes.length > 2) return null;
    inteiro = partes[0].replace(/\./g, "");
    fracao = partes[1] ?? "";
  } else {
    const pontos = s.split(".");
    // "1.234" (milhar) vs "12.5" (decimal): decimal só se a última parte tiver 1–2 dígitos e houver um único ponto
    if (pontos.length === 2 && pontos[1].length > 0 && pontos[1].length <= 2) {
      inteiro = pontos[0];
      fracao = pontos[1];
    } else {
      inteiro = pontos.join("");
    }
  }
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(fracao) || fracao.length > 2) return null;
  if (!inteiro && !fracao) return null;
  const centavos = Number(inteiro || "0") * 100 + Number((fracao + "00").slice(0, 2));
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

const FMT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FMT_INTEIRO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** centavos → "R$ 1.234,56" (sem centavos quando inteiro, se compacto=true) */
export function brl(centavos: number | null | undefined, compacto = false): string {
  if (centavos === null || centavos === undefined) return "—";
  if (compacto && centavos % 100 === 0) return FMT_INTEIRO.format(centavos / 100);
  return FMT.format(centavos / 100);
}

/** centavos → "1234,56" pra pôr num campo editável */
export function paraCampo(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

export function soma(valores: number[]): number {
  let t = 0;
  for (const v of valores) t += v;
  return t;
}

/** porcentagem inteira segura (0 quando o total é 0) */
export function pct(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((parte / total) * 1000) / 10;
}
