import { Eye, EyeOff, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cls } from "../lib/utils";
import { brl, paraCampo, paraCentavos } from "./dinheiro";
import { useFin } from "./FinContext";

/** valor em reais que respeita o botão "ocultar valores" */
export function Valor({ c, compacto, sinal, className }: { c: number | null | undefined; compacto?: boolean; sinal?: boolean; className?: string }) {
  const { ocultar } = useFin();
  if (c === null || c === undefined) return <span className={cls("text-mute", className)}>não informado</span>;
  if (ocultar) return <span className={cls("tracking-widest", className)} aria-label="valor oculto">R$ •••</span>;
  const txt = brl(c, compacto);
  return <span className={className}>{sinal && c > 0 ? `+${txt}` : txt}</span>;
}

export function BotaoOcultar() {
  const { ocultar, setOcultar } = useFin();
  return (
    <button
      onClick={() => setOcultar(!ocultar)}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-mute hover:text-ink"
      aria-pressed={ocultar}
    >
      {ocultar ? <Eye size={15} /> : <EyeOff size={15} />} {ocultar ? "Mostrar valores" : "Ocultar valores"}
    </button>
  );
}

export function Barra({ pct, cor = "bg-neon", rotulo }: { pct: number | null; cor?: string; rotulo: string }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-s3" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <div className={cls("h-full rounded-full transition-all", cor)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function CampoDinheiro({
  valor,
  onChange,
  id,
  placeholder = "0,00",
  obrigatorio,
}: {
  valor: number | null;
  onChange: (c: number | null) => void;
  id?: string;
  placeholder?: string;
  obrigatorio?: boolean;
}) {
  const [texto, setTexto] = useState(paraCampo(valor));
  const invalido = texto.trim() !== "" && paraCentavos(texto) === null;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-mute">R$</span>
      <input
        id={id}
        inputMode="decimal"
        className={cls("campo pl-10", invalido && "border-quente")}
        value={texto}
        placeholder={placeholder}
        required={obrigatorio}
        aria-invalid={invalido}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(paraCentavos(e.target.value));
        }}
      />
      {invalido && <span className="mt-1 block text-xs text-quente">Valor inválido. Use por exemplo 1.250,00</span>}
    </div>
  );
}

export function Explica({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <span className="inline-block">
      <button onClick={() => setAberto(!aberto)} className="inline-flex items-center gap-1 text-[12px] text-mute underline-offset-2 hover:underline" aria-expanded={aberto}>
        <Info size={13} /> como é calculado
      </button>
      {aberto && <span className="mt-1 block rounded-lg border border-line bg-s2 p-2.5 text-[12.5px] leading-relaxed text-mute">{children}</span>}
    </span>
  );
}

export function Pill({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "alto" | "medio" | "ok" | "info" }) {
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tom === "neutro" && "border-line text-mute",
        tom === "alto" && "border-quente/50 bg-quente/10 text-[#ffb4aa]",
        tom === "medio" && "border-morno/50 bg-morno/10 text-morno",
        tom === "ok" && "border-neon/40 bg-neon/10 text-neon",
        tom === "info" && "border-frio/40 bg-frio/10 text-frio",
      )}
    >
      {children}
    </span>
  );
}

export function Cartao({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cls("cartao p-4", className)}>{children}</div>;
}
