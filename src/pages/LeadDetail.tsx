import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, AtSign, Copy, ExternalLink, Globe, Handshake, KeyRound, Loader2, Lock, Mail, MapPin, MessageCircle,
  Mic, Navigation, Pencil, Phone, Send, Sparkles, Square, Trash2, UserRoundPlus, Users, Waves, X,
} from "lucide-react";
import EscolherMembro from "../components/EscolherMembro";
import MotivoPerda from "../components/MotivoPerda";
import TempSlider from "../components/TempSlider";
import { Avatar, Carregando, Secao, Sheet } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { useAcoesLead } from "../context/useAcoesLead";
import { analisarTemperatura, gerarMensagem, OBJETIVOS, transcrever, type Analise, type Objetivo } from "../lib/ai";
import { useGravador } from "../lib/audio";
import { ATIVIDADE_EMOJI, ESTAGIOS, ESTAGIOS_ABERTOS, PRODUCAO, RESULTADOS, TIPOS_ATIVIDADE } from "../lib/constants";
import { pegarPosicao } from "../lib/geo";
import { COLS_LEAD, supabase } from "../lib/supabase";
import type { Activity, Lead, LeadContact, TipoAtividade } from "../lib/types";
import {
  cls, corTemp, daquiDias, diasDesde, erroMsg, FAIXA_INFO, faixaTemp, fmtBRL, fmtData, fmtDataHora, instaLink,
  mapsLink, statusFollowup, telLink, tempoRelativo, urlLink, vibrar, waLink,
} from "../lib/utils";

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, nome: meuNome } = useAuth();
  const { leads, team, nomeDe, podeVerContato, podeEditar, meusPedidos, recarregar, isAdmin } = useTeam();
  const { mover, moverProducao, atualizar } = useAcoesLead();

  const doContexto = leads.find((l) => l.id === id) ?? null;
  const [avulso, setAvulso] = useState<Lead | null>(null);
  const lead = doContexto ?? avulso;
  const [contato, setContato] = useState<LeadContact | null>(null);
  const [atividades, setAtividades] = useState<Activity[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const [shares, setShares] = useState<string[]>([]);
  const [naoAchou, setNaoAchou] = useState(false);

  const [temp, setTemp] = useState<number | null>(null);
  const tempTimer = useRef<number>();
  const [perdendo, setPerdendo] = useState(false);
  const [picker, setPicker] = useState<null | "compartilhar" | "transferir">(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msgAberta, setMsgAberta] = useState(false);
  const [registro, setRegistro] = useState<TipoAtividade | null>(null);
  const [analise, setAnalise] = useState<(Analise & { local: boolean }) | null>(null);

  const vejo = lead ? podeVerContato(lead) : false;
  const edito = lead ? podeEditar(lead) : false;
  const meu = lead?.owner_id === user?.id;

  const carregarExtras = useCallback(async () => {
    if (!id) return;
    const [f, c, a, s] = await Promise.all([
      supabase.from("leads").select("foto").eq("id", id).maybeSingle(),
      supabase.from("lead_contacts").select("*").eq("lead_id", id).maybeSingle(),
      supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      supabase.from("lead_shares").select("user_id").eq("lead_id", id),
    ]);
    setFoto((f.data as { foto: string | null } | null)?.foto ?? null);
    setContato((c.data as LeadContact | null) ?? null);
    setAtividades((a.data ?? []) as Activity[]);
    setShares(((s.data ?? []) as { user_id: string }[]).map((x) => x.user_id));
  }, [id]);

  useEffect(() => {
    if (doContexto || !id) return;
    supabase
      .from("leads")
      .select(COLS_LEAD)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => (data ? setAvulso(data as unknown as Lead) : setNaoAchou(true)));
  }, [id, doContexto]);

  useEffect(() => {
    carregarExtras();
  }, [carregarExtras, lead?.updated_at, vejo]);

  useEffect(() => setTemp(null), [lead?.temperatura]);

  if (naoAchou)
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="font-semibold">Lead não encontrado</p>
        <p className="mt-1 text-sm text-mute">Pode ter sido excluído ou ser de outra equipe.</p>
        <Link to="/leads" className="btn-sec mt-6">
          Voltar pros leads
        </Link>
      </div>
    );
  if (!lead) return <Carregando texto="Abrindo lead…" />;

  const dias = diasDesde(lead.ultimo_contato_em);
  const aberto = ESTAGIOS_ABERTOS.includes(lead.estagio);
  const fu = statusFollowup(lead.proximo_followup);
  const tempAtual = temp ?? lead.temperatura;
  const diasLago = team?.dias_para_liberar ?? 0;
  const podeAssumir = !meu && aberto && diasLago > 0 && dias >= diasLago;
  const pedido = meusPedidos[lead.id];
  const nomesProdutos = lead.produtos.map((p) => team?.produtos.find((x) => x.id === p)?.nome ?? p);
  const resultado = RESULTADOS.find((r) => r.id === lead.resultado_abordagem);

  function mudarTemp(v: number) {
    setTemp(v);
    window.clearTimeout(tempTimer.current);
    tempTimer.current = window.setTimeout(() => atualizar(lead!, { temperatura: v }), 700);
  }

  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    setOcupado(nome);
    const { error } = await supabase.rpc(nome, args);
    setOcupado(null);
    if (error) {
      toast(erroMsg(error), "erro");
      return false;
    }
    toast(ok);
    await recarregar();
    carregarExtras();
    return true;
  }

  async function excluir() {
    if (!confirm(`Excluir ${lead!.nome_negocio}? Isso apaga o histórico também.`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead!.id);
    if (error) return toast(erroMsg(error), "erro");
    toast("Lead excluído.");
    await recarregar();
    nav("/leads", { replace: true });
  }

  async function registrarAtividade(tipo: TipoAtividade, conteudo: string, comGps = false) {
    let lat: number | null = null;
    let lng: number | null = null;
    if (comGps) {
      try {
        const p = await pegarPosicao(8000);
        lat = p.lat;
        lng = p.lng;
      } catch {
        /* registra sem GPS */
      }
    }
    const { error } = await supabase.from("lead_activities").insert({ lead_id: lead!.id, user_id: user!.id, tipo, conteudo, lat, lng });
    if (error) return toast(erroMsg(error), "erro");
    vibrar(12);
    toast("Registrado ✓");
    recarregar();
    carregarExtras();
  }

  async function analisar() {
    setOcupado("analise");
    const r = await analisarTemperatura(lead!, atividades);
    setOcupado(null);
    setAnalise({ ...r.dados, local: r.local });
  }

  return (
    <div className="mx-auto max-w-2xl pb-6">
      {/* topo */}
      <div className="relative">
        {foto ? (
          <div className="relative h-52 w-full overflow-hidden sm:mt-4 sm:rounded-2xl">
            <img src={foto} alt={`Fachada de ${lead.nome_negocio}`} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-fundo via-fundo/30 to-transparent" />
          </div>
        ) : (
          <div className="h-16" />
        )}
        <div className="absolute inset-x-0 top-3 flex justify-between px-3">
          <button onClick={() => nav(-1)} className="rounded-full bg-black/60 p-2.5 backdrop-blur" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          {edito && (
            <div className="flex gap-2">
              <Link to={`/leads/${lead.id}/editar`} className="rounded-full bg-black/60 p-2.5 backdrop-blur" aria-label="Editar">
                <Pencil size={18} />
              </Link>
              <button onClick={excluir} className="rounded-full bg-black/60 p-2.5 text-quente backdrop-blur" aria-label="Excluir lead">
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-7 px-4">
        <div className={foto ? "-mt-10 relative" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight">{lead.nome_negocio}</h1>
              <p className="mt-0.5 text-mute">{[lead.nicho, lead.bairro, lead.cidade].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-[34px] font-black leading-none" style={{ color: corTemp(tempAtual) }}>
                {tempAtual}°
              </div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: corTemp(tempAtual) }}>
                {FAIXA_INFO[faixaTemp(tempAtual)].emoji} {FAIXA_INFO[faixaTemp(tempAtual)].label}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-mute">
            <span className="inline-flex items-center gap-2">
              <Avatar id={lead.owner_id} nome={nomeDe(lead.owner_id)} tamanho={22} />
              {meu ? <b className="text-neon">Seu lead</b> : <span>Lead de <b className="text-ink">{nomeDe(lead.owner_id)}</b></span>}
            </span>
            <span>Registrado {tempoRelativo(lead.created_at)}</span>
            {aberto && <span className={cls(dias >= 5 && "font-semibold text-quente")}>Último contato {dias === 0 ? "hoje" : `há ${dias}d`}</span>}
          </div>
        </div>

        {/* CONTATO */}
        {vejo ? (
          <section className="cartao overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{contato?.responsavel || "Contato"}</p>
                {contato?.cargo && <p className="text-xs text-mute">{contato.cargo}</p>}
              </div>
              {!meu && <span className="text-[11px] font-semibold text-neon">contato liberado pra você</span>}
            </div>
            <div className="grid grid-cols-4 gap-px bg-line">
              <AcaoContato href={waLink(contato?.whatsapp)} icone={<MessageCircle size={20} />} rotulo="WhatsApp" destaque onClick={() => registrarAtividade("whatsapp", "Abriu conversa no WhatsApp")} />
              <AcaoContato href={telLink(contato?.telefone || contato?.whatsapp)} icone={<Phone size={20} />} rotulo="Ligar" onClick={() => registrarAtividade("ligacao", "Ligou pelo app")} />
              <AcaoContato href={instaLink(contato?.instagram)} icone={<AtSign size={20} />} rotulo="Instagram" />
              <AcaoContato href={mapsLink(contato?.lat, contato?.lng, contato?.endereco)} icone={<Navigation size={20} />} rotulo="Rota" />
            </div>
            <dl className="space-y-2 px-4 py-3 text-sm">
              <Info rotulo="WhatsApp" valor={contato?.whatsapp} />
              <Info rotulo="Telefone" valor={contato?.telefone} />
              <Info rotulo="E-mail" valor={contato?.email} href={contato?.email ? `mailto:${contato.email}` : null} icone={<Mail size={13} />} />
              <Info rotulo="Instagram" valor={contato?.instagram} href={instaLink(contato?.instagram)} />
              <Info rotulo="Facebook" valor={contato?.facebook} href={urlLink(contato?.facebook && !contato.facebook.includes(".") ? `facebook.com/${contato.facebook}` : contato?.facebook)} />
              <Info rotulo="TikTok" valor={contato?.tiktok} href={contato?.tiktok ? `https://tiktok.com/@${contato.tiktok.replace(/^@/, "")}` : null} />
              <Info rotulo="LinkedIn" valor={contato?.linkedin} href={urlLink(contato?.linkedin)} />
              <Info rotulo="Site" valor={contato?.site} href={urlLink(contato?.site)} icone={<Globe size={13} />} />
              <Info rotulo="Endereço" valor={contato?.endereco} href={mapsLink(contato?.lat, contato?.lng, contato?.endereco)} icone={<MapPin size={13} />} />
              {!contato && <p className="text-mute">Carregando contato…</p>}
            </dl>
          </section>
        ) : (
          <section className="cartao border-dashed p-5 text-center">
            <Lock className="mx-auto text-mute" size={26} />
            <p className="mt-2 font-semibold">Contato protegido</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-mute">
              Telefone, redes e notas desse lead são de <b className="text-ink">{nomeDe(lead.owner_id)}</b>. Você vê o registro pra ninguém prospectar o mesmo cliente duas vezes.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {pedido === "pendente" ? (
                <span className="btn-sec pointer-events-none text-morno">Pedido enviado — aguardando {nomeDe(lead.owner_id).split(" ")[0]}</span>
              ) : (
                <button
                  className="btn-sec"
                  disabled={ocupado === "pedir_acesso"}
                  onClick={() => rpc("pedir_acesso", { p_lead: lead.id, p_mensagem: `${meuNome} pediu o contato` }, `Pedido enviado pra ${nomeDe(lead.owner_id)}.`)}
                >
                  <KeyRound size={16} /> {pedido === "recusado" ? "Pedir acesso de novo" : "Pedir acesso ao contato"}
                </button>
              )}
              {podeAssumir && (
                <button
                  className="btn-neon"
                  disabled={ocupado === "assumir_lead"}
                  onClick={() => rpc("assumir_lead", { p_lead: lead.id }, "Agora o lead é seu. Bora!")}
                >
                  <Waves size={16} /> Assumir lead (parado há {dias}d)
                </button>
              )}
            </div>
          </section>
        )}

        {/* TERMÔMETRO */}
        {edito ? (
          <Secao titulo="Termômetro">
            <div className="cartao p-4">
              <TempSlider valor={tempAtual} onChange={mudarTemp} />
              {vejo && (
                <button onClick={analisar} disabled={ocupado === "analise"} className="btn-ghost mt-2 w-full text-[13px] text-neon">
                  {ocupado === "analise" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} IA, lê as notas e me diz a temperatura
                </button>
              )}
              {analise && (
                <div className="mt-2 rounded-xl border border-neon/30 bg-neon/5 p-3 text-sm">
                  <p>
                    Sugestão: <b style={{ color: corTemp(analise.temperatura) }}>{analise.temperatura}°</b> — {analise.motivo}
                  </p>
                  {analise.proximo_passo && <p className="mt-1 text-mute">Próximo passo: {analise.proximo_passo}</p>}
                  {analise.local && <p className="mt-1 text-xs text-dim">(modo offline da IA — publique o agente pra análise completa)</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn-neon px-3 py-2 text-xs"
                      onClick={() => {
                        atualizar(lead, { temperatura: analise.temperatura, ...(analise.proximo_passo ? { proximo_passo: analise.proximo_passo } : {}) }, "Temperatura atualizada");
                        setAnalise(null);
                      }}
                    >
                      Aplicar
                    </button>
                    <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setAnalise(null)}>
                      Ignorar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Secao>
        ) : null}

        {/* FUNIL */}
        <Secao titulo="Etapa">
          <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4">
            {ESTAGIOS.map((e) => {
              const atual = lead.estagio === e.id;
              return (
                <button
                  key={e.id}
                  disabled={!edito}
                  onClick={() => (e.id === "perdido" ? setPerdendo(true) : mover(lead, e.id))}
                  className={cls("chip shrink-0 px-3.5 py-2 font-semibold", atual ? "border-transparent text-fundo" : !edito && "opacity-50")}
                  style={atual ? { background: e.cor } : undefined}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
          {lead.estagio === "perdido" && lead.motivo_perda && <p className="mt-2 text-sm text-mute">Motivo: {lead.motivo_perda}</p>}
          {lead.estagio === "fechado" && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-mute">Produção · fechado em {fmtData(lead.fechado_em)}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {PRODUCAO.map((p) => (
                  <button
                    key={p.id}
                    disabled={!edito}
                    onClick={() => moverProducao(lead, p.id)}
                    className={cls("chip justify-center px-1 text-[12px]", (lead.producao_status ?? "afazer") === p.id && "chip-on")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Secao>

        {/* PRÓXIMO PASSO */}
        {aberto && (
          <Secao titulo="Próximo passo">
            <div className={cls("cartao p-4", fu === "atrasado" && "border-quente/50", fu === "hoje" && "border-neon/40")}>
              {lead.proximo_followup ? (
                <p className="font-semibold">
                  {lead.proximo_passo || "Retomar contato"}{" "}
                  <span className={cls("font-normal", fu === "atrasado" ? "text-quente" : fu === "hoje" ? "text-neon" : "text-mute")}>
                    · {fu === "atrasado" ? "atrasado desde " : ""}
                    {fmtDataHora(lead.proximo_followup)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-morno">Sem data marcada — lead sem próximo passo esfria.</p>
              )}
              {edito && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { r: "Amanhã", d: 1 },
                    { r: "+3 dias", d: 3 },
                    { r: "+1 semana", d: 7 },
                    { r: "+1 mês", d: 30 },
                  ].map((o) => (
                    <button key={o.r} className="chip" onClick={() => atualizar(lead, { proximo_followup: new Date(daquiDias(o.d)).toISOString() }, `Próximo contato: ${o.r.toLowerCase()}`)}>
                      {o.r}
                    </button>
                  ))}
                  <input
                    type="datetime-local"
                    className="chip bg-s2 text-ink"
                    aria-label="Escolher data"
                    onChange={(e) => e.target.value && atualizar(lead, { proximo_followup: new Date(e.target.value).toISOString() }, "Data marcada")}
                  />
                </div>
              )}
            </div>
          </Secao>
        )}

        {/* IA + REGISTRAR */}
        {vejo && (
          <Secao titulo="Ação">
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-neon col-span-2 py-3.5" onClick={() => setMsgAberta(true)}>
                <Sparkles size={18} /> Escrever mensagem com IA
              </button>
              <button className="btn-sec" onClick={() => registrarAtividade("visita", "Visita registrada no local", true)}>
                📍 Visitei agora
              </button>
              <button className="btn-sec" onClick={() => setRegistro("nota")}>
                📝 Anotar
              </button>
              <button className="btn-sec" onClick={() => setRegistro("ligacao")}>
                📞 Liguei
              </button>
              <button className="btn-sec" onClick={() => setRegistro("reuniao")}>
                <Handshake size={16} /> Reunião
              </button>
            </div>
          </Secao>
        )}

        {/* COMPARTILHAMENTO */}
        {(meu || isAdmin) && (
          <Secao titulo="Quem vê o contato">
            <div className="cartao divide-y divide-line">
              <label className="flex items-center gap-3 p-4">
                <Users size={18} className="shrink-0 text-mute" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Liberado pra equipe toda</span>
                  <span className="block text-xs text-mute">Todo mundo da {team?.nome} vê telefone, redes e notas</span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#39FF14]"
                  checked={lead.contato_liberado}
                  onChange={(e) => atualizar(lead, { contato_liberado: e.target.checked }, e.target.checked ? "Contato liberado pra equipe" : "Contato voltou a ser só seu")}
                />
              </label>
              {shares.map((uid) => (
                <div key={uid} className="flex items-center gap-3 px-4 py-3">
                  <Avatar id={uid} nome={nomeDe(uid)} tamanho={26} />
                  <span className="flex-1 text-sm">{nomeDe(uid)}</span>
                  <button
                    className="rounded-full p-1.5 text-mute hover:text-quente"
                    aria-label={`Tirar acesso de ${nomeDe(uid)}`}
                    onClick={() => rpc("remover_compartilhamento", { p_lead: lead.id, p_user: uid }, "Acesso removido")}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 p-3">
                <button className="btn-sec px-2 text-[13px]" onClick={() => setPicker("compartilhar")}>
                  <UserRoundPlus size={16} /> Liberar pra alguém
                </button>
                <button className="btn-sec px-2 text-[13px]" onClick={() => setPicker("transferir")}>
                  <Send size={16} /> Passar o lead
                </button>
              </div>
            </div>
          </Secao>
        )}

        {/* SOBRE */}
        <Secao titulo="Sobre">
          <div className="cartao space-y-3 p-4 text-sm">
            {lead.descricao ? <p className="whitespace-pre-wrap leading-relaxed">{lead.descricao}</p> : <p className="text-mute">Sem descrição.</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
              <Dado r="Valor estimado" v={fmtBRL(lead.valor_estimado)} />
              <Dado r="Origem" v={lead.origem ?? "—"} />
              <Dado r="Produtos" v={nomesProdutos.join(", ") || "—"} />
              <Dado r="Abordagem" v={resultado ? `${resultado.emoji} ${resultado.label}` : "—"} />
            </dl>
            {lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {lead.tags.map((t) => (
                  <span key={t} className="rounded-md bg-s3 px-2 py-0.5 text-xs text-mute">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Secao>

        {/* HISTÓRICO */}
        {vejo && (
          <Secao titulo={`Histórico · ${atividades.length}`}>
            {atividades.length ? (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {atividades.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[29px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-s2 text-[10px] ring-4 ring-fundo">
                      {ATIVIDADE_EMOJI[a.tipo]}
                    </span>
                    <p className={cls("whitespace-pre-wrap text-sm", a.tipo === "sistema" && "text-mute")}>{a.conteudo}</p>
                    <p className="mt-0.5 text-xs text-dim">
                      {nomeDe(a.user_id)} · {fmtDataHora(a.created_at)}
                      {a.lat != null && a.lng != null && (
                        <a href={mapsLink(a.lat, a.lng) ?? "#"} target="_blank" rel="noreferrer" className="ml-1 text-neon/80">
                          · 📍 no local
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-mute">Nada registrado ainda.</p>
            )}
          </Secao>
        )}
      </div>

      <MotivoPerda
        aberto={perdendo}
        onFechar={() => setPerdendo(false)}
        onConfirmar={(m) => {
          mover(lead, "perdido", m);
          setPerdendo(false);
        }}
      />

      <EscolherMembro
        aberto={picker !== null}
        titulo={picker === "transferir" ? "Passar o lead pra quem?" : "Liberar o contato pra quem?"}
        excluir={[lead.owner_id, ...(picker === "compartilhar" ? shares : [])]}
        onFechar={() => setPicker(null)}
        onEscolher={async (uid, nome) => {
          const tipo = picker;
          setPicker(null);
          if (tipo === "transferir") {
            if (!confirm(`Passar ${lead.nome_negocio} pra ${nome}? O lead deixa de ser ${meu ? "seu" : "de " + nomeDe(lead.owner_id)}.`)) return;
            await rpc("transferir_lead", { p_lead: lead.id, p_para: uid }, `Lead passado pra ${nome}.`);
          } else {
            await rpc("compartilhar_lead", { p_lead: lead.id, p_user: uid }, `${nome} agora vê o contato.`);
          }
        }}
      />

      {vejo && (
        <MensagemIA
          aberto={msgAberta}
          onFechar={() => setMsgAberta(false)}
          lead={lead}
          contato={contato}
          vendedor={meuNome}
          onEnviado={() => registrarAtividade("whatsapp", "Mensagem enviada pelo WhatsApp")}
        />
      )}

      <RegistrarAtividade
        tipo={registro}
        onFechar={() => setRegistro(null)}
        onSalvar={async (tipo, texto) => {
          setRegistro(null);
          await registrarAtividade(tipo, texto);
        }}
      />
    </div>
  );
}

function AcaoContato({ href, icone, rotulo, destaque, onClick }: { href: string | null; icone: React.ReactNode; rotulo: string; destaque?: boolean; onClick?: () => void }) {
  if (!href)
    return (
      <span className="flex flex-col items-center gap-1 bg-s1 py-3.5 text-[11px] text-dim/60">
        {icone}
        {rotulo}
      </span>
    );
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      onClick={onClick}
      className={cls("flex flex-col items-center gap-1 bg-s1 py-3.5 text-[11px] font-semibold transition hover:bg-s2", destaque ? "text-neon" : "text-ink")}
    >
      {icone}
      {rotulo}
    </a>
  );
}

function Info({ rotulo, valor, href, icone }: { rotulo: string; valor: string | null | undefined; href?: string | null; icone?: React.ReactNode }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-mute">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:text-neon">
            {icone}
            {valor}
          </a>
        ) : (
          <button
            className="hover:text-neon"
            onClick={() => {
              navigator.clipboard?.writeText(valor);
            }}
            title="Copiar"
          >
            {valor}
          </button>
        )}
      </dd>
    </div>
  );
}

function Dado({ r, v }: { r: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-mute">{r}</dt>
      <dd className="truncate font-medium">{v}</dd>
    </div>
  );
}

function MensagemIA({
  aberto,
  onFechar,
  lead,
  contato,
  vendedor,
  onEnviado,
}: {
  aberto: boolean;
  onFechar: () => void;
  lead: Lead;
  contato: LeadContact | null;
  vendedor: string;
  onEnviado: () => void;
}) {
  const sugestaoInicial: Objetivo =
    lead.estagio === "novo" ? "primeiro" : lead.estagio === "proposta" ? "fechamento" : diasDesde(lead.ultimo_contato_em) >= 7 ? "reativar" : "followup";
  const [objetivo, setObjetivo] = useState<Objetivo>(sugestaoInicial);
  const [objecao, setObjecao] = useState("");
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [local, setLocal] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (aberto) {
      setTexto("");
      setObjetivo(sugestaoInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  async function gerar() {
    setGerando(true);
    const r = await gerarMensagem({ lead, contato, objetivo, objecao, vendedor });
    setGerando(false);
    setTexto(r.dados);
    setLocal(r.local);
  }

  const link = waLink(contato?.whatsapp, texto);

  return (
    <Sheet aberto={aberto} onFechar={onFechar} titulo="Mensagem pro cliente">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {OBJETIVOS.map((o) => (
            <button key={o.id} onClick={() => setObjetivo(o.id)} className={cls("chip", objetivo === o.id && "chip-on")}>
              {o.label}
            </button>
          ))}
        </div>
        {objetivo === "objecao" && (
          <textarea className="campo" value={objecao} onChange={(e) => setObjecao(e.target.value)} placeholder='Cole o que o cliente falou. Ex.: "tá caro, vou pensar"' />
        )}
        <button className="btn-neon w-full" onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} {texto ? "Gerar outra" : "Gerar mensagem"}
        </button>
        {texto && (
          <>
            <textarea className="campo min-h-[150px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
            {local && <p className="text-xs text-dim">Modelo pronto do app (o agente de IA ainda não foi publicado no Supabase).</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-sec"
                onClick={() => {
                  navigator.clipboard?.writeText(texto);
                  toast("Copiado");
                }}
              >
                <Copy size={16} /> Copiar
              </button>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-neon"
                  onClick={() => {
                    onEnviado();
                    onFechar();
                  }}
                >
                  <ExternalLink size={16} /> Abrir no WhatsApp
                </a>
              ) : (
                <span className="btn-sec pointer-events-none text-dim">Sem WhatsApp</span>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function RegistrarAtividade({ tipo, onFechar, onSalvar }: { tipo: TipoAtividade | null; onFechar: () => void; onSalvar: (t: TipoAtividade, texto: string) => void }) {
  const [t, setT] = useState<TipoAtividade>("nota");
  const [texto, setTexto] = useState("");
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useGravador();
  const toast = useToast();

  useEffect(() => {
    if (tipo) {
      setT(tipo);
      setTexto("");
    }
  }, [tipo]);

  async function voz() {
    if (gravador.gravando) {
      const a = await gravador.parar();
      if (a.size < 2000) return;
      setTranscrevendo(true);
      try {
        const r = await transcrever(a);
        setTexto((x) => (x ? `${x} ${r}` : r));
      } catch (e) {
        toast(`Não deu pra transcrever: ${erroMsg(e)}`, "erro");
      } finally {
        setTranscrevendo(false);
      }
    } else {
      try {
        await gravador.iniciar();
      } catch {
        toast("Libere o microfone.", "erro");
      }
    }
  }

  return (
    <Sheet aberto={tipo !== null} onFechar={onFechar} titulo="Registrar">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TIPOS_ATIVIDADE.filter((x) => !["sistema", "ia", "visita"].includes(x.id)).map((x) => (
            <button key={x.id} onClick={() => setT(x.id)} className={cls("chip", t === x.id && "chip-on")}>
              {x.emoji} {x.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea className="campo min-h-[120px] pr-14" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Como foi?" autoFocus />
          {gravador.suportado && (
            <button
              onClick={voz}
              disabled={transcrevendo}
              className={cls("absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full", gravador.gravando ? "pulsar bg-quente text-white" : "bg-s3 text-neon")}
              aria-label={gravador.gravando ? "Parar" : "Ditar por voz"}
            >
              {transcrevendo ? <Loader2 size={18} className="animate-spin" /> : gravador.gravando ? <Square size={16} /> : <Mic size={18} />}
            </button>
          )}
        </div>
        <button className="btn-neon w-full" disabled={!texto.trim()} onClick={() => onSalvar(t, texto.trim())}>
          Registrar
        </button>
      </div>
    </Sheet>
  );
}
