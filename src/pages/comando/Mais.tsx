import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, CalendarClock, Dumbbell, Sparkles, ClipboardCheck, ClipboardCopy, Download, FileSpreadsheet, Home, Plus, Rocket, Target, Trophy, Upload, UsersRound, Wallet } from "lucide-react";
import { Campo, Secao, Sheet } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";
import { baixarArquivo, erroMsg } from "../../lib/utils";
import { csvLancamentos, montarBackup, validarBackup, type Validacao } from "../../fin/backup";
import { useFin } from "../../fin/FinContext";
import { resumoParaClaude } from "../../fin/resumo";
import type { Categoria } from "../../fin/tipos";
import { BotaoOcultar, Cartao, Pill } from "../../fin/ui";

export default function Mais() {
  const { dados, hoje, recarregar, salvar } = useFin();
  const toast = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<{ json: unknown; v: Validacao; nome: string } | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [cat, setCat] = useState<Partial<Categoria> | null>(null);

  const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  function exportarJSON() {
    baixarArquivo(`backup-comando-${carimbo()}.json`, JSON.stringify(montarBackup(dados), null, 2), "application/json");
    toast("Backup baixado");
  }

  async function abrirArquivo(f: File) {
    try {
      const json = JSON.parse(await f.text());
      setPrevia({ json, v: validarBackup(json), nome: f.name });
    } catch {
      toast("Esse arquivo não é um JSON válido.", "erro");
    }
  }

  async function restaurar() {
    if (!previa?.v.ok) return;
    setRestaurando(true);
    try {
      // backup do estado atual ANTES de substituir
      baixarArquivo(`backup-antes-de-restaurar-${carimbo()}.json`, JSON.stringify(montarBackup(dados), null, 2), "application/json");
      const { data, error } = await supabase.rpc("fin_restaurar", { p: previa.json });
      if (error) throw error;
      await recarregar();
      toast(`Restaurado: ${JSON.stringify(data).replace(/[{}"]/g, "").replace(/,/g, ", ")}`);
      setPrevia(null);
    } catch (e) {
      toast(`Nada foi alterado. ${erroMsg(e)}`, "erro");
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mais</h1>
        <BotaoOcultar />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Atalho to="/rotina" icone={<CalendarClock size={20} />} t="Minha rotina" />
        <Atalho to="/metas" icone={<Dumbbell size={20} />} t="Metas pessoais" />
        <Atalho to="/assistente" icone={<Bot size={20} />} t="Sócio IA" />
        <Atalho to="/caixa" icone={<Wallet size={20} />} t="Caixa" />
        <Atalho to="/frentes" icone={<Rocket size={20} />} t="Frentes e ações" />
        <Atalho to="/meta" icone={<Target size={20} />} t="Meta e plano" />
        <Atalho to="/revisao" icone={<ClipboardCheck size={20} />} t="Revisão semanal" />
        <Atalho to="/crm" icone={<Home size={20} />} t="Início do CRM" />
                <Atalho to="/equipe" icone={<Trophy size={20} />} t="Equipe" />
        <Atalho to="/agente" icone={<Sparkles size={20} />} t="Agente do CRM" />
        <Atalho to="/equipes" icone={<UsersRound size={20} />} t="Trocar equipe" />
      </div>

      <PerfilIA />

      <Secao titulo="Revisão com o Claude">
        <Cartao className="space-y-2 text-[13.5px]">
          <p className="text-mute">Gera um texto com período, números, dívidas, compromissos, frentes e decisões — sem e-mail, ids ou dados de conta. Nada é enviado sozinho.</p>
          <button className="btn btn-neon w-full" onClick={() => setResumo(resumoParaClaude(dados, hoje))}>
            <ClipboardCopy size={16} /> Resumo para revisão com o Claude
          </button>
        </Cartao>
      </Secao>

      <Secao titulo="Categorias">
        <Cartao className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {dados.categorias.map((c) => (
              <button key={c.id} onClick={() => setCat(c)} className={c.arquivada ? "opacity-50" : ""}>
                <Pill tom={c.tipo === "entrada" ? "ok" : "neutro"}>
                  {c.nome} · {c.natureza}
                </Pill>
              </button>
            ))}
            {!dados.categorias.length && <p className="text-sm text-mute">Nenhuma categoria.</p>}
          </div>
          <button className="btn btn-sec w-full" onClick={() => setCat({ tipo: "saida", natureza: "pessoal", escopo: "pessoal", arquivada: false, nome: "" })}>
            <Plus size={16} /> Nova categoria
          </button>
        </Cartao>
      </Secao>

      <Secao titulo="Seus dados">
        <Cartao className="space-y-2">
          <button className="btn btn-sec w-full justify-start" onClick={exportarJSON}>
            <Download size={16} /> Exportar tudo (JSON com versão do esquema)
          </button>
          <button className="btn btn-sec w-full justify-start" onClick={() => baixarArquivo(`lancamentos-${carimbo()}.csv`, csvLancamentos(dados))}>
            <FileSpreadsheet size={16} /> Exportar lançamentos (CSV para Excel)
          </button>
          <button className="btn btn-sec w-full justify-start" onClick={() => arquivo.current?.click()}>
            <Upload size={16} /> Restaurar de um backup…
          </button>
          <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && abrirArquivo(e.target.files[0])} />
          <p className="text-[12px] text-dim">
            Seus dados financeiros ficam no banco protegidos por login: só você vê, nem o dono da equipe do CRM. O app funciona sem nenhuma IA ligada.
          </p>
        </Cartao>
      </Secao>

      <Sheet aberto={!!previa} onFechar={() => setPrevia(null)} titulo="Prévia da restauração">
        {previa && (
          <div className="space-y-3 text-[13.5px]">
            <p className="text-mute">{previa.nome}</p>
            <ul className="grid grid-cols-2 gap-1 text-[13px]">
              {Object.entries(previa.v.contagens).map(([k, n]) => (
                <li key={k}>
                  {k.replace(/_/g, " ")}: <b>{n}</b>
                </li>
              ))}
            </ul>
            {previa.v.erros.length > 0 && (
              <div className="rounded-xl border border-quente/40 bg-quente/10 p-3 text-[#ffd2cc]">
                <p className="font-semibold">Não dá para restaurar este arquivo:</p>
                <ul className="mt-1 list-disc pl-5">
                  {previa.v.erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {previa.v.avisos.map((a) => (
              <p key={a} className="text-morno">
                {a}
              </p>
            ))}
            {previa.v.ok && (
              <>
                <p className="rounded-xl border border-morno/40 bg-morno/10 p-3 text-morno">
                  Isto SUBSTITUI todos os seus dados pessoais atuais pelos do arquivo. Antes, o app baixa automaticamente um backup do estado atual. Se algo der errado no meio,
                  nada é alterado.
                </p>
                <button className="btn btn-neon w-full" disabled={restaurando} onClick={restaurar}>
                  {restaurando ? "Restaurando…" : "Baixar backup atual e restaurar"}
                </button>
              </>
            )}
          </div>
        )}
      </Sheet>

      <Sheet aberto={!!resumo} onFechar={() => setResumo(null)} titulo="Resumo para o Claude">
        {resumo && (
          <div className="space-y-3">
            <textarea className="campo min-h-[45vh] font-mono text-[12px]" readOnly value={resumo} />
            <div className="flex gap-2">
              <button
                className="btn btn-neon flex-1"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resumo);
                    toast("Copiado — cole numa conversa com o Claude");
                  } catch {
                    toast("Não consegui copiar; selecione o texto e copie.", "erro");
                  }
                }}
              >
                Copiar
              </button>
              <button className="btn btn-sec flex-1" onClick={() => baixarArquivo(`resumo-${hoje}.md`, resumo, "text/markdown;charset=utf-8")}>
                Baixar
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet aberto={!!cat} onFechar={() => setCat(null)} titulo={cat?.id ? "Editar categoria" : "Nova categoria"}>
        {cat && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await salvar("fin_categories", { ...cat, nome: cat.nome?.trim() });
                toast("Categoria salva");
                setCat(null);
              } catch (err) {
                toast(erroMsg(err), "erro");
              }
            }}
          >
            <Campo rotulo="Nome">
              <input className="campo" value={cat.nome ?? ""} onChange={(e) => setCat({ ...cat, nome: e.target.value })} required maxLength={60} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tipo">
                <select className="campo" value={cat.tipo} onChange={(e) => setCat({ ...cat, tipo: e.target.value as Categoria["tipo"] })}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </Campo>
              <Campo rotulo="Natureza" dica="Empréstimo recebido = financiamento (não é faturamento).">
                <select className="campo" value={cat.natureza} onChange={(e) => setCat({ ...cat, natureza: e.target.value as Categoria["natureza"] })}>
                  <option value="operacional">Negócio (operacional)</option>
                  <option value="pessoal">Pessoal</option>
                  <option value="financiamento">Financiamento</option>
                  <option value="divida">Pagamento de dívida</option>
                </select>
              </Campo>
            </div>
            {cat.id && (
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" checked={!!cat.arquivada} onChange={(e) => setCat({ ...cat, arquivada: e.target.checked })} className="h-4 w-4 accent-[#39FF14]" />
                Arquivar (lançamentos antigos continuam com ela)
              </label>
            )}
            <button className="btn btn-neon w-full">Salvar</button>
          </form>
        )}
      </Sheet>
    </div>
  );
}

function Atalho({ to, icone, t }: { to: string; icone: React.ReactNode; t: string }) {
  return (
    <Link to={to} className="cartao flex flex-col items-start gap-2 p-3.5 text-[13.5px] font-semibold">
      <span className="text-neon">{icone}</span>
      {t}
    </Link>
  );
}

function PerfilIA() {
  const { dados, salvar } = useFin();
  const toast = useToast();
  const [texto, setTexto] = useState(String(dados.ajustes?.preferencias?.perfil_ia ?? ""));
  return (
    <Secao titulo="Sobre mim (o Sócio IA lê isso)">
      <Cartao className="space-y-2">
        <textarea
          className="campo min-h-[120px]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Quem você é, como gosta que falem com você, prioridades do momento, o que não pode faltar no seu dia…"
          maxLength={3000}
        />
        <button
          className="btn btn-sec w-full"
          onClick={async () => {
            try {
              const preferencias = { ...(dados.ajustes?.preferencias ?? {}), perfil_ia: texto.trim() };
              await salvar("fin_settings", dados.ajustes ? { id: dados.ajustes.user_id, preferencias } : { preferencias, capacidade_semanal_horas: null });
              toast("Salvo — o Sócio IA vai usar isso");
            } catch (e) {
              toast(erroMsg(e), "erro");
            }
          }}
        >
          Salvar
        </button>
        <p className="text-[12px] text-dim">O Sócio IA usa a Groq: a cada pergunta ele recebe um resumo dos seus dados do app (sem senhas, e-mail ou número de conta).</p>
      </Cartao>
    </Secao>
  );
}
