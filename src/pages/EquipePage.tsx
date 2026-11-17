import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Crown, Download, LogOut, Maximize2, Plus, RefreshCw, Share2, Shield, Smartphone, Trash2, UserMinus, X } from "lucide-react";
import { Avatar, Campo, Secao, Segmentado } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { ESTAGIOS_ABERTOS, ORIGENS } from "../lib/constants";
import { supabase } from "../lib/supabase";
import type { LeadContact, Produto, Team } from "../lib/types";
import { baixarArquivo, cls, csv, erroMsg, fmtBRL, inicioDaSemana, inicioDoAno, inicioDoMes } from "../lib/utils";

type Aba = "ranking" | "membros" | "financeiro" | "config" | "conta";

export default function EquipePage() {
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useTeam();
  const aba = (params.get("aba") as Aba) || "ranking";
  const abas: { id: Aba; label: string }[] = [
    { id: "ranking", label: "Ranking" },
    { id: "membros", label: "Time" },
    { id: "financeiro", label: "Grana" },
    ...(isAdmin ? [{ id: "config" as Aba, label: "Ajustes" }] : []),
    { id: "conta", label: "Conta" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pt-4">
      <Segmentado
        opcoes={abas}
        valor={aba}
        onChange={(v) => {
          params.set("aba", v);
          setParams(params, { replace: true });
        }}
      />
      {aba === "ranking" && <Ranking />}
      {aba === "membros" && <Membros />}
      {aba === "financeiro" && <Financeiro />}
      {aba === "config" && isAdmin && <Config />}
      {aba === "conta" && <Conta />}
    </div>
  );
}

// ---------------------------------------------------------------- Ranking
function Ranking() {
  const { leads, membros, team } = useTeam();
  const [periodo, setPeriodo] = useState<"semana" | "mes">("semana");
  const [tv, setTv] = useState(false);

  const linhas = useMemo(() => {
    const desde = periodo === "semana" ? inicioDaSemana() : inicioDoMes();
    return membros
      .map((m) => {
        const registrados = leads.filter((l) => l.created_by === m.user_id && new Date(l.created_at) >= desde).length;
        const fechadosL = leads.filter((l) => l.owner_id === m.user_id && l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= desde);
        const quentes = leads.filter((l) => l.owner_id === m.user_id && ESTAGIOS_ABERTOS.includes(l.estagio) && l.temperatura >= 70).length;
        const valor = fechadosL.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
        return { ...m, registrados, fechados: fechadosL.length, quentes, valor, pontos: registrados + fechadosL.length * 10 + quentes * 2 };
      })
      .sort((a, b) => b.pontos - a.pontos || b.valor - a.valor);
  }, [leads, membros, periodo]);

  const conteudo = (grande: boolean) => (
    <div className={cls("space-y-2", grande && "space-y-4")}>
      {linhas.map((m, i) => (
        <div key={m.user_id} className={cls("cartao flex items-center gap-3", grande ? "p-6" : "p-3.5", i === 0 && m.pontos > 0 && "border-neon/50 bg-neon/[0.04]")}>
          <span className={cls("w-8 shrink-0 text-center font-display font-black", grande ? "text-4xl" : "text-lg", i === 0 ? "text-neon" : "text-mute")}>
            {i === 0 && m.pontos > 0 ? "🏆" : `${i + 1}º`}
          </span>
          <Avatar id={m.user_id} nome={m.nome} tamanho={grande ? 64 : 38} />
          <div className="min-w-0 flex-1">
            <p className={cls("truncate font-bold", grande && "text-3xl")}>{m.nome}</p>
            <p className={cls("text-mute", grande ? "text-lg" : "text-xs")}>
              {m.registrados} registrados · {m.quentes} quentes · {m.fechados} fechados
              {m.valor > 0 && ` · ${fmtBRL(m.valor)}`}
            </p>
          </div>
          <span className={cls("font-display font-black tabular-nums", grande ? "text-5xl" : "text-2xl", i === 0 ? "text-neon" : "text-ink")}>{m.pontos}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Segmentado
            opcoes={[
              { id: "semana", label: "Esta semana" },
              { id: "mes", label: "Este mês" },
            ]}
            valor={periodo}
            onChange={setPeriodo}
          />
        </div>
        <button
          className="btn-sec px-3"
          onClick={() => {
            setTv(true);
            document.documentElement.requestFullscreen?.().catch(() => {});
          }}
          aria-label="Modo TV"
        >
          <Maximize2 size={18} />
        </button>
      </div>
      {conteudo(false)}
      <p className="text-center text-xs text-dim">Pontos: 1 por lead registrado · 2 por lead quente em andamento · 10 por venda fechada</p>

      {tv && (
        <div className="fixed inset-0 z-[3000] overflow-y-auto bg-fundo p-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="font-display text-sm font-extrabold tracking-[0.3em] text-neon">{team?.nome?.toUpperCase()}</p>
                <h1 className="font-display text-5xl font-black">Ranking {periodo === "semana" ? "da semana" : "do mês"}</h1>
              </div>
              <button
                onClick={() => {
                  setTv(false);
                  if (document.fullscreenElement) document.exitFullscreen?.();
                }}
                className="rounded-full border border-line p-3 text-mute"
                aria-label="Sair do modo TV"
              >
                <X size={28} />
              </button>
            </div>
            {conteudo(true)}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Membros
function Membros() {
  const { user } = useAuth();
  const { team, membros, isAdmin, meuPapel, pedidosEntrada, recarregar, recarregarEquipes, trocarEquipe } = useTeam();
  const toast = useToast();
  const nav = useNavigate();
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !team) return;
    supabase
      .from("team_invites")
      .select("codigo")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => setCodigo((data as { codigo: string } | null)?.codigo ?? null));
  }, [isAdmin, team]);

  const link = codigo ? `${window.location.origin}/?convite=${codigo}` : "";

  async function chamar(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn, args);
    if (error) {
      toast(erroMsg(error), "erro");
      return false;
    }
    toast(ok);
    recarregar();
    return true;
  }

  async function compartilhar() {
    const texto = `Bora pro CRM da ${team?.nome}! Entra por aqui: ${link} (código ${codigo})`;
    if (navigator.share) navigator.share({ title: `Equipe ${team?.nome}`, text: texto }).catch(() => {});
    else {
      navigator.clipboard?.writeText(texto);
      toast("Convite copiado — cola no WhatsApp do time.");
    }
  }

  return (
    <div className="space-y-7">
      {isAdmin && codigo && (
        <Secao titulo="Convidar pro time">
          <div className="cartao p-4">
            <p className="text-sm text-mute">Código da equipe</p>
            <p className="mt-1 font-display text-4xl font-black tracking-[0.3em] text-neon">{codigo}</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
              <button className="btn-neon" onClick={compartilhar}>
                <Share2 size={16} /> Enviar convite
              </button>
              <button
                className="btn-sec px-3"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  toast("Link copiado");
                }}
                aria-label="Copiar link"
              >
                <Copy size={16} />
              </button>
              <button
                className="btn-sec px-3"
                aria-label="Gerar novo código"
                onClick={async () => {
                  if (!confirm("Gerar um código novo? O antigo para de funcionar.")) return;
                  const { data, error } = await supabase.rpc("novo_codigo", { p_team: team!.id });
                  if (error) return toast(erroMsg(error), "erro");
                  setCodigo(data as string);
                  toast("Código novo gerado");
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <p className="mt-3 text-xs text-dim">Quem entra pelo código já cai direto na equipe. Quem pede pela lista espera você aprovar.</p>
          </div>
        </Secao>
      )}

      {isAdmin && pedidosEntrada.length > 0 && (
        <Secao titulo="Querem entrar">
          <div className="space-y-2">
            {pedidosEntrada.map((p) => (
              <div key={p.user_id} className="cartao flex items-center gap-3 p-3.5">
                <Avatar id={p.user_id} nome={p.nome} tamanho={36} />
                <span className="flex-1 font-semibold">{p.nome}</span>
                <button className="btn-sec px-3 py-2 text-xs" onClick={() => chamar("responder_entrada", { p_team: team!.id, p_user: p.user_id, p_aprovar: false }, "Recusado")}>
                  Recusar
                </button>
                <button className="btn-neon px-3 py-2 text-xs" onClick={() => chamar("responder_entrada", { p_team: team!.id, p_user: p.user_id, p_aprovar: true }, `${p.nome} entrou`)}>
                  Aprovar
                </button>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo={`Membros · ${membros.length}`}>
        <div className="cartao divide-y divide-line">
          {membros.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar id={m.user_id} nome={m.nome} tamanho={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.nome} {m.user_id === user?.id && <span className="text-xs font-normal text-mute">(você)</span>}
                </p>
                <p className="flex items-center gap-1 text-xs text-mute">
                  {m.papel === "dono" ? <Crown size={12} className="text-morno" /> : m.papel === "admin" ? <Shield size={12} className="text-frio" /> : null}
                  {m.papel}
                </p>
              </div>
              {meuPapel === "dono" && m.papel !== "dono" && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() => chamar("alterar_papel", { p_team: team!.id, p_user: m.user_id, p_papel: m.papel === "admin" ? "membro" : "admin" }, "Papel alterado")}
                >
                  {m.papel === "admin" ? "Tirar admin" : "Tornar admin"}
                </button>
              )}
              {isAdmin && m.papel !== "dono" && m.user_id !== user?.id && (
                <button
                  className="rounded-full p-2 text-mute hover:text-quente"
                  aria-label={`Remover ${m.nome}`}
                  onClick={() => {
                    if (confirm(`Remover ${m.nome}? Os leads dele(a) passam pro dono da equipe.`))
                      chamar("remover_membro", { p_team: team!.id, p_user: m.user_id }, `${m.nome} removido(a)`);
                  }}
                >
                  <UserMinus size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Secao>

      {meuPapel !== "dono" && (
        <button
          className="btn-perigo w-full"
          onClick={async () => {
            if (!confirm(`Sair da ${team?.nome}? Seus leads ficam com o dono da equipe.`)) return;
            const ok = await chamar("remover_membro", { p_team: team!.id, p_user: user!.id }, "Você saiu da equipe");
            if (ok) {
              trocarEquipe(null);
              await recarregarEquipes();
              nav("/equipes");
            }
          }}
        >
          <LogOut size={16} /> Sair da equipe
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Financeiro
function Financeiro() {
  const { leads, membros, team, nomeDe } = useTeam();
  const [periodo, setPeriodo] = useState<"mes" | "ano">("mes");
  const pct = Number(team?.comissao_vendedor_pct ?? 60);

  const d = useMemo(() => {
    const desde = periodo === "mes" ? inicioDoMes() : inicioDoAno();
    const fechados = leads.filter((l) => l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= desde);
    const total = fechados.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const porMembro = membros
      .map((m) => {
        const dele = fechados.filter((l) => l.owner_id === m.user_id);
        const valor = dele.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
        const ehDono = m.user_id === team?.owner_id;
        const comissao = ehDono ? valor : (valor * pct) / 100;
        const casa = ehDono ? fechados.filter((l) => l.owner_id !== m.user_id).reduce((s, l) => s + (Number(l.valor_estimado || 0) * (100 - pct)) / 100, 0) : 0;
        return { ...m, qtd: dele.length, valor, comissao, casa };
      })
      .sort((a, b) => b.valor - a.valor);
    const anoTodo = leads
      .filter((l) => l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= inicioDoAno())
      .reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const perdidos = leads.filter((l) => l.estagio === "perdido");
    const motivos = Object.entries(
      perdidos.reduce<Record<string, number>>((acc, l) => {
        const m = (l.motivo_perda || "Não informado").split(" — ")[0];
        acc[m] = (acc[m] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
    const origens = [...ORIGENS, null].map((o) => {
      const daOrigem = leads.filter((l) => (o ? l.origem === o : !l.origem || !ORIGENS.includes(l.origem)));
      const f = daOrigem.filter((l) => l.estagio === "fechado").length;
      return { origem: o ?? "Sem origem", total: daOrigem.length, fechados: f, taxa: daOrigem.length ? Math.round((f / daOrigem.length) * 100) : 0 };
    }).filter((x) => x.total > 0);
    const ticket = fechados.length ? total / fechados.length : 0;
    return { fechados, total, porMembro, anoTodo, motivos, perdidos: perdidos.length, origens, ticket };
  }, [leads, membros, periodo, pct, team?.owner_id]);

  const teto = team?.teto_anual ? Number(team.teto_anual) : null;
  const usoTeto = teto ? Math.min(100, (d.anoTodo / teto) * 100) : 0;

  return (
    <div className="space-y-7">
      <Segmentado
        opcoes={[
          { id: "mes", label: "Este mês" },
          { id: "ano", label: "Este ano" },
        ]}
        valor={periodo}
        onChange={setPeriodo}
      />
      <div className="grid grid-cols-3 gap-2">
        <div className="cartao p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">Faturado</p>
          <p className="mt-1 font-display text-lg font-black text-neon">{fmtBRL(d.total)}</p>
        </div>
        <div className="cartao p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">Vendas</p>
          <p className="mt-1 font-display text-lg font-black">{d.fechados.length}</p>
        </div>
        <div className="cartao p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">Ticket médio</p>
          <p className="mt-1 font-display text-lg font-black">{fmtBRL(d.ticket)}</p>
        </div>
      </div>

      {teto && (
        <div className={cls("cartao p-4", usoTeto >= 80 && "border-quente/60")}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">Teto anual de faturamento</span>
            <span className="text-mute">
              {fmtBRL(d.anoTodo)} de {fmtBRL(teto)}
            </span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-s3">
            <div className={cls("h-full rounded-full", usoTeto >= 80 ? "bg-quente" : "bg-neon")} style={{ width: `${usoTeto}%` }} />
          </div>
          <p className={cls("mt-2 text-xs", usoTeto >= 80 ? "font-semibold text-quente" : "text-mute")}>
            {usoTeto.toFixed(0)}% usado{usoTeto >= 80 ? " — hora de planejar a mudança de enquadramento com a contabilidade." : ""}
          </p>
        </div>
      )}

      <Secao titulo={`Comissões · vendedor ${pct}% / casa ${100 - pct}%`}>
        <div className="cartao divide-y divide-line">
          {d.porMembro.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar id={m.user_id} nome={m.nome} tamanho={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.nome}</p>
                <p className="text-xs text-mute">
                  {m.qtd} venda{m.qtd === 1 ? "" : "s"} · {fmtBRL(m.valor)}
                  {m.casa > 0 && ` · + ${fmtBRL(m.casa)} da casa`}
                </p>
              </div>
              <span className="font-display font-extrabold text-neon">{fmtBRL(m.comissao + m.casa)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-dim">Venda do próprio dono da equipe conta 100% pra ele. O percentual muda em Ajustes.</p>
      </Secao>

      <Secao titulo="Conversão por origem">
        <div className="cartao space-y-3 p-4">
          {d.origens.map((o) => (
            <div key={o.origem}>
              <div className="flex justify-between text-sm">
                <span>{o.origem}</span>
                <span className="text-mute">
                  {o.fechados}/{o.total} · <b className="text-ink">{o.taxa}%</b>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-s3">
                <div className="h-full rounded-full bg-neon" style={{ width: `${o.taxa}%` }} />
              </div>
            </div>
          ))}
          {!d.origens.length && <p className="text-sm text-mute">Ainda sem leads.</p>}
        </div>
      </Secao>

      <Secao titulo={`Por que perdemos · ${d.perdidos}`}>
        <div className="cartao space-y-2.5 p-4">
          {d.motivos.map(([m, n]) => (
            <div key={m} className="flex items-center gap-3 text-sm">
              <span className="flex-1">{m}</span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-s3">
                <div className="h-full rounded-full bg-quente" style={{ width: `${(n / d.perdidos) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-semibold">{n}</span>
            </div>
          ))}
          {!d.motivos.length && <p className="text-sm text-mute">Nenhum lead perdido. Ainda.</p>}
        </div>
      </Secao>
      <p className="text-center text-xs text-dim">Valores usam o “valor estimado” de cada lead fechado. {nomeDe(team?.owner_id)} é o dono da equipe.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Config (admin)
function Config() {
  const { team, meuPapel, recarregar, recarregarEquipes, trocarEquipe } = useTeam();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<Team | null>(team);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setF(team), [team]);
  if (!f) return null;

  const set = <K extends keyof Team>(k: K, v: Team[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const setProduto = (i: number, p: Partial<Produto>) => set("produtos", f.produtos.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function salvar() {
    setSalvando(true);
    const produtos = f!.produtos
      .filter((p) => p.nome.trim())
      .map((p) => ({ ...p, id: p.id || p.nome.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, ""), valor: Number(p.valor) || 0 }));
    const { error } = await supabase
      .from("teams")
      .update({
        nome: f!.nome.trim(),
        descricao: f!.descricao,
        publica: f!.publica,
        comissao_vendedor_pct: Number(f!.comissao_vendedor_pct),
        meta_mensal: f!.meta_mensal ? Number(f!.meta_mensal) : null,
        teto_anual: f!.teto_anual ? Number(f!.teto_anual) : null,
        dias_para_liberar: Number(f!.dias_para_liberar) || 0,
        admin_ve_contatos: f!.admin_ve_contatos,
        produtos,
      })
      .eq("id", f!.id);
    setSalvando(false);
    if (error) return toast(erroMsg(error), "erro");
    toast("Ajustes salvos ✓");
    recarregar();
    recarregarEquipes();
  }

  return (
    <div className="space-y-7">
      <Secao titulo="Equipe">
        <div className="space-y-3">
          <Campo rotulo="Nome">
            <input className="campo" value={f.nome} onChange={(e) => set("nome", e.target.value)} />
          </Campo>
          <Campo rotulo="Descrição">
            <input className="campo" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Campo>
          <Interruptor rotulo="Aparecer na lista de equipes" dica="Desligado: só entra quem tiver o código." valor={f.publica} onChange={(v) => set("publica", v)} />
        </div>
      </Secao>

      <Secao titulo="Regras de leads">
        <div className="space-y-3">
          <Campo rotulo="Lago de leads: liberar lead parado depois de quantos dias?" dica="Se o dono ficar esse tempo sem registrar contato, qualquer um da equipe pode assumir. 0 = desligado.">
            <input className="campo" type="number" min={0} value={f.dias_para_liberar} onChange={(e) => set("dias_para_liberar", Number(e.target.value))} />
          </Campo>
          <Interruptor
            rotulo="Admins veem o contato de todos os leads"
            dica="Desligado (padrão): nem admin vê telefone/redes de lead dos outros sem liberação."
            valor={f.admin_ve_contatos}
            onChange={(v) => set("admin_ve_contatos", v)}
          />
        </div>
      </Secao>

      <Secao titulo="Dinheiro">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Comissão do vendedor (%)">
            <input className="campo" type="number" min={0} max={100} value={f.comissao_vendedor_pct} onChange={(e) => set("comissao_vendedor_pct", Number(e.target.value))} />
          </Campo>
          <Campo rotulo="Meta mensal (R$)">
            <input className="campo" type="number" min={0} value={f.meta_mensal ?? ""} onChange={(e) => set("meta_mensal", e.target.value ? Number(e.target.value) : null)} placeholder="opcional" />
          </Campo>
        </div>
        <div className="mt-2">
          <Campo rotulo="Teto anual de faturamento (R$)" dica="Ex.: limite do MEI. O app avisa quando passar de 80%.">
            <input className="campo" type="number" min={0} value={f.teto_anual ?? ""} onChange={(e) => set("teto_anual", e.target.value ? Number(e.target.value) : null)} placeholder="opcional" />
          </Campo>
        </div>
      </Secao>

      <Secao
        titulo="Produtos e preços"
        acao={
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-neon" onClick={() => set("produtos", [...f.produtos, { id: "", nome: "", valor: 0 }])}>
            <Plus size={14} /> adicionar
          </button>
        }
      >
        <div className="space-y-2">
          {f.produtos.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2">
              <input className="campo py-2.5" value={p.nome} onChange={(e) => setProduto(i, { nome: e.target.value })} placeholder="Produto" aria-label="Nome do produto" />
              <input className="campo py-2.5" type="number" min={0} value={p.valor} onChange={(e) => setProduto(i, { valor: Number(e.target.value) })} aria-label="Preço" />
              <button className="btn-ghost px-2" onClick={() => set("produtos", f.produtos.filter((_, j) => j !== i))} aria-label="Remover produto">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Secao>

      <button className="btn-neon w-full py-3.5" onClick={salvar} disabled={salvando}>
        Salvar ajustes
      </button>

      {meuPapel === "dono" && (
        <button
          className="btn-perigo w-full"
          onClick={async () => {
            const n = prompt(`Isso apaga a equipe e TODOS os leads dela. Digite o nome da equipe (${f.nome}) pra confirmar:`);
            if (n?.trim() !== f.nome) return;
            const { error } = await supabase.from("teams").delete().eq("id", f.id);
            if (error) return toast(erroMsg(error), "erro");
            trocarEquipe(null);
            await recarregarEquipes();
            nav("/equipes");
          }}
        >
          <Trash2 size={16} /> Excluir equipe
        </button>
      )}
    </div>
  );
}

function Interruptor({ rotulo, dica, valor, onChange }: { rotulo: string; dica?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-s2 p-3.5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#39FF14]" checked={valor} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold">{rotulo}</span>
        {dica && <span className="block text-xs text-mute">{dica}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- Conta
function Conta() {
  const { user, nome, salvarNome, sair } = useAuth();
  const { leads, nomeDe, team } = useTeam();
  const toast = useToast();
  const [novoNome, setNovoNome] = useState(nome);
  const [instalavel, setInstalavel] = useState(() => Boolean((window as unknown as { __instalar?: unknown }).__instalar));
  useEffect(() => setNovoNome(nome), [nome]);
  useEffect(() => {
    const f = () => setInstalavel(true);
    window.addEventListener("instalavel", f);
    return () => window.removeEventListener("instalavel", f);
  }, []);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;

  async function exportar(soMeus: boolean) {
    const alvo = soMeus ? leads.filter((l) => l.owner_id === user?.id) : leads;
    const { data } = await supabase.from("lead_contacts").select("*").in("lead_id", alvo.map((l) => l.id).slice(0, 900));
    const contatos = new Map(((data ?? []) as LeadContact[]).map((c) => [c.lead_id, c]));
    const linhas = [
      ["Negócio", "Nicho", "Bairro", "Cidade", "Dono", "Etapa", "Temperatura", "Valor", "Origem", "Responsável", "WhatsApp", "Telefone", "E-mail", "Instagram", "Endereço", "Próximo contato", "Registrado em"],
      ...alvo.map((l) => {
        const c = contatos.get(l.id);
        return [
          l.nome_negocio, l.nicho, l.bairro, l.cidade, nomeDe(l.owner_id), l.estagio, l.temperatura, l.valor_estimado, l.origem,
          c?.responsavel, c?.whatsapp, c?.telefone, c?.email, c?.instagram, c?.endereco,
          l.proximo_followup ? new Date(l.proximo_followup).toLocaleString("pt-BR") : "", new Date(l.created_at).toLocaleString("pt-BR"),
        ];
      }),
    ];
    baixarArquivo(`leads-${(team?.nome ?? "equipe").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, csv(linhas));
    toast(`${alvo.length} leads exportados (contatos só dos que você pode ver).`);
  }

  return (
    <div className="space-y-7">
      <Secao titulo="Seu perfil">
        <div className="cartao space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar id={user?.id ?? "x"} nome={nome} tamanho={48} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{nome}</p>
              <p className="truncate text-sm text-mute">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input className="campo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} aria-label="Seu nome" />
            <button
              className="btn-sec shrink-0"
              disabled={novoNome.trim() === nome || novoNome.trim().length < 2}
              onClick={() =>
                salvarNome(novoNome)
                  .then(() => toast("Nome atualizado"))
                  .catch((e) => toast(erroMsg(e), "erro"))
              }
            >
              Salvar
            </button>
          </div>
        </div>
      </Secao>

      {!standalone && (
        <Secao titulo="App no celular">
          <div className="cartao p-4">
            {instalavel ? (
              <button
                className="btn-neon w-full"
                onClick={async () => {
                  const ev = (window as unknown as { __instalar?: { prompt: () => Promise<void> } }).__instalar;
                  await ev?.prompt();
                }}
              >
                <Smartphone size={18} /> Instalar CLYENT CRM
              </button>
            ) : (
              <p className="text-sm text-mute">
                {ios ? (
                  <>
                    No iPhone: abra no <b className="text-ink">Safari</b>, toque em <b className="text-ink">Compartilhar</b> e depois em <b className="text-ink">Adicionar à Tela de Início</b>.
                  </>
                ) : (
                  <>
                    No Android: no Chrome, toque nos <b className="text-ink">⋮</b> e em <b className="text-ink">Instalar app</b> (ou “Adicionar à tela inicial”).
                  </>
                )}
              </p>
            )}
          </div>
        </Secao>
      )}

      <Secao titulo="Seus dados">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-sec" onClick={() => exportar(true)}>
            <Download size={16} /> Meus leads (CSV)
          </button>
          <button className="btn-sec" onClick={() => exportar(false)}>
            <Download size={16} /> Equipe (CSV)
          </button>
        </div>
      </Secao>

      <button className="btn-perigo w-full" onClick={sair}>
        <LogOut size={16} /> Sair da conta
      </button>
      <p className="text-center text-xs text-dim">CLYENT CRM · v1.0</p>
    </div>
  );
}
