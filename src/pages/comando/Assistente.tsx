import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Send, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cls } from "../../lib/utils";
import { montarContextoIA } from "../../fin/contextoIA";
import { useFin } from "../../fin/FinContext";
import { EstadoModulo } from "./EstadoModulo";

interface Msg {
  id: string;
  papel: "user" | "assistant";
  conteudo: string;
  acoes: { ok: boolean; texto: string }[];
  created_at: string;
}

const ATALHOS = [
  "O que eu faço agora?",
  "Monta meu dia de amanhã",
  "Como eu tô na semana?",
  "Terminei o bloco de agora",
  "O que pagar primeiro com o que entrar essa semana?",
];

export default function Assistente() {
  const { dados, hoje, recarregar, carregando, erro, moduloInstalado } = useFin();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("ia_mensagens")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => setMsgs(((data ?? []) as Msg[]).reverse()));
  }, []);
  useEffect(() => fim.current?.scrollIntoView({ behavior: "smooth" }), [msgs, pensando]);

  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;

  async function enviar(conteudo: string) {
    const t = conteudo.trim();
    if (!t || pensando) return;
    setTexto("");
    setAviso(null);
    const local: Msg = { id: `l-${Date.now()}`, papel: "user", conteudo: t, acoes: [], created_at: new Date().toISOString() };
    const historico = [...msgs, local];
    setMsgs(historico);
    setPensando(true);
    try {
      await supabase.from("ia_mensagens").insert({ papel: "user", conteudo: t });
      const { data, error } = await supabase.functions.invoke("assistente", {
        body: {
          contexto: montarContextoIA(dados, hoje),
          mensagens: historico.slice(-16).map((m) => ({ role: m.papel, content: m.conteudo })),
        },
      });
      if (error) {
        let msg = "A IA não respondeu agora. Tenta de novo em instantes.";
        try {
          const corpo = await (error as { context?: Response }).context?.json();
          if (corpo?.mensagem) msg = corpo.mensagem;
        } catch {
          /* ok */
        }
        setAviso(msg);
        return;
      }
      const resposta: Msg = {
        id: `a-${Date.now()}`,
        papel: "assistant",
        conteudo: String(data?.resposta || "…"),
        acoes: data?.acoes ?? [],
        created_at: new Date().toISOString(),
      };
      setMsgs((m) => [...m, resposta]);
      await supabase.from("ia_mensagens").insert({ papel: "assistant", conteudo: resposta.conteudo, acoes: resposta.acoes });
      if (resposta.acoes.some((a) => a.ok)) await recarregar();
    } catch {
      setAviso("Sem conexão com a IA agora. O resto do app continua funcionando normal.");
    } finally {
      setPensando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 pb-4 pt-4" style={{ minHeight: "calc(100dvh - 160px)" }}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon/15 text-neon">
          <Bot size={22} />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">Sócio IA</h1>
          <p className="text-[12px] text-mute">Vê sua rotina, metas, dinheiro e ações. Pode registrar pra você.</p>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {msgs.length === 0 && (
          <div className="rounded-2xl border border-line bg-s1 p-4 text-[14px] text-mute">
            Pergunta qualquer coisa do seu dia. Exemplos: "o que faço agora?", "pesei 84,5 hoje", "fiz o treino de basquete", "vendi 4 plaquinhas por 260 no Nubank",
            "cria uma tarefa pra ligar pra Maxxs amanhã 10h".
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cls("flex", m.papel === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cls(
                "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed",
                m.papel === "user" ? "rounded-br-md bg-neon text-fundo" : "rounded-bl-md border border-line bg-s1",
              )}
            >
              {m.conteudo}
              {m.acoes?.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[12.5px]">
                  {m.acoes.map((a, i) => (
                    <li key={i} className={cls("flex items-start gap-1.5", a.ok ? "text-neon" : "text-morno")}>
                      {a.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                      {a.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {pensando && (
          <div className="flex justify-start">
            <div className="carregando rounded-2xl rounded-bl-md border border-line bg-s1 px-3.5 py-2.5 text-[14px] text-mute">pensando…</div>
          </div>
        )}
        {aviso && <p className="rounded-xl border border-morno/40 bg-morno/10 px-3.5 py-2.5 text-[13px] text-morno">{aviso}</p>}
        <div ref={fim} />
      </div>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] mt-3 space-y-2 bg-fundo/95 pt-2 backdrop-blur">
        <div className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {ATALHOS.map((a) => (
            <button key={a} onClick={() => enviar(a)} disabled={pensando} className="shrink-0 rounded-full border border-line bg-s1 px-3 py-1.5 text-[12.5px] text-mute hover:text-ink">
              {a}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
          className="flex gap-2"
        >
          <input className="campo flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Fala com o sócio…" aria-label="Mensagem para a IA" />
          <button className="btn btn-neon px-4" disabled={pensando || !texto.trim()} aria-label="Enviar">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
