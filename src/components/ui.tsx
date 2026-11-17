import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cls, corAvatar, iniciais } from "../lib/utils";

export function Avatar({ id, nome, tamanho = 28 }: { id: string; nome: string; tamanho?: number }) {
  const cor = corAvatar(id);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.round(tamanho * 0.38),
        background: `${cor}22`,
        color: cor,
        boxShadow: `inset 0 0 0 1px ${cor}55`,
      }}
      aria-hidden
    >
      {iniciais(nome || "?")}
    </span>
  );
}

export function Sheet({
  aberto,
  onFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onFechar} aria-label="Fechar" />
      <div className="sheet-in pb-safe relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-s1 sm:max-w-lg sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-s1/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-bold">{titulo}</h2>
          <button onClick={onFechar} className="-mr-2 rounded-full p-2 text-mute hover:text-ink" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Vazio({ icone, titulo, texto, acao }: { icone: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-s2 text-mute">{icone}</div>
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="mt-1 max-w-xs text-sm text-mute">{texto}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { id: T; label: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-line bg-s1 p-1" role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cls(
            "flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition",
            valor === o.id ? "bg-s3 text-ink shadow" : "text-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mute">
      <div className="carregando font-display text-2xl font-black text-neon">C</div>
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function Secao({ titulo, acao, children, className }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="titulo-sec">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-dim">{dica}</span>}
    </label>
  );
}

export function Contador({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-quente px-1.5 text-[11px] font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
