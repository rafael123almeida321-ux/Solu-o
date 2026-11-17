import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Campo, Segmentado } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { erroMsg } from "../lib/utils";

export default function Auth() {
  const [modo, setModo] = useState<"entrar" | "criar">(() => (sessionStorage.getItem("clyent-convite") ? "criar" : "entrar"));
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const toast = useToast();
  const convite = sessionStorage.getItem("clyent-convite");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        if (nome.trim().length < 2) throw new Error("Coloque seu nome (é assim que a equipe vai te ver).");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin + (convite ? `/?convite=${convite}` : "") },
        });
        if (error) throw error;
        if (!data.session) setConfirmar(true);
      }
    } catch (err) {
      setErro(erroMsg(err));
    } finally {
      setEnviando(false);
    }
  }

  async function esqueci() {
    if (!email.trim()) {
      setErro("Digite seu e-mail acima e toque de novo em \"Esqueci a senha\".");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setErro(erroMsg(error));
    else toast("Enviamos um link pra redefinir sua senha.");
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[680px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #39FF14, transparent)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon font-display text-xl font-black text-fundo">C</div>
            <div className="font-display text-[26px] font-black leading-none tracking-wide">
              CLYENT<span className="text-neon"> COMANDO</span>
            </div>
          </div>
          <p className="mt-5 text-[22px] font-bold leading-snug">
            Cada porta que você bate
            <br />
            <span className="text-mute">vira lead registrado.</span>
          </p>
          <div className="mt-5 h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#4CC2FF,#78C8DC 36%,#FFB020 55%,#FF6E32 76%,#FF3D3D)" }} aria-hidden />
          <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-dim" aria-hidden>
            <span>frio</span>
            <span>morno</span>
            <span>quente</span>
          </div>
        </div>

        {confirmar ? (
          <div className="cartao p-6 text-center">
            <MailCheck className="mx-auto text-neon" size={36} />
            <p className="mt-3 font-semibold">Confirme seu e-mail</p>
            <p className="mt-1 text-sm text-mute">
              Mandamos um link pra <b className="text-ink">{email}</b>. Abra, confirme e volte aqui pra entrar.
            </p>
            <button
              className="btn-sec mt-5 w-full"
              onClick={() => {
                setConfirmar(false);
                setModo("entrar");
              }}
            >
              Já confirmei, quero entrar
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="cartao space-y-4 p-5">
            {convite && (
              <p className="rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 text-sm text-neon">
                Você recebeu um convite de equipe. Crie sua conta ou entre pra aceitar.
              </p>
            )}
            <Segmentado
              opcoes={[
                { id: "entrar", label: "Entrar" },
                { id: "criar", label: "Criar conta" },
              ]}
              valor={modo}
              onChange={(v) => {
                setModo(v);
                setErro("");
              }}
            />
            {modo === "criar" && (
              <Campo rotulo="Seu nome">
                <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a equipe te chama" autoComplete="name" />
              </Campo>
            )}
            <Campo rotulo="E-mail">
              <input className="campo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" inputMode="email" />
            </Campo>
            <Campo rotulo="Senha">
              <input
                className="campo"
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={modo === "criar" ? "Mínimo 6 caracteres" : "Sua senha"}
                autoComplete={modo === "criar" ? "new-password" : "current-password"}
              />
            </Campo>
            {erro && <p className="rounded-lg bg-quente/10 px-3 py-2 text-sm text-[#ffb4a9]">{erro}</p>}
            <button className="btn-neon w-full py-3.5 text-[15px]" disabled={enviando}>
              {enviando && <Loader2 size={18} className="animate-spin" />}
              {modo === "entrar" ? "Entrar" : "Criar minha conta"}
            </button>
            {modo === "entrar" && (
              <button type="button" onClick={esqueci} className="btn-ghost w-full py-1 text-[13px]">
                Esqueci a senha
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
