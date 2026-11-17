import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, CheckCircle2, Loader2, Mic, Sparkles, Square, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { conversar, transcrever, type RespostaChat } from "../lib/ai";
import { useGravador } from "../lib/audio";
import { cls, erroMsg } from "../lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  acoes?: RespostaChat["acoes"];
  erro?: boolean;
}

const SUGESTOES = [
  "Monta meu briefing de hoje: quem eu ataco primeiro?",
  "Quais leads meus estão esfriando?",
  "Como a equipe tá essa semana? Quem tá liderando?",
  "Escreve uma mensagem de WhatsApp pro meu lead mais quente",
  "Marca follow-up pra amanhã em todos os meus leads sem próximo passo",
];

const BRIEFING = "Monta meu briefing de hoje: o que tá atrasado, o que tá esfriando e por qual lead eu começo. Seja direto.";

export default function Agente() {
  const { teamId, team, recarregar } = useTeam();
  const { nome } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const chave = `clyent-chat-${teamId}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(chave) || "[]");
    } catch {
      return [];
    }
  });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useGravador();
  const fim = useRef<HTMLDivElement>(null);
  const jaPediuBriefing = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(chave, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* ok */
    }
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, chave]);

  useEffect(() => {
    if (params.get("p") === "briefing" && !jaPediuBriefing.current) {
      jaPediuBriefing.current = true;
      params.delete("p");
      setParams(params, { replace: true });
      enviar(BRIEFING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar(t: string) {
    const pergunta = t.trim();
    if (!pergunta || pensando || !teamId) return;
    setTexto("");
    const historico: Msg[] = [...msgs.filter((m) => !m.erro), { role: "user", content: pergunta }];
    setMsgs((m) => [...m, { role: "user", content: pergunta }]);
    setPensando(true);
    try {
      const r = await conversar(
        teamId,
        historico.map((m) => ({ role: m.role, content: m.content })),
      );
      setMsgs((m) => [...m, { role: "assistant", content: r.resposta || "Pronto.", acoes: r.acoes }]);
      if (r.acoes?.some((a) => a.ok)) recarregar();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: erroMsg(e), erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  async function voz() {
    if (gravador.gravando) {
      const a = await gravador.parar();
      if (a.size < 2000) return;
      setTranscrevendo(true);
      try {
        const t = await transcrever(a);
        if (t) enviar(t);
      } catch (e) {
        toast(`Não deu pra transcrever: ${erroMsg(e)}`, "erro");
      } finally {
        setTranscrevendo(false);
      }
    } else {
      try {
        await gravador.iniciar();
      } catch {
        toast("Libere o microfone pra falar com o agente.", "erro");
      }
    }
  }

  const naoConfigurado = msgs.some((m) => m.erro && /GROQ|Failed to send|not found|404|Function not found|FunctionsFetchError|relay/i.test(m.content));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-2xl flex-col px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neon/15 text-neon">
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="font-bold leading-tight">Agente de vendas</h1>
            <p className="text-xs text-mute">Conhece os leads da {team?.nome} e mexe neles por você</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => setMsgs([])} className="btn-ghost px-2" aria-label="Limpar conversa">
            <Trash2 size={17} />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4">
        {msgs.length === 0 && (
          <div className="py-6">
            <p className="text-[22px] font-bold leading-snug">
              Fala, {nome.split(" ")[0] || "sócio"}.
              <br />
              <span className="text-mute">O que eu faço por você?</span>
            </p>
            <div className="mt-6 space-y-2">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="cartao block w-full p-3.5 text-left text-sm hover:border-neon/50">
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs text-dim">
              O agente só enxerga o que você enxerga: lead protegido de outro vendedor continua protegido pra ele também.
            </p>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-neon/15 px-4 py-2.5 text-[15px] text-ink">
              {m.content}
            </div>
          ) : (
            <div key={i} className={cls("max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3 text-[15px] leading-relaxed", m.erro ? "border-quente/40 bg-quente/10" : "border-line bg-s1")}>
              {m.erro ? (
                <p className="flex items-start gap-2 text-[#ffc2b8]">
                  <TriangleAlert size={17} className="mt-0.5 shrink-0" /> {m.content}
                </p>
              ) : (
                <Texto texto={m.content} />
              )}
              {m.acoes && m.acoes.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
                  {m.acoes.map((a, j) => (
                    <li key={j} className={cls("flex items-start gap-1.5 text-xs", a.ok ? "text-neon" : "text-quente")}>
                      {a.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
                      {a.resumo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}

        {pensando && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-line bg-s1 px-4 py-3 text-sm text-mute">
            <Loader2 size={16} className="animate-spin text-neon" /> pensando…
          </div>
        )}

        {naoConfigurado && (
          <div className="cartao border-morno/40 p-4 text-sm">
            <p className="font-semibold text-morno">O agente ainda não está ligado</p>
            <p className="mt-1 text-mute">
              Falta publicar a função <b className="text-ink">agente</b> no Supabase e cadastrar o secret <b className="text-ink">GROQ_API_KEY</b>. É o passo 5 do README — leva uns 3 minutos.
            </p>
          </div>
        )}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] mt-4 bg-gradient-to-t from-fundo via-fundo to-transparent pb-2 pt-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-s1 p-2 focus-within:border-neon/50">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            placeholder={gravador.gravando ? "Ouvindo…" : "Pergunte ou mande fazer…"}
            className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-dim"
            aria-label="Mensagem pro agente"
          />
          {gravador.suportado && (
            <button
              type="button"
              onClick={voz}
              disabled={transcrevendo || pensando}
              className={cls("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", gravador.gravando ? "pulsar bg-quente text-white" : "bg-s3 text-mute hover:text-neon")}
              aria-label={gravador.gravando ? "Parar e enviar" : "Falar"}
            >
              {transcrevendo ? <Loader2 size={18} className="animate-spin" /> : gravador.gravando ? <Square size={16} /> : <Mic size={19} />}
            </button>
          )}
          <button type="submit" disabled={!texto.trim() || pensando} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neon text-fundo disabled:opacity-30" aria-label="Enviar">
            <ArrowUp size={20} strokeWidth={2.6} />
          </button>
        </div>
      </form>
    </div>
  );
}

/** markdown mínimo e seguro: **negrito**, listas e quebras de linha */
function Texto({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) {
      blocos.push(
        <ul key={`l${blocos.length}`} className="my-1.5 list-disc space-y-1 pl-5">
          {lista.map((l, i) => (
            <li key={i}>{negrito(l)}</li>
          ))}
        </ul>,
      );
      lista = [];
    }
  };
  linhas.forEach((l) => {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) lista.push(m[1]);
    else {
      fecharLista();
      if (l.trim()) blocos.push(<p key={`p${blocos.length}`} className="my-1">{negrito(l.replace(/^#+\s*/, ""))}</p>);
    }
  });
  fecharLista();
  return <>{blocos}</>;
}

function negrito(s: string): ReactNode {
  const partes = s.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}
