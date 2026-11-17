import { supabase } from "./supabase";

/**
 * Fila offline: lead cadastrado sem sinal fica guardado no aparelho e sobe
 * sozinho quando a internet volta (o banco ignora reenvio do mesmo id).
 */
const CHAVE = "clyent-fila-v1";

export interface ItemFila {
  id: string;
  nome: string;
  payload: Record<string, unknown>;
  criadoEm: string;
  erro?: string;
}

function ler(): ItemFila[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "[]") as ItemFila[];
  } catch {
    return [];
  }
}

function gravar(itens: ItemFila[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    // memória cheia: guarda sem as fotos pra não perder o lead
    const semFoto = itens.map((i) => ({ ...i, payload: { ...i.payload, foto: null } }));
    try {
      localStorage.setItem(CHAVE, JSON.stringify(semFoto));
    } catch {
      /* sem espaço nenhum */
    }
  }
  window.dispatchEvent(new Event("fila-mudou"));
}

export const fila = {
  listar: ler,
  adicionar(item: ItemFila) {
    gravar([...ler().filter((i) => i.id !== item.id), item]);
  },
  remover(id: string) {
    gravar(ler().filter((i) => i.id !== id));
  },
};

export function ehErroDeRede(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = String((e as { message?: string })?.message ?? e ?? "");
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|timeout/i.test(m);
}

let enviando = false;

export async function enviarFila(): Promise<number> {
  if (enviando || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  enviando = true;
  let enviados = 0;
  try {
    for (const item of ler()) {
      const { error } = await supabase.rpc("criar_lead", { p: item.payload });
      if (!error) {
        fila.remover(item.id);
        enviados++;
      } else if (ehErroDeRede(error)) {
        break;
      } else {
        gravar(ler().map((i) => (i.id === item.id ? { ...i, erro: error.message } : i)));
      }
    }
  } finally {
    enviando = false;
  }
  return enviados;
}
