// Blocos da tela Hoje: "agora", agenda do dia e metas pessoais.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, ChevronRight, Minus, Scale, X } from "lucide-react";
import { Campo, Secao, Sheet } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { dataCurta } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { agendaDoDia, agoraMinSP, hhmm, placarDoDia, progressoMetaPessoal, sequenciaHabito, type ItemAgenda } from "../../fin/rotina";
import type { CategoriaBloco, RegistroRotina } from "../../fin/tipos";
import { Barra, Cartao, Pill } from "../../fin/ui";

export const COR_CATEGORIA: Record<CategoriaBloco, string> = {
  treino: "#39FF14",
  venda: "#FFB020",
  trabalho: "#4CC2FF",
  estudo: "#B48CFF",
  refeicao: "#FF8A5B",
  pessoal: "#8B9098",
  casal: "#FF5C8A",
  descanso: "#5B6068",
};
export const NOME_CATEGORIA: Record<CategoriaBloco, string> = {
  treino: "Treino",
  venda: "Venda",
  trabalho: "Trabalho",
  estudo: "Estudo",
  refeicao: "Refeição",
  pessoal: "Pessoal",
  casal: "Casal / amigos",
  descanso: "Descanso",
};

function useAgoraMin() {
  const [m, setM] = useState(agoraMinSP());
  useEffect(() => {
    const t = window.setInterval(() => setM(agoraMinSP()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return m;
}

export function AgendaHoje() {
  const { dados, hoje, registrar } = useFin();
  const toast = useToast();
  const agoraMin = useAgoraMin();
  const agenda = useMemo(() => agendaDoDia(dados.blocos, dados.registros, hoje, hoje, agoraMin), [dados.blocos, dados.registros, hoje, agoraMin]);
  const placar = placarDoDia(agenda);
  const atual = agenda.find((i) => i.estado === "agora") ?? null;
  const proximo = agenda.find((i) => i.estado === "futuro") ?? null;
  const [mostrarTudo, setMostrarTudo] = useState(false);

  async function marcar(i: ItemAgenda, status: RegistroRotina["status"]) {
    try {
      await registrar(
        "rot_registros",
        { data: hoje, bloco_id: i.bloco.id, titulo: i.bloco.titulo, habito: i.bloco.habito, status },
        "user_id,data,bloco_id",
      );
      if (status === "feito") toast(`✓ ${i.bloco.titulo}`);
    } catch (e) {
      toast(erroMsg(e), "erro");
    }
  }

  const { rotinaInstalada } = useFin();
  if (!rotinaInstalada) {
    return <Cartao className="text-sm text-morno">A rotina está sendo instalada no banco. Volte daqui a pouco.</Cartao>;
  }
  if (!dados.blocos.length) {
    return (
      <Cartao className="text-sm">
        Sua rotina ainda não está montada.{" "}
        <Link to="/rotina" className="font-semibold text-neon">
          Montar rotina
        </Link>
      </Cartao>
    );
  }

  const visiveis = mostrarTudo ? agenda : agenda.filter((i) => i.estado !== "passado" || !i.registro);

  return (
    <>
      {(atual || proximo) && (
        <Cartao className="border-neon/40 bg-gradient-to-br from-neon/[0.07] to-transparent">
          {atual ? (
            <>
              <p className="titulo-sec text-neon">Agora · até {hhmm(atual.bloco.fim)}</p>
              <p className="mt-1 text-xl font-bold leading-tight">{atual.bloco.titulo}</p>
              {atual.bloco.detalhe && <p className="mt-1 text-[13.5px] text-mute">{atual.bloco.detalhe}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => marcar(atual, "feito")} className={cls("btn flex-1 py-2.5", atual.registro?.status === "feito" ? "btn-neon" : "btn-sec")}>
                  <Check size={16} /> Feito
                </button>
                <button onClick={() => marcar(atual, "parcial")} className={cls("btn btn-sec py-2.5", atual.registro?.status === "parcial" && "border-morno text-morno")}>
                  Parcial
                </button>
                <button onClick={() => marcar(atual, "pulado")} className={cls("btn btn-sec py-2.5", atual.registro?.status === "pulado" && "border-quente text-quente")}>
                  Pulei
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="titulo-sec">Intervalo livre</p>
              <p className="mt-1 text-[15px]">Nenhum bloco agora.</p>
            </>
          )}
          {proximo && (
            <p className="mt-3 border-t border-line pt-2.5 text-[13px] text-mute">
              Depois: <b className="text-ink">{hhmm(proximo.bloco.inicio)}</b> {proximo.bloco.titulo}
            </p>
          )}
        </Cartao>
      )}

      <Secao
        titulo={`Seu dia · ${placar.feitos}/${placar.total} feitos`}
        acao={
          <Link to="/rotina" className="text-[13px] font-semibold text-neon">
            Editar rotina
          </Link>
        }
      >
        <ol className="overflow-hidden rounded-2xl border border-line bg-s1">
          {visiveis.map((i) => {
            const st = i.registro?.status;
            return (
              <li key={i.bloco.id} className={cls("flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0", i.estado === "agora" && "bg-neon/[0.06]")}>
                <span className="w-1 self-stretch rounded-full" style={{ background: COR_CATEGORIA[i.bloco.categoria] }} aria-hidden />
                <div className="w-12 shrink-0 text-[12.5px] tabular-nums text-mute">
                  {hhmm(i.bloco.inicio)}
                  <span className="block text-[11px] text-dim">{hhmm(i.bloco.fim)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cls("truncate text-[14px] font-medium", st === "feito" && "text-mute line-through", st === "pulado" && "text-dim line-through")}>{i.bloco.titulo}</p>
                  <p className="text-[11.5px] text-dim">
                    {NOME_CATEGORIA[i.bloco.categoria]}
                    {i.estado === "agora" && <span className="text-neon"> · agora</span>}
                    {i.estado === "passado" && !st && <span className="text-morno"> · não marcado</span>}
                    {st === "parcial" && <span className="text-morno"> · parcial</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => marcar(i, "feito")}
                    className={cls("rounded-lg border p-1.5", st === "feito" ? "border-neon bg-neon text-fundo" : "border-line text-mute hover:text-neon")}
                    aria-label={`Marcar ${i.bloco.titulo} como feito`}
                    aria-pressed={st === "feito"}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => marcar(i, "parcial")}
                    className={cls("rounded-lg border p-1.5", st === "parcial" ? "border-morno text-morno" : "border-line text-mute")}
                    aria-label={`Marcar ${i.bloco.titulo} como parcial`}
                    aria-pressed={st === "parcial"}
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    onClick={() => marcar(i, "pulado")}
                    className={cls("rounded-lg border p-1.5", st === "pulado" ? "border-quente text-quente" : "border-line text-mute")}
                    aria-label={`Marcar ${i.bloco.titulo} como pulado`}
                    aria-pressed={st === "pulado"}
                  >
                    <X size={15} />
                  </button>
                </div>
              </li>
            );
          })}
          {visiveis.length === 0 && <li className="px-3.5 py-3 text-[13px] text-mute">Tudo marcado por hoje. 👊</li>}
        </ol>
        {agenda.length !== visiveis.length && (
          <button onClick={() => setMostrarTudo(!mostrarTudo)} className="mt-1.5 text-[12.5px] text-mute">
            {mostrarTudo ? "Esconder os já marcados" : `Ver os ${agenda.length - visiveis.length} já marcados`}
          </button>
        )}
      </Secao>

      <Link to="/assistente" className="flex items-center gap-3 rounded-2xl border border-neon/30 bg-s1 px-3.5 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neon/15 text-neon">
          <Bot size={19} />
        </span>
        <span className="flex-1 text-[14px]">
          <b>Sócio IA</b>
          <span className="block text-[12.5px] text-mute">"O que eu faço agora?" · "pesei 84,5" · "fiz o treino"</span>
        </span>
        <ChevronRight size={16} className="text-mute" />
      </Link>
    </>
  );
}

export function MetasPessoaisResumo() {
  const { dados, hoje, registrar } = useFin();
  const toast = useToast();
  const [pesoAberto, setPesoAberto] = useState(false);
  const [valor, setValor] = useState("");
  const metas = dados.metasPessoais.filter((m) => m.status === "ativa");
  if (!metas.length) return null;
  const temPeso = metas.some((m) => m.metrica === "peso");

  return (
    <Secao
      titulo="Metas pessoais"
      acao={
        <Link to="/metas" className="text-[13px] font-semibold text-neon">
          Ver todas
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        {metas.slice(0, 4).map((m) => {
          const p = progressoMetaPessoal(m, dados.medidas, dados.registros, hoje);
          return (
            <Link key={m.id} to="/metas" className="cartao space-y-1.5 p-3">
              <p className="truncate text-[12.5px] font-semibold text-mute">{m.nome}</p>
              {m.tipo === "numero" ? (
                <p className="text-lg font-bold leading-none">
                  {p.atual ?? "—"}
                  <span className="text-[12px] font-normal text-mute">
                    {" "}
                    / {m.alvo}
                    {m.unidade}
                  </span>
                </p>
              ) : (
                <p className="text-lg font-bold leading-none">
                  {p.semana?.feitos ?? 0}
                  <span className="text-[12px] font-normal text-mute"> / {m.vezes_semana} na semana</span>
                </p>
              )}
              <Barra pct={p.pct} rotulo={`Progresso ${m.nome}`} cor={p.status === "atingida" ? "bg-neon" : "bg-frio"} />
              <p className="text-[11px] text-dim">
                {m.tipo === "habito"
                  ? `sequência: ${sequenciaHabito(dados.registros, m.habito, hoje)} dia(s)`
                  : p.atualData
                    ? `medido ${dataCurta(p.atualData)}${p.falta !== null ? ` · faltam ${p.falta}${m.unidade}` : ""}`
                    : "sem medida ainda"}
              </p>
            </Link>
          );
        })}
      </div>
      {temPeso && (
        <button onClick={() => setPesoAberto(true)} className="btn btn-sec mt-2 w-full py-2.5">
          <Scale size={16} /> Registrar peso de hoje
        </button>
      )}
      <Sheet aberto={pesoAberto} onFechar={() => setPesoAberto(false)} titulo="Peso de hoje">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = Number(valor.replace(",", "."));
            if (!Number.isFinite(v) || v <= 0 || v > 400) return toast("Peso inválido", "erro");
            try {
              await registrar("pes_medidas", { data: hoje, metrica: "peso", valor: v }, "user_id,data,metrica");
              toast("Peso registrado");
              setPesoAberto(false);
              setValor("");
            } catch (err) {
              toast(erroMsg(err), "erro");
            }
          }}
        >
          <Campo rotulo="Peso (kg)" dica="De preferência de manhã, em jejum, sempre do mesmo jeito.">
            <input className="campo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="84,5" autoFocus />
          </Campo>
          <button className="btn btn-neon w-full">Salvar</button>
        </form>
      </Sheet>
      {metas.length > 4 && <Pill>+{metas.length - 4} metas</Pill>}
    </Secao>
  );
}
