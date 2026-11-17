import { useRef } from "react";
import { corTemp, cls, FAIXA_INFO, faixaTemp, vibrar } from "../lib/utils";

/** O termômetro: arrasta pra dizer quão quente está o lead. Vibra ao trocar de faixa. */
export default function TempSlider({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const faixa = faixaTemp(valor);
  const info = FAIXA_INFO[faixa];
  const cor = corTemp(valor);
  const ultima = useRef(faixa);

  function mudar(v: number) {
    const f = faixaTemp(v);
    if (f !== ultima.current) {
      vibrar(18);
      ultima.current = f;
    }
    onChange(v);
  }

  const atalhos: { v: number; rotulo: string }[] = [
    { v: 20, rotulo: "❄️ Frio" },
    { v: 55, rotulo: "🌤️ Morno" },
    { v: 85, rotulo: "🔥 Quente" },
  ];

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[52px] font-black leading-none tabular-nums" style={{ color: cor }}>
            {valor}°
          </span>
          <span className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: cor }}>
            {info.emoji} {info.label}
          </span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={valor}
        onChange={(e) => mudar(Number(e.target.value))}
        className="termometro"
        style={{ ["--cor" as string]: cor }}
        aria-label="Temperatura do lead"
        aria-valuetext={`${valor} graus, ${info.label}`}
      />

      <div className="relative -mt-1 h-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim" aria-hidden>
        <span className="absolute left-0">Frio</span>
        <span className="absolute -translate-x-1/2" style={{ left: "40%" }}>
          Morno
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: "70%" }}>
          Quente
        </span>
        <span className="absolute right-0">100</span>
      </div>

      <div className="mt-3 flex gap-2">
        {atalhos.map((a) => (
          <button
            key={a.v}
            type="button"
            onClick={() => mudar(a.v)}
            className={cls("chip flex-1 justify-center", faixaTemp(a.v) === faixa && "chip-on")}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TempBadge({ valor, grande = false }: { valor: number; grande?: boolean }) {
  const cor = corTemp(valor);
  return (
    <span
      className={cls("font-display font-extrabold tabular-nums leading-none", grande ? "text-2xl" : "text-[15px]")}
      style={{ color: cor }}
      title={`${FAIXA_INFO[faixaTemp(valor)].label} — ${valor}°`}
    >
      {valor}°
    </span>
  );
}
