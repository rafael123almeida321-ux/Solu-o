import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Flame, Hand, KeyRound, Sparkles, Waves, X } from "lucide-react";
import LeadCard from "../components/LeadCard";
import { Avatar, Secao } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { DIAS_ESFRIANDO, ESTAGIOS_ABERTOS } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { diasDesde, erroMsg, fmtBRL, inicioDaSemana, inicioDoMes, saudacao, statusFollowup, tempoRelativo } from "../lib/utils";

export default function Home() {
  const { user, nome } = useAuth();
  const { team, leads, eventos, pedidosAcesso, pedidosEntrada, nomeDe, recarregar } = useTeam();
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const uid = user?.id;

  const d = useMemo(() => {
    const meus = leads.filter((l) => l.owner_id === uid);
    const abertos = meus.filter((l) => ESTAGIOS_ABERTOS.includes(l.estagio));
    const semana = inicioDaSemana();
    const mes = inicioDoMes();
    const fechadosMes = meus.filter((l) => l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= mes);
    const equipeFechadoMes = leads
      .filter((l) => l.estagio === "fechado" && l.fechado_em && new Date(l.fechado_em) >= mes)
      .reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const praHoje = abertos
      .filter((l) => {
        const s = statusFollowup(l.proximo_followup);
        return s === "atrasado" || s === "hoje";
      })
      .sort((a, b) => +new Date(a.proximo_followup!) - +new Date(b.proximo_followup!));
    const idsHoje = new Set(praHoje.map((l) => l.id));
    const esfriando = abertos
      .filter((l) => !idsHoje.has(l.id) && diasDesde(l.ultimo_contato_em) >= DIAS_ESFRIANDO)
      .sort((a, b) => b.temperatura - a.temperatura);
    const idsEsfriando = new Set(esfriando.map((l) => l.id));
    const semPasso = abertos.filter((l) => !l.proximo_followup && !idsHoje.has(l.id) && !idsEsfriando.has(l.id));
    const diasLago = team?.dias_para_liberar ?? 0;
    const lago =
      diasLago > 0
        ? leads
            .filter((l) => l.owner_id !== uid && ESTAGIOS_ABERTOS.includes(l.estagio) && diasDesde(l.ultimo_contato_em) >= diasLago)
            .sort((a, b) => b.temperatura - a.temperatura)
        : [];
    return {
      registradosSemana: meus.filter((l) => new Date(l.created_at) >= semana).length,
      quentes: abertos.filter((l) => l.temperatura >= 70).length,
      fechadosMes: fechadosMes.length,
      valorMes: fechadosMes.reduce((s, l) => s + Number(l.valor_estimado || 0), 0),
      emAberto: abertos.reduce((s, l) => s + Number(l.valor_estimado || 0), 0),
      equipeFechadoMes,
      praHoje,
      esfriando,
      semPasso,
      lago,
    };
  }, [leads, uid, team?.dias_para_liberar]);

  const leadNome = (id: string) => leads.find((l) => l.id === id)?.nome_negocio ?? "um lead";

  async function responderAcesso(id: string, aprovar: boolean) {
    setOcupado(id);
    const { error } = await supabase.rpc("responder_acesso", { p_pedido: id, p_aprovar: aprovar });
    setOcupado(null);
    if (error) return toast(erroMsg(error), "erro");
    toast(aprovar ? "Contato liberado pra essa pessoa." : "Pedido recusado.");
    recarregar();
  }

  async function responderEntrada(userId: string, aprovar: boolean) {
    if (!team) return;
    setOcupado(userId);
    const { error } = await supabase.rpc("responder_entrada", { p_team: team.id, p_user: userId, p_aprovar: aprovar });
    setOcupado(null);
    if (error) return toast(erroMsg(error), "erro");
    toast(aprovar ? "Bem-vindo à equipe!" : "Pedido recusado.");
    recarregar();
  }

  const meta = team?.meta_mensal ? Math.min(100, (d.equipeFechadoMes / Number(team.meta_mensal)) * 100) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pt-5">
      <div>
        <p className="text-sm text-mute">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-0.5 text-[26px] font-bold leading-tight">
          {saudacao()}, {nome.split(" ")[0] || "sócio"}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Numero rotulo="Registrados na semana" valor={String(d.registradosSemana)} />
        <Numero rotulo="Quentes com você" valor={String(d.quentes)} cor="#FF4D3D" />
        <Numero rotulo="Fechados no mês" valor={String(d.fechadosMes)} sub={d.valorMes ? fmtBRL(d.valorMes) : undefined} cor="#39FF14" />
        <Numero rotulo="Em negociação" valor={fmtBRL(d.emAberto)} pequeno />
      </div>

      {meta !== null && (
        <div className="cartao p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">Meta da equipe no mês</span>
            <span className="text-mute">
              <b className="text-ink">{fmtBRL(d.equipeFechadoMes)}</b> de {fmtBRL(Number(team!.meta_mensal))}
            </span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-s3">
            <div className="h-full rounded-full bg-neon transition-all" style={{ width: `${meta}%` }} />
          </div>
        </div>
      )}

      {(pedidosAcesso.length > 0 || pedidosEntrada.length > 0) && (
        <Secao titulo="Pedindo sua resposta">
          <div className="space-y-2">
            {pedidosEntrada.map((p) => (
              <div key={p.user_id} className="cartao flex items-center gap-3 border-neon/30 p-3.5">
                <Avatar id={p.user_id} nome={p.nome} tamanho={36} />
                <p className="min-w-0 flex-1 text-sm">
                  <b>{p.nome}</b> quer entrar na equipe
                </p>
                <BotoesSimNao ocupado={ocupado === p.user_id} onSim={() => responderEntrada(p.user_id, true)} onNao={() => responderEntrada(p.user_id, false)} />
              </div>
            ))}
            {pedidosAcesso.map((p) => (
              <div key={p.id} className="cartao flex items-center gap-3 border-morno/30 p-3.5">
                <KeyRound size={20} className="shrink-0 text-morno" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    <b>{nomeDe(p.requester_id)}</b> quer o contato de{" "}
                    <Link to={`/leads/${p.lead_id}`} className="font-semibold text-neon underline-offset-2 hover:underline">
                      {leadNome(p.lead_id)}
                    </Link>
                  </p>
                  {p.mensagem && <p className="mt-0.5 truncate text-xs text-mute">“{p.mensagem}”</p>}
                </div>
                <BotoesSimNao ocupado={ocupado === p.id} onSim={() => responderAcesso(p.id, true)} onNao={() => responderAcesso(p.id, false)} />
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao
        titulo={`Pra hoje · ${d.praHoje.length}`}
        acao={
          <Link to="/agente?p=briefing" className="inline-flex items-center gap-1 text-xs font-semibold text-neon">
            <Sparkles size={13} /> Briefing com IA
          </Link>
        }
      >
        {d.praHoje.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {d.praHoje.map((l) => (
              <LeadCard key={l.id} lead={l} mostrarEstagio />
            ))}
          </div>
        ) : (
          <div className="cartao flex items-center gap-3 p-4 text-sm text-mute">
            <Check size={18} className="text-neon" />
            Nenhum follow-up pra hoje.{" "}
            <Link to="/leads/novo" className="font-semibold text-neon">
              Bora prospectar →
            </Link>
          </div>
        )}
      </Secao>

      {d.esfriando.length > 0 && (
        <Secao titulo={`Esfriando · ${d.esfriando.length}`} acao={<span className="text-xs text-dim">{DIAS_ESFRIANDO}+ dias sem contato</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.esfriando.slice(0, 6).map((l) => (
              <LeadCard key={l.id} lead={l} mostrarEstagio />
            ))}
          </div>
        </Secao>
      )}

      {d.semPasso.length > 0 && (
        <Secao titulo={`Sem próximo passo · ${d.semPasso.length}`} acao={<span className="text-xs text-dim">todo lead precisa de uma data</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.semPasso.slice(0, 4).map((l) => (
              <LeadCard key={l.id} lead={l} mostrarEstagio />
            ))}
          </div>
          {d.semPasso.length > 4 && (
            <Link to="/leads?filtro=sempasso" className="mt-2 block text-center text-sm font-semibold text-neon">
              Ver todos os {d.semPasso.length}
            </Link>
          )}
        </Secao>
      )}

      {d.lago.length > 0 && (
        <Secao titulo={`Lago de leads · ${d.lago.length}`} acao={<span className="text-xs text-dim">parados há {team?.dias_para_liberar}+ dias</span>}>
          <p className="-mt-1 mb-2.5 flex items-center gap-2 text-[13px] text-mute">
            <Waves size={15} className="text-frio" /> Leads que o dono largou. Abra e toque em “Assumir lead”.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.lago.slice(0, 6).map((l) => (
              <LeadCard key={l.id} lead={l} mostrarEstagio />
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Movimento da equipe">
        {eventos.length ? (
          <ol className="cartao divide-y divide-line/70">
            {eventos.slice(0, 15).map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0">{iconeEvento(e.tipo)}</span>
                <div className="min-w-0 flex-1">
                  {e.lead_id ? (
                    <Link to={`/leads/${e.lead_id}`} className="text-sm hover:text-neon">
                      {e.texto}
                    </Link>
                  ) : (
                    <p className="text-sm">{e.texto}</p>
                  )}
                  <p className="text-xs text-dim">{tempoRelativo(e.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="cartao p-4 text-sm text-mute">Assim que alguém registrar ou fechar um lead, aparece aqui.</p>
        )}
      </Secao>
    </div>
  );
}

function iconeEvento(tipo: string) {
  switch (tipo) {
    case "fechou":
      return <span className="text-base">🎉</span>;
    case "novo_lead":
      return <Flame size={16} className="text-quente" />;
    case "liberou":
      return <KeyRound size={16} className="text-neon" />;
    case "assumiu":
      return <Waves size={16} className="text-frio" />;
    case "transferiu":
      return <Hand size={16} className="text-morno" />;
    default:
      return <span className="block h-2 w-2 translate-y-1.5 rounded-full bg-mute" />;
  }
}

function Numero({ rotulo, valor, sub, cor, pequeno }: { rotulo: string; valor: string; sub?: string; cor?: string; pequeno?: boolean }) {
  return (
    <div className="cartao p-3.5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] text-mute">{rotulo}</p>
      <p className={pequeno ? "mt-2 font-display text-lg font-extrabold" : "mt-1.5 font-display text-[28px] font-black leading-none"} style={{ color: cor }}>
        {valor}
      </p>
      {sub && <p className="mt-1 text-xs text-mute">{sub}</p>}
    </div>
  );
}

function BotoesSimNao({ ocupado, onSim, onNao }: { ocupado: boolean; onSim: () => void; onNao: () => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button onClick={onNao} disabled={ocupado} className="btn-sec h-9 w-9 p-0" aria-label="Recusar">
        <X size={16} />
      </button>
      <button onClick={onSim} disabled={ocupado} className="btn-neon h-9 px-3 py-0 text-[13px]">
        <Check size={16} /> Sim
      </button>
    </div>
  );
}
