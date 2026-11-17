import { useEffect, useState } from "react";
import { MOTIVOS_PERDA } from "../lib/constants";
import { cls } from "../lib/utils";
import { Sheet } from "./ui";

export default function MotivoPerda({
  aberto,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  useEffect(() => {
    if (aberto) {
      setMotivo("");
      setDetalhe("");
    }
  }, [aberto]);
  const final = [motivo, detalhe.trim()].filter(Boolean).join(" — ");
  return (
    <Sheet aberto={aberto} onFechar={onFechar} titulo="Por que não rolou?">
      <p className="-mt-1 mb-3 text-sm text-mute">Isso alimenta o relatório de motivos de perda da equipe.</p>
      <div className="flex flex-wrap gap-2">
        {MOTIVOS_PERDA.map((m) => (
          <button key={m} onClick={() => setMotivo(m)} className={cls("chip", motivo === m && "chip-on")}>
            {m}
          </button>
        ))}
      </div>
      <input className="campo mt-4" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Detalhe (opcional)" />
      <button className="btn-perigo mt-4 w-full" disabled={!motivo} onClick={() => onConfirmar(final)}>
        Marcar como perdido
      </button>
    </Sheet>
  );
}
