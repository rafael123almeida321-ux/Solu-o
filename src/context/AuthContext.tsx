import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  nome: string;
  carregando: boolean;
  sair: () => Promise<void>;
  salvarNome: (nome: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setNome("");
      return;
    }
    supabase
      .from("profiles")
      .select("nome")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setNome((data as { nome?: string } | null)?.nome || session?.user.email?.split("@")[0] || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function sair() {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem("clyent-equipe-atual");
    } catch {
      /* ok */
    }
  }

  async function salvarNome(novo: string) {
    if (!userId) return;
    const { error } = await supabase.from("profiles").update({ nome: novo.trim() }).eq("id", userId);
    if (error) throw error;
    setNome(novo.trim());
  }

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, nome, carregando, sair, salvarNome }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
