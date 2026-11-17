export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

export const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const meses = Math.round(d / 30);
  return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

/** dias úteis (seg–sex) passados desde a data */
export function diasUteisDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  const inicio = new Date(iso);
  const hoje = new Date();
  let dias = 0;
  const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  while (d < fim) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) dias++;
  }
  return dias;
}

export type Faixa = "quente" | "morno" | "frio";
export const faixaTemp = (t: number): Faixa => (t >= 70 ? "quente" : t >= 40 ? "morno" : "frio");
export const FAIXA_INFO: Record<Faixa, { label: string; emoji: string; cor: string }> = {
  quente: { label: "Quente", emoji: "🔥", cor: "#FF4D3D" },
  morno: { label: "Morno", emoji: "🌤️", cor: "#FFB020" },
  frio: { label: "Frio", emoji: "❄️", cor: "#4CC2FF" },
};

/** cor contínua do termômetro (azul → âmbar → vermelho) */
export function corTemp(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [76, 194, 255]],
    [40, [120, 200, 220]],
    [55, [255, 176, 32]],
    [75, [255, 110, 50]],
    [100, [255, 61, 61]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(255,61,61)";
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function waLink(numero: string | null | undefined, texto?: string) {
  let d = soDigitos(numero);
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export const telLink = (numero: string | null | undefined) => (soDigitos(numero) ? `tel:${soDigitos(numero)}` : null);

export function instaLink(h: string | null | undefined) {
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return `https://instagram.com/${h.replace(/^@/, "").trim()}`;
}

export function urlLink(u: string | null | undefined) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function mapsLink(lat: number | null | undefined, lng: number | null | undefined, endereco?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  return null;
}

export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

const PALETA_AVATAR = ["#39FF14", "#4CC2FF", "#FFB020", "#FF4D3D", "#B07CFF", "#2ED3C6", "#FF7AB6", "#C6FF3D"];
export function corAvatar(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_AVATAR[h % PALETA_AVATAR.length];
}

export type StatusFollowup = "atrasado" | "hoje" | "futuro" | null;
export function statusFollowup(iso: string | null | undefined): StatusFollowup {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date();
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (d < inicioHoje) return "atrasado";
  if (d <= fimHoje) return d < hoje ? "atrasado" : "hoje";
  return "futuro";
}

/** Date → valor de <input type="datetime-local"> */
export function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daquiDias(dias: number, hora = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return toLocalInput(d);
}

export const inicioDaSemana = () => {
  const d = new Date();
  const dia = (d.getDay() + 6) % 7; // segunda = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dia);
  return d;
};
export const inicioDoMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
export const inicioDoAno = () => new Date(new Date().getFullYear(), 0, 1);

export function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function vibrar(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem vibração */
  }
}

export function erroMsg(e: unknown): string {
  if (!e) return "Algo deu errado.";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message ?? String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem conexão com a internet.";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (/User already registered/i.test(m)) return "Esse e-mail já tem conta. Use \"Entrar\".";
  if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/JWT|token/i.test(m) && /expired/i.test(m)) return "Sua sessão expirou. Entre de novo.";
  return m;
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(linhas: (string | number | null | undefined)[][]) {
  return linhas
    .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}
