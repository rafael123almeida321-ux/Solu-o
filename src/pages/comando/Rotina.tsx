import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Campo, Sheet, Vazio } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cls, erroMsg } from "../../lib/utils";
import { diaDaSemana } from "../../fin/datas";
import { useFin } from "../../fin/FinContext";
import { hhmm, minutos } from "../../fin/rotina";
import type { Bloco, CategoriaBloco } from "../../fin/tipos";
import { Pill } from "../../fin/ui";
import { EstadoModulo } from "./EstadoModulo";
import { COR_CATEGORIA, NOME_CATEGORIA } from "./HojeRotina";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function Rotina() {
  const { dados, hoje, carregando, erro, moduloInstalado } = useFin();
  const [dia, setDia] = useState(diaDaSemana(hoje));
  const [editar, setEditar] = useState<Partial<Bloco> | null>(null);
  const [verPausados, setVerPausados] = useState(false);
  const lista = useMemo(
    () => dados.blocos.filter((b) => b.dias.includes(dia) && (verPausados || b.ativo)).sort((a, b) => minutos(a.inicio) - minutos(b.inicio)),
    [dados.blocos, dia, verPausados],
  );
  if (carregando || erro || !moduloInstalado) return <EstadoModulo />;
  const horas = lista.filter((b) => b.ativo).reduce<Record<string, number>>((acc, b) => {
    const d = (minutos(b.fim) - minutos(b.inicio) + 1440) % 1440;
    acc[b.categoria] = (acc[b.categoria] ?? 0) + d;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Minha rotina</h1>
        <button className="btn btn-neon py-2" onClick={() => setEditar({ dias: [dia], categoria: "pessoal", inicio: "08:00", fim: "09:00", ativo: true })}>
          <Plus size={16} /> Bloco
        </button>
      </div>
      <p className="text-[13px] text-mute">Modelo da semana. Mudou a rotina? Edite aqui (ou peça pro Sócio IA). O histórico do que você já marcou não muda.</p>
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dia da semana">
        {DIAS.map((d, i) => (
          <button
            key={d}
            role="tab"
            aria-selected={dia === i}
            onClick={() => setDia(i)}
            className={cls("rounded-lg border py-2 text-[12.5px] font-semibold", dia === i ? "border-neon bg-neon text-fundo" : "border-line text-mute")}
          >
            {d}
          </button>
        ))}
      </div>
      {Object.keys(horas).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(horas).map(([c, m]) => (
            <Pill key={c}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_CATEGORIA[c as CategoriaBloco] }} />
              {NOME_CATEGORIA[c as CategoriaBloco]} {Math.round((m / 60) * 10) / 10}h
            </Pill>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio icone={<Plus size={22} />} titulo="Nada nesse dia" texto="Adicione blocos ou deixe o dia livre." />
      ) : (
        <ul className="space-y-2">
          {lista.map((b) => (
            <li key={b.id}>
              <button onClick={() => setEditar(b)} className={cls("cartao flex w-full items-start gap-3 p-3.5 text-left", !b.ativo && "opacity-50")}>
                <span className="mt-1 h-10 w-1 rounded-full" style={{ background: COR_CATEGORIA[b.categoria] }} />
                <span className="w-14 shrink-0 text-[13px] tabular-nums text-mute">
                  {hhmm(b.inicio)}
                  <span className="block text-dim">{hhmm(b.fim)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.titulo}</span>
                  {b.detalhe && <span className="block text-[12.5px] text-mute">{b.detalhe}</span>}
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Pill>{NOME_CATEGORIA[b.categoria]}</Pill>
                    {b.habito && <Pill tom="ok">hábito: {b.habito}</Pill>}
                    {!b.ativo && <Pill tom="medio">pausado</Pill>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dados.blocos.some((b) => !b.ativo) && (
        <button onClick={() => setVerPausados(!verPausados)} className="text-[13px] text-mute">
          {verPausados ? "Esconder pausados" : "Ver pausados"}
        </button>
      )}
      {editar && <FormBloco inicial={editar} onFechar={() => setEditar(null)} />}
    </div>
  );
}

function FormBloco({ inicial, onFechar }: { inicial: Partial<Bloco>; onFechar: () => void }) {
  const { salvar, dados } = useFin();
  const toast = useToast();
  const [b, setB] = useState<Partial<Bloco>>({ titulo: "", detalhe: "", habito: "", ...inicial, inicio: hhmm(inicial.inicio ?? "08:00"), fim: hhmm(inicial.fim ?? "09:00") });
  const set = (p: Partial<Bloco>) => setB((x) => ({ ...x, ...p }));
  const habitos = Array.from(new Set([...dados.blocos.map((x) => x.habito), ...dados.metasPessoais.map((m) => m.habito)].filter(Boolean)));
  return (
    <Sheet aberto onFechar={onFechar} titulo={b.id ? "Editar bloco" : "Novo bloco"}>
      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!b.dias?.length) return toast("Escolha pelo menos um dia", "erro");
          try {
            await salvar("rot_blocos", { ...b, titulo: b.titulo?.trim(), habito: (b.habito ?? "").trim().toLowerCase() });
            toast("Rotina atualizada");
            onFechar();
          } catch (err) {
            toast(erroMsg(err), "erro");
          }
        }}
      >
        <Campo rotulo="O quê">
          <input className="campo" value={b.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} required maxLength={80} placeholder="Ex.: Treino de basquete" />
        </Campo>
        <div>
          <span className="rotulo">Dias</span>
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d, i) => {
              const on = b.dias?.includes(i);
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => set({ dias: on ? (b.dias ?? []).filter((x) => x !== i) : [...(b.dias ?? []), i].sort() })}
                  className={cls("rounded-lg border py-2 text-[12px] font-semibold", on ? "border-neon bg-neon/15 text-neon" : "border-line text-mute")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Começa">
            <input type="time" className="campo" value={b.inicio} onChange={(e) => set({ inicio: e.target.value })} required />
          </Campo>
          <Campo rotulo="Termina">
            <input type="time" className="campo" value={b.fim} onChange={(e) => set({ fim: e.target.value })} required />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <select className="campo" value={b.categoria} onChange={(e) => set({ categoria: e.target.value as CategoriaBloco })}>
              {(Object.keys(NOME_CATEGORIA) as CategoriaBloco[]).map((c) => (
                <option key={c} value={c}>
                  {NOME_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Conta pro hábito" dica="Ex.: basquete, academia">
            <input className="campo" list="habitos" value={b.habito ?? ""} onChange={(e) => set({ habito: e.target.value })} placeholder="(nenhum)" />
            <datalist id="habitos">
              {habitos.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </Campo>
        </div>
        <Campo rotulo="Como fazer (aparece no 'Agora')">
          <textarea className="campo" value={b.detalhe ?? ""} onChange={(e) => set({ detalhe: e.target.value })} placeholder="Ex.: 50 ligações da lista; meta 2 demos enviadas" />
        </Campo>
        {b.id && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={b.ativo === false} onChange={(e) => set({ ativo: !e.target.checked })} className="h-4 w-4 accent-[#39FF14]" />
            Pausar este bloco (some do dia, histórico fica)
          </label>
        )}
        <button className="btn btn-neon w-full">Salvar</button>
      </form>
    </Sheet>
  );
}
