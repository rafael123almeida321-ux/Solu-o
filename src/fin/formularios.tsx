// Formulários (em folhas que sobem de baixo) para registrar e editar tudo pela interface.
import { useState, type FormEvent } from "react";
import { Sheet, Campo, Segmentado } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { erroMsg } from "../lib/utils";
import { patchLiquidar } from "./calc";
import { useFin } from "./FinContext";
import { CampoDinheiro } from "./ui";
import type { Conta, Divida, Frente, Lancamento, Meta, Recorrencia, Tarefa } from "./tipos";

function useEnviar(onFechar: () => void) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  return {
    ocupado,
    async enviar(e: FormEvent, fn: () => Promise<unknown>, ok: string) {
      e.preventDefault();
      setOcupado(true);
      try {
        await fn();
        toast(ok);
        onFechar();
      } catch (err) {
        toast(erroMsg(err), "erro");
      } finally {
        setOcupado(false);
      }
    },
  };
}

function Rodape({ ocupado, texto = "Salvar", extra }: { ocupado: boolean; texto?: string; extra?: React.ReactNode }) {
  return (
    <div className="flex gap-2 pt-2">
      {extra}
      <button className="btn btn-neon flex-1" disabled={ocupado}>
        {ocupado ? "Salvando…" : texto}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ lançamento

export function FormLancamento({
  aberto,
  onFechar,
  inicial,
}: {
  aberto: boolean;
  onFechar: () => void;
  inicial?: Partial<Lancamento>;
}) {
  return aberto ? <FormLancamentoInterno onFechar={onFechar} inicial={inicial} /> : null;
}

function FormLancamentoInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Lancamento> }) {
  const { dados, hoje, salvar, apagar } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const contasAtivas = dados.contas.filter((c) => !c.arquivada || c.id === inicial?.conta_id);
  const [l, setL] = useState<Partial<Lancamento>>({
    tipo: "saida",
    status: "realizado",
    escopo: "pessoal",
    confirmacao: "confirmado",
    data_pagamento: hoje,
    conta_id: contasAtivas.find((c) => c.tipo !== "cartao")?.id ?? null,
    descricao: "",
    notas: "",
    ...inicial,
  });
  const set = (p: Partial<Lancamento>) => setL((x) => ({ ...x, ...p }));
  const editando = !!l.id;
  const cats = dados.categorias.filter((c) => !c.arquivada && (l.tipo === "transferencia" ? false : c.tipo === l.tipo));
  const titulo = editando ? "Editar lançamento" : l.tipo === "entrada" ? "Registrar entrada" : l.tipo === "saida" ? "Registrar saída" : "Transferência";

  return (
    <Sheet aberto onFechar={onFechar} titulo={titulo}>
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (!l.valor_centavos || l.valor_centavos <= 0) throw new Error("Informe um valor maior que zero.");
              if (!l.descricao?.trim()) throw new Error("Escreva uma descrição curta.");
              const reg: Partial<Lancamento> = { ...l, descricao: l.descricao.trim() };
              if (reg.status === "realizado") {
                if (!reg.conta_id) throw new Error("Escolha a conta onde o dinheiro entrou/saiu.");
                reg.data_pagamento = reg.data_pagamento || hoje;
              } else {
                if (!reg.data_vencimento) throw new Error("Informe a data prevista.");
                reg.data_pagamento = null;
              }
              if (reg.tipo !== "transferencia") reg.conta_destino_id = null;
              else if (!reg.conta_destino_id || reg.conta_destino_id === reg.conta_id) throw new Error("Escolha uma conta de destino diferente.");
              await salvar("fin_entries", reg);
            },
            editando ? "Lançamento atualizado" : "Lançamento registrado",
          )
        }
      >
        {!editando && (
          <Segmentado
            opcoes={[
              { id: "entrada", label: "Entrada" },
              { id: "saida", label: "Saída" },
              { id: "transferencia", label: "Transferência" },
            ]}
            valor={l.tipo as Lancamento["tipo"]}
            onChange={(v) => set({ tipo: v, categoria_id: null })}
          />
        )}
        <Segmentado
          opcoes={[
            { id: "realizado", label: l.tipo === "entrada" ? "Já recebi" : "Já paguei" },
            { id: "previsto", label: "Previsto" },
          ]}
          valor={(l.status === "cancelado" ? "previsto" : l.status) as "realizado" | "previsto"}
          onChange={(v) => set({ status: v, data_vencimento: v === "previsto" ? l.data_vencimento ?? hoje : l.data_vencimento })}
        />
        {contasAtivas.length === 0 && l.status === "realizado" && (
          <p className="rounded-xl border border-morno/40 bg-morno/10 p-3 text-[13px] text-morno">
            Primeiro cadastre uma conta (Caixa → Contas) com o saldo de hoje. Sem conta dá para lançar só como "Previsto".
          </p>
        )}
        <Campo rotulo="Valor">
          <CampoDinheiro valor={l.valor_centavos ?? null} onChange={(c) => set({ valor_centavos: c ?? undefined })} obrigatorio />
        </Campo>
        <Campo rotulo="Descrição">
          <input className="campo" value={l.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} placeholder="Ex.: 4 plaquinhas — Penha" maxLength={140} required />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          {l.status === "realizado" ? (
            <Campo rotulo="Data do pagamento">
              <input type="date" className="campo" value={l.data_pagamento ?? ""} onChange={(e) => set({ data_pagamento: e.target.value })} required />
            </Campo>
          ) : (
            <Campo rotulo="Vence / previsto para">
              <input type="date" className="campo" value={l.data_vencimento ?? ""} onChange={(e) => set({ data_vencimento: e.target.value })} required />
            </Campo>
          )}
          <Campo rotulo={l.tipo === "transferencia" ? "Sai da conta" : "Conta"}>
            <select className="campo" value={l.conta_id ?? ""} onChange={(e) => set({ conta_id: e.target.value || null })}>
              <option value="">{l.status === "previsto" ? "Ainda não sei" : "Escolha…"}</option>
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.tipo === "cartao" ? " (cartão)" : ""}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {l.tipo === "transferencia" && (
          <Campo rotulo="Vai para a conta" dica="Pagar fatura do cartão = transferência da conta para o cartão (não conta como gasto de novo).">
            <select className="campo" value={l.conta_destino_id ?? ""} onChange={(e) => set({ conta_destino_id: e.target.value || null })}>
              <option value="">Escolha…</option>
              {contasAtivas.filter((c) => c.id !== l.conta_id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {l.tipo !== "transferencia" && (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Categoria">
              <select className="campo" value={l.categoria_id ?? ""} onChange={(e) => set({ categoria_id: e.target.value || null })}>
                <option value="">Sem categoria</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Frente de renda">
              <select
                className="campo"
                value={l.frente_id ?? ""}
                onChange={(e) => set({ frente_id: e.target.value || null, escopo: e.target.value ? "negocio" : l.escopo })}
              >
                <option value="">Nenhuma</option>
                {dados.frentes.filter((f) => f.situacao !== "arquivada" || f.id === l.frente_id).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        )}
        {l.tipo !== "entrada" && (
          <Campo rotulo="Pagamento de dívida?" dica="Ligando à dívida, o saldo dela baixa e a meta anda.">
            <select className="campo" value={l.divida_id ?? ""} onChange={(e) => set({ divida_id: e.target.value || null })}>
              <option value="">Não</option>
              {dados.dividas.filter((d) => d.status === "aberta" || d.id === l.divida_id).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.credor}
                  {d.titular ? ` (${d.titular})` : ""}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="É de">
            <select className="campo" value={l.escopo} onChange={(e) => set({ escopo: e.target.value as Lancamento["escopo"] })}>
              <option value="pessoal">Pessoal</option>
              <option value="negocio">Negócio</option>
            </select>
          </Campo>
          <Campo rotulo="Certeza do valor">
            <select className="campo" value={l.confirmacao} onChange={(e) => set({ confirmacao: e.target.value as Lancamento["confirmacao"] })}>
              <option value="confirmado">Confirmado</option>
              <option value="estimado">Estimado</option>
              <option value="incerto">Incerto</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Notas (opcional)">
          <textarea className="campo" value={l.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
        </Campo>
        <Rodape
          ocupado={ocupado}
          extra={
            editando ? (
              <button
                type="button"
                className="btn btn-sec"
                onClick={async () => {
                  if (!confirm("Excluir este lançamento? Ele continua registrado no histórico de auditoria.")) return;
                  await apagar("fin_entries", l.id!);
                  onFechar();
                }}
              >
                Excluir
              </button>
            ) : undefined
          }
        />
      </form>
    </Sheet>
  );
}

/** marcar previsto como pago/recebido: altera o mesmo registro */
export function FormLiquidar({ lanc, onFechar }: { lanc: Lancamento | null; onFechar: () => void }) {
  const { dados, hoje, salvar } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [conta, setConta] = useState(lanc?.conta_id ?? dados.contas.find((c) => c.tipo !== "cartao" && !c.arquivada)?.id ?? "");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number | null>(lanc?.valor_centavos ?? null);
  if (!lanc) return null;
  return (
    <Sheet aberto onFechar={onFechar} titulo={lanc.tipo === "entrada" ? "Marcar como recebido" : "Marcar como pago"}>
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (!conta) throw new Error("Escolha a conta.");
              if (!valor || valor <= 0) throw new Error("Valor inválido.");
              await salvar("fin_entries", { id: lanc.id, ...patchLiquidar(conta, data, valor !== lanc.valor_centavos ? valor : undefined) });
            },
            "Pronto — saldo atualizado",
          )
        }
      >
        <p className="text-sm text-mute">{lanc.descricao}</p>
        <Campo rotulo="Valor efetivo">
          <CampoDinheiro valor={valor} onChange={setValor} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data">
            <input type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
          <Campo rotulo="Conta">
            <select className="campo" value={conta} onChange={(e) => setConta(e.target.value)} required>
              <option value="">Escolha…</option>
              {dados.contas.filter((c) => !c.arquivada).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Rodape ocupado={ocupado} texto="Confirmar" />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ tarefa

export function FormTarefa({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<Tarefa> }) {
  return aberto ? <FormTarefaInterno onFechar={onFechar} inicial={inicial} /> : null;
}
function FormTarefaInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Tarefa> }) {
  const { dados, salvar, hoje } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [t, setT] = useState<Partial<Tarefa>>({
    titulo: "",
    proximo_passo: "",
    resultado_esperado: "",
    motivo: "",
    esforco: 2,
    potencial_caixa_centavos: 0,
    compromisso: false,
    status: "aberta",
    ...inicial,
  });
  const set = (p: Partial<Tarefa>) => setT((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo={t.id ? "Editar ação" : "Nova ação"}>
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (!t.titulo?.trim()) throw new Error("Dê um nome para a ação.");
              await salvar("fin_tasks", { ...t, titulo: t.titulo.trim() });
            },
            t.id ? "Ação atualizada" : "Ação criada",
          )
        }
      >
        <Campo rotulo="O que fazer">
          <input className="campo" value={t.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} placeholder="Ex.: Visitar Thelma e pegar acessos" maxLength={140} required />
        </Campo>
        <Campo rotulo="Próximo passo concreto">
          <input className="campo" value={t.proximo_passo ?? ""} onChange={(e) => set({ proximo_passo: e.target.value })} placeholder="Ex.: mandar mensagem confirmando 9h" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Prazo">
            <input type="date" className="campo" value={t.prazo ?? ""} onChange={(e) => set({ prazo: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Tempo (min)">
            <input type="number" min={1} max={1440} className="campo" value={t.tempo_min ?? ""} onChange={(e) => set({ tempo_min: e.target.value ? Number(e.target.value) : null })} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Frente">
            <select className="campo" value={t.frente_id ?? ""} onChange={(e) => set({ frente_id: e.target.value || null })}>
              <option value="">Nenhuma</option>
              {dados.frentes.filter((f) => f.situacao !== "arquivada").map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Esforço">
            <select className="campo" value={t.esforco} onChange={(e) => set({ esforco: Number(e.target.value) })}>
              <option value={1}>Baixo</option>
              <option value={2}>Médio</option>
              <option value={3}>Alto</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Quanto pode trazer de caixa (se fechar)" dica="Estimativa — não vira receita sozinha.">
          <CampoDinheiro valor={t.potencial_caixa_centavos ?? 0} onChange={(c) => set({ potencial_caixa_centavos: c ?? 0 })} />
        </Campo>
        <Campo rotulo="Resultado esperado">
          <input className="campo" value={t.resultado_esperado ?? ""} onChange={(e) => set({ resultado_esperado: e.target.value })} placeholder="Ex.: entrada de R$ 375 no Pix" />
        </Campo>
        <Campo rotulo="Por que é prioridade">
          <input className="campo" value={t.motivo ?? ""} onChange={(e) => set({ motivo: e.target.value })} placeholder="Ex.: garante os R$ 1.250 de dezembro" />
        </Campo>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={!!t.compromisso} onChange={(e) => set({ compromisso: e.target.checked })} className="h-4 w-4 accent-[#39FF14]" />
          É um compromisso assumido com alguém
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={t.foco_em === hoje} onChange={(e) => set({ foco_em: e.target.checked ? hoje : null })} className="h-4 w-4 accent-[#39FF14]" />
          Fixar como prioridade de hoje
        </label>
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ conta

export function FormConta({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<Conta> }) {
  return aberto ? <FormContaInterno onFechar={onFechar} inicial={inicial} /> : null;
}
function FormContaInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Conta> }) {
  const { salvar, hoje } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [c, setC] = useState<Partial<Conta>>({ nome: "", tipo: "conta", escopo: "pessoal", saldo_inicial_centavos: 0, data_base: hoje, arquivada: false, ...inicial });
  const set = (p: Partial<Conta>) => setC((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo={c.id ? "Editar conta" : "Nova conta"}>
      <form className="space-y-3.5" onSubmit={(e) => enviar(e, () => salvar("fin_accounts", { ...c, nome: c.nome?.trim() }), "Conta salva")}>
        <Campo rotulo="Nome">
          <input className="campo" value={c.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Nubank, Carteira, Cartão Nubank" required maxLength={60} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <select className="campo" value={c.tipo} onChange={(e) => set({ tipo: e.target.value as Conta["tipo"] })}>
              <option value="conta">Conta</option>
              <option value="carteira">Dinheiro vivo</option>
              <option value="poupanca">Poupança / caixinha</option>
              <option value="cartao">Cartão de crédito</option>
            </select>
          </Campo>
          <Campo rotulo="É de">
            <select className="campo" value={c.escopo} onChange={(e) => set({ escopo: e.target.value as Conta["escopo"] })}>
              <option value="pessoal">Pessoal</option>
              <option value="negocio">Negócio</option>
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={c.tipo === "cartao" ? "Saldo (negativo = deve)" : "Saldo no início do dia"}>
            <CampoDinheiro valor={c.saldo_inicial_centavos ?? 0} onChange={(v) => set({ saldo_inicial_centavos: v ?? 0 })} />
          </Campo>
          <Campo rotulo="Data desse saldo">
            <input type="date" className="campo" value={c.data_base ?? ""} onChange={(e) => set({ data_base: e.target.value })} required />
          </Campo>
        </div>
        <p className="text-xs text-dim">Lançamentos realizados a partir dessa data somam ou subtraem desse saldo. Os anteriores já estão dentro dele.</p>
        {c.id && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={!!c.arquivada} onChange={(e) => set({ arquivada: e.target.checked })} className="h-4 w-4 accent-[#39FF14]" />
            Arquivar (some das listas, histórico fica)
          </label>
        )}
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ dívida

export function FormDivida({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<Divida> }) {
  return aberto ? <FormDividaInterno onFechar={onFechar} inicial={inicial} /> : null;
}
function FormDividaInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Divida> }) {
  const { dados, salvar, hoje } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const principal = dados.metas.find((m) => m.principal && m.status === "ativa");
  const [d, setD] = useState<Partial<Divida>>({
    credor: "",
    descricao: "",
    titular: "",
    data_referencia: hoje,
    juros_info: "",
    status: "aberta",
    notas: "",
    goal_id: principal?.tipo === "reducao_divida" ? principal.id : null,
    ...inicial,
  });
  const set = (p: Partial<Divida>) => setD((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo={d.id ? "Editar dívida" : "Nova dívida"}>
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (d.saldo_informado_centavos === undefined || d.saldo_informado_centavos === null) throw new Error("Informe o saldo devedor.");
              await salvar("fin_debts", { ...d, credor: d.credor?.trim() });
            },
            "Dívida salva",
          )
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Credor">
            <input className="campo" value={d.credor ?? ""} onChange={(e) => set({ credor: e.target.value })} placeholder="Ex.: Itaú" required />
          </Campo>
          <Campo rotulo="De quem é">
            <input className="campo" value={d.titular ?? ""} onChange={(e) => set({ titular: e.target.value })} placeholder="Ex.: cartão da Kelly" />
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <input className="campo" value={d.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} placeholder="Ex.: fatura atrasada de novembro" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Saldo devedor">
            <CampoDinheiro valor={d.saldo_informado_centavos ?? null} onChange={(v) => set({ saldo_informado_centavos: v ?? undefined })} obrigatorio />
          </Campo>
          <Campo rotulo="Saldo em (data)">
            <input type="date" className="campo" value={d.data_referencia ?? ""} onChange={(e) => set({ data_referencia: e.target.value })} required />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Vencimento">
            <input type="date" className="campo" value={d.vencimento ?? ""} onChange={(e) => set({ vencimento: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Em atraso desde">
            <input type="date" className="campo" value={d.em_atraso_desde ?? ""} onChange={(e) => set({ em_atraso_desde: e.target.value || null })} />
          </Campo>
        </div>
        <Campo rotulo="Juros / condições" dica="Deixe vazio se não souber — o app não inventa juros.">
          <input className="campo" value={d.juros_info ?? ""} onChange={(e) => set({ juros_info: e.target.value })} placeholder="Ex.: rotativo; parcela fixa" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Conta na meta">
            <select className="campo" value={d.goal_id ?? ""} onChange={(e) => set({ goal_id: e.target.value || null })}>
              <option value="">Não</option>
              {dados.metas.filter((m) => m.status === "ativa" && m.tipo === "reducao_divida").map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Situação">
            <select className="campo" value={d.status} onChange={(e) => set({ status: e.target.value as Divida["status"] })}>
              <option value="aberta">Aberta</option>
              <option value="quitada">Quitada</option>
              <option value="arquivada">Arquivada</option>
            </select>
          </Campo>
        </div>
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ frente

export function FormFrente({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<Frente> }) {
  return aberto ? <FormFrenteInterno onFechar={onFechar} inicial={inicial} /> : null;
}
function FormFrenteInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Frente> }) {
  const { salvar } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [f, setF] = useState<Partial<Frente>>({ nome: "", situacao: "ativa", objetivo: "", prioridade: 3, proxima_oportunidade: "", indicador_nome: "", notas: "", ...inicial });
  const set = (p: Partial<Frente>) => setF((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo={f.id ? "Editar frente" : "Nova frente de renda"}>
      <form className="space-y-3.5" onSubmit={(e) => enviar(e, () => salvar("fin_frentes", { ...f, nome: f.nome?.trim() }), "Frente salva")}>
        <Campo rotulo="Nome">
          <input className="campo" value={f.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} required maxLength={60} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Situação">
            <select className="campo" value={f.situacao} onChange={(e) => set({ situacao: e.target.value as Frente["situacao"] })}>
              <option value="ativa">Ativa</option>
              <option value="negociacao">Em negociação</option>
              <option value="pausada">Pausada</option>
              <option value="arquivada">Arquivada</option>
            </select>
          </Campo>
          <Campo rotulo="Prioridade (1–5)">
            <select className="campo" value={f.prioridade} onChange={(e) => set({ prioridade: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Objetivo">
          <input className="campo" value={f.objetivo ?? ""} onChange={(e) => set({ objetivo: e.target.value })} />
        </Campo>
        <Campo rotulo="Próxima oportunidade / entrega">
          <input className="campo" value={f.proxima_oportunidade ?? ""} onChange={(e) => set({ proxima_oportunidade: e.target.value })} />
        </Campo>
        <Campo rotulo="Indicador que importa">
          <input className="campo" value={f.indicador_nome ?? ""} onChange={(e) => set({ indicador_nome: e.target.value })} placeholder="Ex.: plaquinhas vendidas por dia" />
        </Campo>
        <Campo rotulo="Notas">
          <textarea className="campo" value={f.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
        </Campo>
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ meta

export function FormMeta({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<Meta> }) {
  return aberto ? <FormMetaInterno onFechar={onFechar} inicial={inicial} /> : null;
}
function FormMetaInterno({ onFechar, inicial }: { onFechar: () => void; inicial?: Partial<Meta> }) {
  const { salvar, hoje } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [m, setM] = useState<Partial<Meta>>({
    nome: "",
    tipo: "reducao_divida",
    alvo_centavos: null,
    valor_inicial_centavos: 0,
    data_base: hoje,
    prazo: null,
    escopo: "pessoal",
    regra: "",
    principal: true,
    status: "ativa",
    ...inicial,
  });
  const set = (p: Partial<Meta>) => setM((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo={m.id ? "Editar meta" : "Nova meta"}>
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (m.prazo && m.data_base && m.prazo < m.data_base) throw new Error("O prazo não pode ser antes da data-base.");
              await salvar("fin_goals", { ...m, nome: m.nome?.trim() });
            },
            m.id ? "Meta atualizada (versão anterior guardada)" : "Meta criada",
          )
        }
      >
        <Campo rotulo="Nome">
          <input className="campo" value={m.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} required maxLength={80} />
        </Campo>
        <Campo rotulo="O que a meta mede">
          <select className="campo" value={m.tipo} onChange={(e) => set({ tipo: e.target.value as Meta["tipo"] })}>
            <option value="reducao_divida">Redução de dívida (pagamentos feitos)</option>
            <option value="reserva">Reserva acumulada (saldo de caixa)</option>
            <option value="faturamento_mensal">Faturamento do mês (negócio)</option>
            <option value="lucro_mensal">Lucro do mês (negócio)</option>
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Alvo" dica={m.tipo === "reducao_divida" ? "Vazio = soma das dívidas ligadas" : undefined}>
            <CampoDinheiro valor={m.alvo_centavos ?? null} onChange={(v) => set({ alvo_centavos: v && v > 0 ? v : null })} />
          </Campo>
          <Campo rotulo="Prazo">
            <input type="date" className="campo" value={m.prazo ?? ""} onChange={(e) => set({ prazo: e.target.value || null })} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data-base (início)">
            <input type="date" className="campo" value={m.data_base ?? ""} onChange={(e) => set({ data_base: e.target.value })} required />
          </Campo>
          {m.tipo === "reserva" && (
            <Campo rotulo="Valor inicial">
              <CampoDinheiro valor={m.valor_inicial_centavos ?? 0} onChange={(v) => set({ valor_inicial_centavos: v ?? 0 })} />
            </Campo>
          )}
        </div>
        <Campo rotulo="Observação sobre a regra (opcional)">
          <input className="campo" value={m.regra ?? ""} onChange={(e) => set({ regra: e.target.value })} />
        </Campo>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={!!m.principal} onChange={(e) => set({ principal: e.target.checked })} className="h-4 w-4 accent-[#39FF14]" />
          Meta principal (aparece no Hoje)
        </label>
        {m.id && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={m.status === "arquivada"} onChange={(e) => set({ status: e.target.checked ? "arquivada" : "ativa", principal: e.target.checked ? false : m.principal })} className="h-4 w-4 accent-[#39FF14]" />
            Arquivar meta
          </label>
        )}
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ recorrência

export function FormRecorrencia({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  return aberto ? <FormRecorrenciaInterno onFechar={onFechar} /> : null;
}
function FormRecorrenciaInterno({ onFechar }: { onFechar: () => void }) {
  const { dados, salvar, hoje } = useFin();
  const { ocupado, enviar } = useEnviar(onFechar);
  const [r, setR] = useState<Partial<Recorrencia>>({ descricao: "", tipo: "saida", frequencia: "mensal", inicio: hoje, ativa: true });
  const set = (p: Partial<Recorrencia>) => setR((x) => ({ ...x, ...p }));
  return (
    <Sheet aberto onFechar={onFechar} titulo="Nova recorrência">
      <form
        className="space-y-3.5"
        onSubmit={(e) =>
          enviar(
            e,
            async () => {
              if (!r.valor_centavos) throw new Error("Informe o valor.");
              await salvar("fin_recurrences", r);
            },
            "Recorrência criada — gere os previstos na aba Recorrências",
          )
        }
      >
        <Segmentado
          opcoes={[
            { id: "entrada", label: "Entrada" },
            { id: "saida", label: "Saída" },
          ]}
          valor={r.tipo as "entrada" | "saida"}
          onChange={(v) => set({ tipo: v })}
        />
        <Campo rotulo="Descrição">
          <input className="campo" value={r.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} required placeholder="Ex.: Mesada da mãe" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor">
            <CampoDinheiro valor={r.valor_centavos ?? null} onChange={(v) => set({ valor_centavos: v ?? undefined })} obrigatorio />
          </Campo>
          <Campo rotulo="Frequência">
            <select className="campo" value={r.frequencia} onChange={(e) => set({ frequencia: e.target.value as Recorrencia["frequencia"] })}>
              <option value="mensal">Mensal</option>
              <option value="semanal">Semanal</option>
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Primeira data">
            <input type="date" className="campo" value={r.inicio ?? ""} onChange={(e) => set({ inicio: e.target.value })} required />
          </Campo>
          <Campo rotulo="Até (opcional)">
            <input type="date" className="campo" value={r.fim ?? ""} onChange={(e) => set({ fim: e.target.value || null })} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Conta">
            <select className="campo" value={r.conta_id ?? ""} onChange={(e) => set({ conta_id: e.target.value || null })}>
              <option value="">Definir ao pagar</option>
              {dados.contas.filter((c) => !c.arquivada).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Dívida (se for parcela)">
            <select className="campo" value={r.divida_id ?? ""} onChange={(e) => set({ divida_id: e.target.value || null })}>
              <option value="">Não</option>
              {dados.dividas.filter((d) => d.status === "aberta").map((d) => (
                <option key={d.id} value={d.id}>
                  {d.credor}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Rodape ocupado={ocupado} />
      </form>
    </Sheet>
  );
}
