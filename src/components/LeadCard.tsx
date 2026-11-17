import { Link } from "react-router-dom";
import { CalendarClock, Clock, Lock, Unlock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { DIAS_ESFRIANDO, ESTAGIOS_ABERTOS, ESTAGIO_COR, ESTAGIO_LABEL } from "../lib/constants";
import type { Lead } from "../lib/types";
import { cls, corTemp, diasDesde, fmtBRL, statusFollowup } from "../lib/utils";
import { TempBadge } from "./TempSlider";
import { Avatar } from "./ui";

export default function LeadCard({
  lead,
  mostrarEstagio = false,
  arrastavel = false,
}: {
  lead: Lead;
  mostrarEstagio?: boolean;
  arrastavel?: boolean;
}) {
  const { user } = useAuth();
  const { nomeDe, podeVerContato } = useTeam();
  const meu = lead.owner_id === user?.id;
  const aberto = ESTAGIOS_ABERTOS.includes(lead.estagio);
  const dias = diasDesde(lead.ultimo_contato_em);
  const esfriando = aberto && dias >= DIAS_ESFRIANDO;
  const fu = aberto ? statusFollowup(lead.proximo_followup) : null;
  const vejo = podeVerContato(lead);

  return (
    <Link
      to={`/leads/${lead.id}`}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cartao group relative block overflow-hidden py-3 pl-4 pr-3.5 transition hover:border-mute/70"
    >
      <span className="absolute inset-y-0 left-0 w-[5px]" style={{ background: corTemp(lead.temperatura) }} aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-snug">{lead.nome_negocio}</p>
          <p className="truncate text-[12.5px] text-mute">
            {[lead.nicho, lead.bairro].filter(Boolean).join(" · ") || "Sem nicho/bairro"}
          </p>
        </div>
        <TempBadge valor={lead.temperatura} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <span className={cls("inline-flex items-center gap-1.5", meu ? "font-semibold text-neon" : "text-mute")}>
          {!meu && <Avatar id={lead.owner_id} nome={nomeDe(lead.owner_id)} tamanho={18} />}
          {meu ? "Seu lead" : `Lead de ${nomeDe(lead.owner_id).split(" ")[0]}`}
        </span>

        {!meu &&
          (vejo ? (
            <span className="inline-flex items-center gap-1 text-neon/80" title="Você pode ver o contato">
              <Unlock size={12} /> contato liberado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-dim" title="Contato protegido">
              <Lock size={12} /> protegido
            </span>
          ))}

        {mostrarEstagio && (
          <span className="inline-flex items-center gap-1.5 text-mute">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ESTAGIO_COR[lead.estagio] }} />
            {ESTAGIO_LABEL[lead.estagio]}
          </span>
        )}

        {aberto && (
          <span className={cls("inline-flex items-center gap-1", esfriando ? "font-semibold text-quente" : "text-dim")}>
            <Clock size={12} />
            {dias === 0 ? "hoje" : `${dias}d`}
          </span>
        )}

        {fu === "atrasado" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-quente/15 px-1.5 py-0.5 font-semibold text-quente">
            <CalendarClock size={12} /> atrasado
          </span>
        )}
        {fu === "hoje" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-neon/15 px-1.5 py-0.5 font-semibold text-neon">
            <CalendarClock size={12} /> hoje
          </span>
        )}

        {lead.valor_estimado > 0 && <span className="ml-auto font-semibold text-ink/80">{fmtBRL(lead.valor_estimado)}</span>}
      </div>
    </Link>
  );
}
