import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cls } from "../lib/utils";

type Tipo = "ok" | "erro" | "info";
interface Toast {
  id: number;
  texto: string;
  tipo: Tipo;
}

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mostrar = useCallback((texto: string, tipo: Tipo = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texto, tipo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === "erro" ? 5500 : 3200);
  }, []);
  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div className="fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cls(
              "toast-in pointer-events-auto max-w-md w-full rounded-xl px-4 py-3 text-sm font-medium shadow-2xl border",
              t.tipo === "ok" && "bg-s2 border-neon/40 text-ink",
              t.tipo === "erro" && "bg-[#2a1414] border-quente/50 text-[#ffd2cc]",
              t.tipo === "info" && "bg-s2 border-line text-ink",
            )}
          >
            {t.tipo === "ok" && <span className="text-neon mr-1.5">●</span>}
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
