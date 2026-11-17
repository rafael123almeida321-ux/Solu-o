import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Crosshair, Loader2, Lock, MapPin, Mic, Square, Trash2, TriangleAlert, Unlock } from "lucide-react";
import TempSlider from "../components/TempSlider";
import { Campo, Carregando, Segmentado } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { transcrever } from "../lib/ai";
import { useGravador } from "../lib/audio";
import { ESTAGIOS, MOTIVOS_PERDA, NICHOS, ORIGENS, RESULTADOS, sugerirNicho } from "../lib/constants";
import { enderecoDe, pegarPosicao } from "../lib/geo";
import { comprimirImagem } from "../lib/image";
import { ehErroDeRede, fila } from "../lib/outbox";
import { COLS_LEAD, supabase } from "../lib/supabase";
import type { Lead, LeadContact, LeadDraft } from "../lib/types";
import { cls, daquiDias, erroMsg, fmtBRL, toLocalInput, uuid, vibrar } from "../lib/utils";

const CONTATO_VAZIO: LeadDraft["contato"] = {
  responsavel: "", cargo: "", whatsapp: "", telefone: "", email: "", instagram: "", facebook: "",
  tiktok: "", linkedin: "", site: "", endereco: "", lat: null, lng: null,
};

function rascunhoVazio(): LeadDraft {
  return {
    nome_negocio: "", nicho: "", descricao: "", bairro: "", cidade: "", origem: "Prospecção presencial",
    temperatura: 50, estagio: "novo", produtos: [], valor_estimado: 0, tags: [], resultado_abordagem: "",
    proximo_followup: daquiDias(2), proximo_passo: "", contato_liberado: false, foto: "", nota: "",
    contato: { ...CONTATO_VAZIO },
  };
}

function deLead(l: Lead & { foto?: string | null }, c: LeadContact | null): LeadDraft {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    id: l.id, nome_negocio: l.nome_negocio, nicho: s(l.nicho), descricao: s(l.descricao), bairro: s(l.bairro),
    cidade: s(l.cidade), origem: s(l.origem), temperatura: l.temperatura, estagio: l.estagio,
    produtos: l.produtos ?? [], valor_estimado: Number(l.valor_estimado || 0), tags: l.tags ?? [],
    resultado_abordagem: s(l.resultado_abordagem), proximo_followup: toLocalInput(l.proximo_followup),
    proximo_passo: s(l.proximo_passo), contato_liberado: l.contato_liberado, foto: s(l.foto), nota: "",
    contato: c
      ? {
          responsavel: s(c.responsavel), cargo: s(c.cargo), whatsapp: s(c.whatsapp), telefone: s(c.telefone),
          email: s(c.email), instagram: s(c.instagram), facebook: s(c.facebook), tiktok: s(c.tiktok),
          linkedin: s(c.linkedin), site: s(c.site), endereco: s(c.endereco), lat: c.lat, lng: c.lng,
        }
      : { ...CONTATO_VAZIO },
  };
}

export default function LeadForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const { team, teamId, recarregar, podeEditar } = useTeam();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [d, setD] = useState<LeadDraft>(rascunhoVazio);
  const [modo, setModo] = useState<"rapido" | "completo">(() =>
    editando || localStorage.getItem("clyent-form-modo") === "completo" ? "completo" : "rapido",
  );
  const [carregandoLead, setCarregandoLead] = useState(editando);
  const [contatoVisivel, setContatoVisivel] = useState(true);
  const [motivoPerda, setMotivoPerda] = useState("");
  const [estagioOriginal, setEstagioOriginal] = useState<string>("novo");
  const [gps, setGps] = useState<"parado" | "buscando" | "ok" | "erro">("parado");
  const [precisao, setPrecisao] = useState<number | null>(null);
  const [duplicados, setDuplicados] = useState<{ lead_id: string; nome_negocio: string; dono: string; motivo: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [nichoTocado, setNichoTocado] = useState(false);
  const [valorTocado, setValorTocado] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useGravador();
  const fotoRef = useRef<HTMLInputElement>(null);

  const produtosCatalogo = team?.produtos ?? [];
  const completo = modo === "completo";

  const set = <K extends keyof LeadDraft>(k: K, v: LeadDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setC = <K extends keyof LeadDraft["contato"]>(k: K, v: LeadDraft["contato"][K]) =>
    setD((x) => ({ ...x, contato: { ...x.contato, [k]: v } }));

  // ----- carregar pra edição
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [l, c] = await Promise.all([
        supabase.from("leads").select(COLS_LEAD + ",foto").eq("id", id).maybeSingle(),
        supabase.from("lead_contacts").select("*").eq("lead_id", id).maybeSingle(),
      ]);
      const lead = l.data as unknown as (Lead & { foto: string | null }) | null;
      if (!lead) {
        toast("Lead não encontrado.", "erro");
        nav("/leads");
        return;
      }
      if (!podeEditar(lead)) {
        toast("Só o dono do lead (ou admin) pode editar.", "erro");
        nav(`/leads/${id}`);
        return;
      }
      setContatoVisivel(Boolean(c.data));
      setD(deLead(lead, c.data as LeadContact | null));
      setEstagioOriginal(lead.estagio);
      setMotivoPerda(lead.motivo_perda ?? "");
      setNichoTocado(true);
      setValorTocado(true);
      setCarregandoLead(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ----- GPS automático no cadastro novo (se já tiver permissão)
  useEffect(() => {
    if (editando) return;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "granted") localizar();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- nicho sugerido pelo nome
  useEffect(() => {
    if (nichoTocado) return;
    const s = sugerirNicho(d.nome_negocio);
    if (s && s !== d.nicho) set("nicho", s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.nome_negocio, nichoTocado]);

  // ----- valor automático pelos produtos
  const valorAuto = useMemo(
    () => d.produtos.reduce((s, pid) => s + Number(produtosCatalogo.find((p) => p.id === pid)?.valor ?? 0), 0),
    [d.produtos, produtosCatalogo],
  );
  useEffect(() => {
    if (!valorTocado) set("valor_estimado", valorAuto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorAuto, valorTocado]);

  // ----- aviso de duplicado (sem revelar contato de ninguém)
  useEffect(() => {
    if (!teamId) return;
    const nome = d.nome_negocio.trim();
    const fone = d.contato.whatsapp || d.contato.telefone;
    if (nome.length < 3 && fone.replace(/\D/g, "").length < 8) {
      setDuplicados([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("checar_duplicado", { p_team: teamId, p_nome: nome, p_fone: fone, p_ignorar: id ?? null });
      setDuplicados((data ?? []) as typeof duplicados);
    }, 650);
    return () => window.clearTimeout(t);
  }, [d.nome_negocio, d.contato.whatsapp, d.contato.telefone, teamId, id]);

  async function localizar() {
    setGps("buscando");
    try {
      const p = await pegarPosicao();
      setD((x) => ({ ...x, contato: { ...x.contato, lat: p.lat, lng: p.lng } }));
      setPrecisao(p.precisao);
      setGps("ok");
      vibrar(10);
      const e = await enderecoDe(p.lat, p.lng);
      if (e)
        setD((x) => ({
          ...x,
          bairro: x.bairro || e.bairro,
          cidade: x.cidade || e.cidade,
          contato: { ...x.contato, endereco: x.contato.endereco || e.endereco },
        }));
    } catch (err) {
      setGps("erro");
      toast(erroMsg(err), "erro");
    }
  }

  function aplicarResultado(rid: string) {
    const r = RESULTADOS.find((x) => x.id === rid);
    if (!r) return;
    vibrar(12);
    setD((x) => ({
      ...x,
      resultado_abordagem: rid,
      temperatura: r.temperatura,
      estagio: r.estagio,
      proximo_followup: r.followupDias == null ? "" : daquiDias(r.followupDias),
      proximo_passo: r.passo,
    }));
  }

  async function escolherFoto(f: File | undefined) {
    if (!f) return;
    try {
      set("foto", await comprimirImagem(f));
    } catch (e) {
      toast(erroMsg(e), "erro");
    }
  }

  async function alternarGravacao() {
    if (gravador.gravando) {
      const audio = await gravador.parar();
      if (audio.size < 2000) return;
      setTranscrevendo(true);
      try {
        const texto = await transcrever(audio);
        if (texto) setD((x) => ({ ...x, nota: x.nota ? `${x.nota} ${texto}` : texto }));
      } catch (e) {
        toast(`Não deu pra transcrever: ${erroMsg(e)}`, "erro");
      } finally {
        setTranscrevendo(false);
      }
    } else {
      try {
        await gravador.iniciar();
        vibrar(15);
      } catch {
        toast("Libere o microfone pra ditar a nota.", "erro");
      }
    }
  }

  async function salvar() {
    if (!d.nome_negocio.trim()) {
      toast("Coloque pelo menos o nome do negócio.", "erro");
      return;
    }
    if (!teamId) return;
    if (d.estagio === "perdido" && estagioOriginal !== "perdido" && !motivoPerda) {
      toast("Escolha o motivo da perda.", "erro");
      return;
    }
    setSalvando(true);
    const followIso = d.proximo_followup ? new Date(d.proximo_followup).toISOString() : null;

    try {
      if (!editando) {
        const novoId = uuid();
        const payload = {
          id: novoId,
          team_id: teamId,
          nome_negocio: d.nome_negocio.trim(),
          nicho: d.nicho,
          descricao: d.descricao,
          bairro: d.bairro,
          cidade: d.cidade,
          origem: d.origem,
          temperatura: d.temperatura,
          estagio: d.estagio,
          produtos: d.produtos,
          valor_estimado: d.valor_estimado,
          tags: d.tags,
          resultado_abordagem: d.resultado_abordagem,
          proximo_followup: followIso,
          proximo_passo: d.proximo_passo,
          contato_liberado: d.contato_liberado,
          foto: d.foto,
          nota: d.nota,
          nota_tipo: d.origem === "Prospecção presencial" ? "visita" : "nota",
          criado_em: new Date().toISOString(),
          contato: d.contato,
        };
        const guardarOffline = () => {
          fila.adicionar({ id: novoId, nome: payload.nome_negocio, payload, criadoEm: payload.criado_em });
          toast("Sem internet: lead guardado no aparelho. Sobe sozinho quando o sinal voltar.", "info");
          nav("/leads");
        };
        if (!navigator.onLine) return guardarOffline();
        const { error } = await supabase.rpc("criar_lead", { p: payload });
        if (error) {
          if (ehErroDeRede(error)) return guardarOffline();
          throw error;
        }
        vibrar(40);
        toast(d.estagio === "fechado" ? `🎉 ${payload.nome_negocio} fechado e registrado!` : `${payload.nome_negocio} registrado ✓`);
        await recarregar();
        nav(`/leads/${novoId}`, { replace: true });
      } else {
        const patch = {
          nome_negocio: d.nome_negocio.trim(),
          nicho: d.nicho || null,
          descricao: d.descricao,
          bairro: d.bairro || null,
          cidade: d.cidade || null,
          origem: d.origem || null,
          temperatura: d.temperatura,
          estagio: d.estagio,
          produtos: d.produtos,
          valor_estimado: d.valor_estimado,
          tags: d.tags,
          proximo_followup: followIso,
          proximo_passo: d.proximo_passo || null,
          contato_liberado: d.contato_liberado,
          foto: d.foto || null,
          motivo_perda: d.estagio === "perdido" ? motivoPerda || null : null,
        };
        const { error } = await supabase.from("leads").update(patch).eq("id", id!);
        if (error) throw error;
        if (contatoVisivel) {
          const c = Object.fromEntries(Object.entries(d.contato).map(([k, v]) => [k, v === "" ? null : v]));
          const { error: e2 } = await supabase.from("lead_contacts").upsert({ lead_id: id, ...c });
          if (e2) throw e2;
        }
        if (d.nota.trim()) {
          await supabase.from("lead_activities").insert({ lead_id: id, user_id: user!.id, tipo: "nota", conteudo: d.nota.trim() });
        }
        toast("Alterações salvas ✓");
        await recarregar();
        nav(`/leads/${id}`, { replace: true });
      }
    } catch (e) {
      toast(erroMsg(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (carregandoLead) return <Carregando texto="Abrindo lead…" />;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="btn-ghost -ml-3 px-3" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[22px] font-bold">{editando ? "Editar lead" : "Novo lead"}</h1>
      </div>

      {!editando && (
        <div className="mb-5">
          <Segmentado
            opcoes={[
              { id: "rapido", label: "⚡ Rápido (na rua)" },
              { id: "completo", label: "Completo" },
            ]}
            valor={modo}
            onChange={(v) => {
              setModo(v);
              try {
                localStorage.setItem("clyent-form-modo", v);
              } catch {
                /* ok */
              }
            }}
          />
        </div>
      )}

      <div className="space-y-6">
        {!editando && (
          <Bloco titulo="Como foi a abordagem?">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {RESULTADOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => aplicarResultado(r.id)}
                  className={cls(
                    "rounded-xl border px-3 py-3 text-left text-[13px] font-semibold transition",
                    d.resultado_abordagem === r.id ? "border-neon bg-neon/10 text-neon" : "border-line bg-s2 text-ink hover:border-mute",
                  )}
                >
                  <span className="mr-1.5">{r.emoji}</span>
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-dim">Isso já ajusta temperatura, etapa e a data do próximo contato.</p>
          </Bloco>
        )}

        <Bloco titulo="O negócio">
          <div className="space-y-3">
            <Campo rotulo="Nome do negócio *">
              <input className="campo text-base font-semibold" value={d.nome_negocio} onChange={(e) => set("nome_negocio", e.target.value)} placeholder="Ex.: Studio A Cabelo e Esmalteria" autoFocus={!editando} />
            </Campo>
            {duplicados.length > 0 && (
              <div className="rounded-xl border border-morno/50 bg-morno/10 p-3 text-sm text-morno">
                <p className="flex items-center gap-2 font-semibold">
                  <TriangleAlert size={16} /> Esse lead já pode estar na equipe
                </p>
                <ul className="mt-1.5 space-y-1">
                  {duplicados.map((x) => (
                    <li key={x.lead_id}>
                      <Link to={`/leads/${x.lead_id}`} className="underline">
                        {x.nome_negocio}
                      </Link>{" "}
                      — lead de <b>{x.dono}</b> ({x.motivo})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Campo rotulo="Nicho">
              <select
                className="campo"
                value={d.nicho}
                onChange={(e) => {
                  setNichoTocado(true);
                  set("nicho", e.target.value);
                }}
              >
                <option value="">Escolha…</option>
                {NICHOS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Campo>
            {completo && (
              <Campo rotulo="O que é / o que ela precisa" dica="Isso a equipe toda vê (sem dados pessoais).">
                <textarea className="campo" value={d.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: Salão com 3 cadeiras, sem site, Instagram parado. Dona quer mais clientes no Google." />
              </Campo>
            )}
            <div>
              <span className="rotulo">Foto da fachada</span>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolherFoto(e.target.files?.[0])} />
              {d.foto ? (
                <div className="relative overflow-hidden rounded-xl border border-line">
                  <img src={d.foto} alt="Fachada" className="h-44 w-full object-cover" />
                  <button type="button" onClick={() => set("foto", "")} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white" aria-label="Remover foto">
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fotoRef.current?.click()} className="btn-sec w-full py-4">
                  <Camera size={18} /> Tirar foto
                </button>
              )}
            </div>
          </div>
        </Bloco>

        <Bloco titulo="Termômetro">
          <TempSlider valor={d.temperatura} onChange={(v) => set("temperatura", v)} />
        </Bloco>

        <Bloco titulo="Onde fica">
          <button type="button" onClick={localizar} disabled={gps === "buscando"} className={cls("btn-sec w-full py-3.5", gps === "ok" && "border-neon/50 text-neon")}>
            {gps === "buscando" ? <Loader2 size={18} className="animate-spin" /> : gps === "ok" ? <Check size={18} /> : <Crosshair size={18} />}
            {gps === "buscando" ? "Pegando localização…" : gps === "ok" ? `Localização salva${precisao ? ` (±${precisao} m)` : ""}` : d.contato.lat ? "Atualizar pra onde estou agora" : "Usar minha localização"}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Campo rotulo="Bairro">
              <input className="campo" value={d.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Tatuapé" />
            </Campo>
            <Campo rotulo="Cidade">
              <input className="campo" value={d.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="São Paulo" />
            </Campo>
          </div>
          {completo && contatoVisivel && (
            <div className="mt-3">
              <Campo rotulo="Endereço exato (privado)">
                <input className="campo" value={d.contato.endereco} onChange={(e) => setC("endereco", e.target.value)} placeholder="Rua, número" />
              </Campo>
            </div>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-dim">
            <MapPin size={12} /> A equipe vê só o bairro e uma área aproximada no mapa.
          </p>
        </Bloco>

        {contatoVisivel ? (
          <Bloco
            titulo="Contato"
            selo={
              <span className="inline-flex items-center gap-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-semibold text-mute">
                <Lock size={11} /> só você vê
              </span>
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Responsável">
                  <input className="campo" value={d.contato.responsavel} onChange={(e) => setC("responsavel", e.target.value)} placeholder="Nome" autoComplete="off" />
                </Campo>
                {completo ? (
                  <Campo rotulo="Cargo">
                    <input className="campo" value={d.contato.cargo} onChange={(e) => setC("cargo", e.target.value)} placeholder="Dona, gerente…" />
                  </Campo>
                ) : (
                  <Campo rotulo="WhatsApp">
                    <input className="campo" type="tel" inputMode="tel" value={d.contato.whatsapp} onChange={(e) => setC("whatsapp", e.target.value)} placeholder="(11) 9…" />
                  </Campo>
                )}
              </div>
              {completo && (
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="WhatsApp">
                    <input className="campo" type="tel" inputMode="tel" value={d.contato.whatsapp} onChange={(e) => setC("whatsapp", e.target.value)} placeholder="(11) 9…" />
                  </Campo>
                  <Campo rotulo="Telefone fixo">
                    <input className="campo" type="tel" inputMode="tel" value={d.contato.telefone} onChange={(e) => setC("telefone", e.target.value)} />
                  </Campo>
                </div>
              )}
              <Campo rotulo="Instagram">
                <input className="campo" value={d.contato.instagram} onChange={(e) => setC("instagram", e.target.value)} placeholder="@perfil" autoCapitalize="none" />
              </Campo>
              {completo && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="Facebook">
                      <input className="campo" value={d.contato.facebook} onChange={(e) => setC("facebook", e.target.value)} autoCapitalize="none" />
                    </Campo>
                    <Campo rotulo="TikTok">
                      <input className="campo" value={d.contato.tiktok} onChange={(e) => setC("tiktok", e.target.value)} placeholder="@perfil" autoCapitalize="none" />
                    </Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="E-mail">
                      <input className="campo" type="email" inputMode="email" value={d.contato.email} onChange={(e) => setC("email", e.target.value)} autoCapitalize="none" />
                    </Campo>
                    <Campo rotulo="Site atual">
                      <input className="campo" value={d.contato.site} onChange={(e) => setC("site", e.target.value)} placeholder="se tiver" autoCapitalize="none" />
                    </Campo>
                  </div>
                  <Campo rotulo="LinkedIn">
                    <input className="campo" value={d.contato.linkedin} onChange={(e) => setC("linkedin", e.target.value)} autoCapitalize="none" />
                  </Campo>
                </>
              )}
              <label className="flex items-start gap-3 rounded-xl border border-line bg-s2 p-3.5">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#39FF14]" checked={d.contato_liberado} onChange={(e) => set("contato_liberado", e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Unlock size={14} /> Liberar contato pra equipe toda
                  </span>
                  <span className="block text-xs text-mute">Deixe desmarcado pra só você ver. Dá pra liberar depois, pra equipe ou pra uma pessoa.</span>
                </span>
              </label>
            </div>
          </Bloco>
        ) : (
          <p className="cartao flex items-center gap-2 p-4 text-sm text-mute">
            <Lock size={16} /> O contato desse lead é privado do dono — você edita só a parte pública.
          </p>
        )}

        <Bloco titulo="Venda">
          <div className="space-y-3">
            {completo && (
              <div>
                <span className="rotulo">Produtos de interesse</span>
                <div className="flex flex-wrap gap-2">
                  {produtosCatalogo.map((p) => {
                    const on = d.produtos.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => set("produtos", on ? d.produtos.filter((x) => x !== p.id) : [...d.produtos, p.id])}
                        className={cls("chip", on && "chip-on")}
                      >
                        {p.nome} · {fmtBRL(p.valor)}
                      </button>
                    );
                  })}
                  {!produtosCatalogo.length && <p className="text-xs text-dim">O admin cadastra os produtos em Equipe → Configurações.</p>}
                </div>
              </div>
            )}
            {completo && (
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Valor estimado (R$)">
                  <input
                    className="campo"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={d.valor_estimado || ""}
                    onChange={(e) => {
                      setValorTocado(true);
                      set("valor_estimado", Number(e.target.value) || 0);
                    }}
                    placeholder="0"
                  />
                </Campo>
                <Campo rotulo="Origem">
                  <select className="campo" value={d.origem} onChange={(e) => set("origem", e.target.value)}>
                    {ORIGENS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            )}
            {(completo || editando) && (
              <Campo rotulo="Etapa do funil">
                <select className="campo" value={d.estagio} onChange={(e) => set("estagio", e.target.value as LeadDraft["estagio"])}>
                  {ESTAGIOS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            {d.estagio === "perdido" && (
              <Campo rotulo="Motivo da perda">
                <select className="campo" value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)}>
                  <option value="">Escolha…</option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                  {motivoPerda && !MOTIVOS_PERDA.includes(motivoPerda) && <option>{motivoPerda}</option>}
                </select>
              </Campo>
            )}
            {d.estagio !== "fechado" && d.estagio !== "perdido" && (
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Próximo contato">
                  <input className="campo" type="datetime-local" value={d.proximo_followup} onChange={(e) => set("proximo_followup", e.target.value)} />
                </Campo>
                <Campo rotulo="Fazer o quê?">
                  <input className="campo" value={d.proximo_passo} onChange={(e) => set("proximo_passo", e.target.value)} placeholder="Mandar demo" />
                </Campo>
              </div>
            )}
            {completo && (
              <Campo rotulo="Tags" dica="Separe por vírgula">
                <input
                  className="campo"
                  defaultValue={d.tags.join(", ")}
                  onBlur={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
                  placeholder="indicação, tem sócio, abre sábado"
                />
              </Campo>
            )}
          </div>
        </Bloco>

        {contatoVisivel && (
          <Bloco titulo={editando ? "Nova nota (opcional)" : "Nota da conversa"}>
            <div className="relative">
              <textarea
                className="campo pr-14"
                value={d.nota}
                onChange={(e) => set("nota", e.target.value)}
                placeholder="O que ela falou? Objeções, horários, quem decide…"
              />
              {gravador.suportado && (
                <button
                  type="button"
                  onClick={alternarGravacao}
                  disabled={transcrevendo}
                  className={cls(
                    "absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full transition",
                    gravador.gravando ? "pulsar bg-quente text-white" : "bg-s3 text-neon hover:bg-neon/15",
                  )}
                  aria-label={gravador.gravando ? "Parar gravação" : "Ditar nota por voz"}
                >
                  {transcrevendo ? <Loader2 size={18} className="animate-spin" /> : gravador.gravando ? <Square size={16} /> : <Mic size={18} />}
                </button>
              )}
            </div>
            {gravador.gravando && <p className="mt-1.5 text-xs font-semibold text-quente">Gravando… toque no quadrado pra parar.</p>}
          </Bloco>
        )}
      </div>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] z-10 mt-6 bg-gradient-to-t from-fundo via-fundo to-transparent pb-3 pt-6">
        <button onClick={salvar} disabled={salvando} className="btn-neon w-full py-4 text-base shadow-neon">
          {salvando ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
          {editando ? "Salvar alterações" : "Registrar lead"}
        </button>
      </div>
    </div>
  );
}

function Bloco({ titulo, selo, children }: { titulo: string; selo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="titulo-sec">{titulo}</h2>
        {selo}
      </div>
      {children}
    </section>
  );
}
