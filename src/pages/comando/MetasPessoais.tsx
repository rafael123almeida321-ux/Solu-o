import { useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Campo, Secao, Sheet, Vazio } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { dataCurta } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { progressoMetaPessoal, sequenciaHabito } from "../../fin/rotina";
import type { MetaPessoal } from "../../fin/tipos";
import { Barra, Cartao, Explica, Pill } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";

const AREAS: Record<MetaPessoal["area"], string> = { corpo: "Corpo", basquete: "Basquete", negocio: "Negócio", estudo: "Estudo", vida: "Vida", outro: "Outro" };

export default function MetasPessoais() {
  const { dados, hoje, registrar, carregando, erro, moduloInstalado } = useFin();
  const toast = useToast();
  const [editar, setEditar] = useState<Partial<MetaPessoal> | null>(null);
  const [medir, setMedir] = useState<MetaPessoal | null>(null);
  const [valor, setValor] = useState("");
  const [dataMed, setDataMed] = useState(hoje);
  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;
  const ativas = dados.metasPessoais.filter((m) => m.status !== "arquivada");

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Metas pessoais</h1>
        <button className="btn btn-neon py-2" onClick={() => setEditar({ tipo: "numero", area: "corpo", direcao: "subir", data_inicio: hoje, status: "ativa" })}>
          <Plus size={16} /> Meta
        </button>
      </div>
      <p className="text-[13px] text-mute">Corpo, basquete, hábitos. As de hábito andam sozinhas quando você marca os blocos da rotina.</p>
      {ativas.length === 0 && <Vazio icone={<Trophy size={22} />} titulo="Nenhuma meta pessoal" />}
      <div className="space-y-2.5">
        {ativas.map((m) => {
          const p = progressoMetaPessoal(m, dados.medidas, dados.registros, hoje);
          const hist = dados.medidas.filter((x) => x.metrica === m.metrica).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
          return (
            <Cartao key={m.id} className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setEditar(m)} className="text-left">
                  <p className="font-semibold">{m.nome}</p>
                  <p className="text-[12px] text-mute">
                    {AREAS[m.area]}
                    {m.prazo ? ` · prazo ${dataCurta(m.prazo)}` : ""}
                  </p>
                </button>
                {p.status === "atingida" && <Pill tom="ok">atingida</Pill>}
                {p.status === "prazo_encerrado" && <Pill tom="alto">prazo passou</Pill>}
                {p.status === "sem_dados" && <Pill tom="medio">sem medida</Pill>}
              </div>
              {m.tipo === "numero" ? (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-mute">Início</p>
                    <p className="font-semibold">
                      {m.valor_inicial ?? "—"}
                      {m.unidade}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mute">Atual</p>
                    <p className="font-semibold">
                      {p.atual ?? "—"}
                      {m.unidade}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mute">Alvo</p>
                    <p className="font-semibold">
                      {m.alvo ?? "—"}
                      {m.unidade}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  <b>{p.semana?.feitos ?? 0}</b> de <b>{m.vezes_semana}</b> nesta semana · sequência <b>{sequenciaHabito(dados.registros, m.habito, hoje)}</b> dia(s)
                </p>
              )}
              <Barra pct={p.pct} rotulo={`Progresso ${m.nome}`} cor={p.status === "atingida" ? "bg-neon" : "bg-frio"} />
              {p.ritmo && (
                <p className={cls("text-[12.5px]", p.ritmo.necessarioPorSemana !== null && Math.abs(p.ritmo.porSemana) < Math.abs(p.ritmo.necessarioPorSemana) ? "text-morno" : "text-mute")}>
                  Ritmo: {p.ritmo.porSemana > 0 ? "+" : ""}
                  {p.ritmo.porSemana}
                  {m.unidade}/semana
                  {p.ritmo.necessarioPorSemana !== null && ` · precisa ${p.ritmo.necessarioPorSemana > 0 ? "+" : ""}${p.ritmo.necessarioPorSemana}${m.unidade}/semana pra chegar no prazo`}
                </p>
              )}
              {m.tipo === "numero" && (
                <>
                  <button
                    className="btn btn-sec w-full py-2"
                    onClick={() => {
                      setMedir(m);
                      setValor("");
                      setDataMed(hoje);
                    }}
                  >
                    Registrar {m.metrica}
                  </button>
                  {hist.length > 0 && (
                    <p className="text-[12px] text-dim">
                      Últimas: {hist.map((h) => `${dataCurta(h.data)} ${h.valor}${m.unidade}`).join(" · ")}
                    </p>
                  )}
                </>
              )}
              <Explica>{p.explicacao}</Explica>
            </Cartao>
          );
        })}
      </div>

      {dados.metasPessoais.some((m) => m.status === "arquivada") && (
        <Secao titulo="Arquivadas">
          <ul className="space-y-1.5">
            {dados.metasPessoais
              .filter((m) => m.status === "arquivada")
              .map((m) => (
                <li key={m.id}>
                  <button onClick={() => setEditar(m)} className="w-full rounded-xl border border-line px-3.5 py-2 text-left text-sm text-mute">
                    {m.nome}
                  </button>
                </li>
              ))}
          </ul>
        </Secao>
      )}

      <Sheet aberto={!!medir} onFechar={() => setMedir(null)} titulo={medir ? `Registrar ${medir.metrica}` : ""}>
        {medir && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = Number(valor.replace(",", "."));
              if (!Number.isFinite(v)) return toast("Valor inválido", "erro");
              try {
                await registrar("pes_medidas", { data: dataMed, metrica: medir.metrica, valor: v }, "user_id,data,metrica");
                toast("Registrado");
                setMedir(null);
              } catch (err) {
                toast(erroMsg(err), "erro");
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={`Valor (${medir.unidade || "número"})`}>
                <input className="campo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus required />
              </Campo>
              <Campo rotulo="Data">
                <input type="date" className="campo" value={dataMed} onChange={(e) => setDataMed(e.target.value)} required />
              </Campo>
            </div>
            <p className="text-[12px] text-dim">Registrar de novo no mesmo dia substitui o valor daquele dia.</p>
            <button className="btn btn-neon w-full">Salvar</button>
          </form>
        )}
      </Sheet>

      {editar && <FormMetaPessoal inicial={editar} onFechar={() => setEditar(null)} />}
    </div>
  );
}

function FormMetaPessoal({ inicial, onFechar }: { inicial: Partial<MetaPessoal>; onFechar: () => void }) {
  const { salvar } = useFin();
  const toast = useToast();
  const [m, setM] = useState<Partial<MetaPessoal>>({ nome: "", metrica: "", unidade: "", habito: "", notas: "", ...inicial });
  const set = (p: Partial<MetaPessoal>) => setM((x) => ({ ...x, ...p }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  return (
    <Sheet aberto onFechar={onFechar} titulo={m.id ? "Editar meta" : "Nova meta pessoal"}>
      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await salvar("pes_metas", {
              ...m,
              nome: m.nome?.trim(),
              metrica: (m.metrica ?? "").trim().toLowerCase(),
              habito: (m.habito ?? "").trim().toLowerCase(),
            });
            toast("Meta salva");
            onFechar();
          } catch (err) {
            toast(erroMsg(err), "erro");
          }
        }}
      >
        <Campo rotulo="Nome">
          <input className="campo" value={m.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} required maxLength={80} placeholder="Ex.: Chegar a 93 kg" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <select className="campo" value={m.tipo} onChange={(e) => set({ tipo: e.target.value as MetaPessoal["tipo"] })}>
              <option value="numero">Número (peso, medida…)</option>
              <option value="habito">Hábito (x vezes por semana)</option>
            </select>
          </Campo>
          <Campo rotulo="Área">
            <select className="campo" value={m.area} onChange={(e) => set({ area: e.target.value as MetaPessoal["area"] })}>
              {Object.entries(AREAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {m.tipo === "numero" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="O que medir">
                <input className="campo" value={m.metrica ?? ""} onChange={(e) => set({ metrica: e.target.value })} required placeholder="peso" />
              </Campo>
              <Campo rotulo="Unidade">
                <input className="campo" value={m.unidade ?? ""} onChange={(e) => set({ unidade: e.target.value })} placeholder="kg" />
              </Campo>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Inicial">
                <input className="campo" inputMode="decimal" defaultValue={m.valor_inicial ?? ""} onChange={(e) => set({ valor_inicial: num(e.target.value) })} />
              </Campo>
              <Campo rotulo="Alvo">
                <input className="campo" inputMode="decimal" defaultValue={m.alvo ?? ""} onChange={(e) => set({ alvo: num(e.target.value) })} required />
              </Campo>
              <Campo rotulo="Quer">
                <select className="campo" value={m.direcao} onChange={(e) => set({ direcao: e.target.value as MetaPessoal["direcao"] })}>
                  <option value="subir">Subir</option>
                  <option value="descer">Descer</option>
                </select>
              </Campo>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Hábito (igual ao do bloco)">
              <input className="campo" value={m.habito ?? ""} onChange={(e) => set({ habito: e.target.value })} required placeholder="basquete" />
            </Campo>
            <Campo rotulo="Vezes por semana">
              <input className="campo" inputMode="numeric" defaultValue={m.vezes_semana ?? ""} onChange={(e) => set({ vezes_semana: e.target.value ? Number(e.target.value) : null })} required />
            </Campo>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Começou em">
            <input type="date" className="campo" value={m.data_inicio ?? ""} onChange={(e) => set({ data_inicio: e.target.value })} required />
          </Campo>
          <Campo rotulo="Prazo">
            <input type="date" className="campo" value={m.prazo ?? ""} onChange={(e) => set({ prazo: e.target.value || null })} />
          </Campo>
        </div>
        <Campo rotulo="Notas">
          <textarea className="campo" value={m.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
        </Campo>
        {m.id && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={m.status === "arquivada"} onChange={(e) => set({ status: e.target.checked ? "arquivada" : "ativa" })} className="h-4 w-4 accent-[#39FF14]" />
            Arquivar
          </label>
        )}
        <button className="btn btn-neon w-full">Salvar</button>
      </form>
    </Sheet>
  );
}
