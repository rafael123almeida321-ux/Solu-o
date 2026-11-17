// Monta o texto de contexto que o assistente recebe a cada pergunta.
// Sem ids, e-mails ou dados de conta bancária.
import { prioridadesDoDia } from "./calc";
import { dataBR, dataCurta, somaDias } from "./datas";
import { resumoParaClaude } from "./resumo";
import { agendaDoDia, agoraMinSP, blocosDoDia, hhmm, progressoMetaPessoal, sequenciaHabito } from "./rotina";
import type { DadosFin, DataISO } from "./tipos";

export function montarContextoIA(d: DadosFin, hoje: DataISO, agora: Date = new Date()): string {
  const L: string[] = [];
  const min = agoraMinSP(agora);
  const hora = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  L.push(`Agora: ${dataCurta(hoje, true)} (${dataBR(hoje)}), ${hora} (horário de São Paulo).`);
  const perfil = String(d.ajustes?.preferencias?.perfil_ia ?? "").trim();
  if (perfil) L.push(`\n## Sobre o usuário (escrito por ele)\n${perfil}`);

  const agenda = agendaDoDia(d.blocos, d.registros, hoje, hoje, min);
  L.push("\n## Rotina de hoje");
  if (!agenda.length) L.push("- (nenhum bloco de rotina para hoje)");
  for (const i of agenda) {
    const st = i.registro ? i.registro.status.toUpperCase() : i.estado === "passado" ? "não marcado" : i.estado === "agora" ? "AGORA" : "a fazer";
    L.push(`- ${hhmm(i.bloco.inicio)}–${hhmm(i.bloco.fim)} ${i.bloco.titulo} [${i.bloco.categoria}] — ${st}${i.bloco.detalhe ? ` · ${i.bloco.detalhe}` : ""}`);
  }
  const amanha = somaDias(hoje, 1);
  const blocosAmanha = blocosDoDia(d.blocos, amanha);
  if (blocosAmanha.length) {
    L.push(`\n## Rotina de amanhã (${dataCurta(amanha, true)})`);
    for (const b of blocosAmanha) L.push(`- ${hhmm(b.inicio)}–${hhmm(b.fim)} ${b.titulo}`);
  }

  const metas = d.metasPessoais.filter((m) => m.status === "ativa");
  if (metas.length) {
    L.push("\n## Metas pessoais");
    for (const m of metas) {
      const p = progressoMetaPessoal(m, d.medidas, d.registros, hoje);
      if (m.tipo === "habito") {
        L.push(`- ${m.nome}: ${p.semana?.feitos ?? 0}/${p.semana?.alvo ?? "?"} nesta semana · sequência ${sequenciaHabito(d.registros, m.habito, hoje)} dia(s)`);
      } else {
        L.push(
          `- ${m.nome}: atual ${p.atual ?? "sem medida"}${m.unidade}${p.atualData ? ` (medido ${dataCurta(p.atualData)})` : ""} · alvo ${m.alvo ?? "?"}${m.unidade} · prazo ${dataBR(m.prazo)}${p.ritmo ? ` · ritmo ${p.ritmo.porSemana}${m.unidade}/semana (precisa ${p.ritmo.necessarioPorSemana ?? "?"})` : ""}`,
        );
      }
    }
  }

  const prios = prioridadesDoDia(d.tarefas, d.frentes, hoje, 3);
  const abertas = d.tarefas.filter((t) => t.status === "aberta");
  L.push("\n## Ações");
  L.push(`Prioridades de hoje: ${prios.map((p, i) => `${i + 1}) ${p.tarefa.titulo}${p.tarefa.prazo ? ` (até ${dataCurta(p.tarefa.prazo)})` : ""}`).join(" · ") || "nenhuma"}`);
  if (abertas.length > 3) L.push(`Outras abertas: ${abertas.filter((t) => !prios.some((p) => p.tarefa.id === t.id)).slice(0, 10).map((t) => t.titulo).join("; ")}`);

  L.push("\n" + resumoParaClaude(d, hoje).replace(/^# .*\n/, "").replace(/\nPergunta:.*$/s, ""));
  return L.join("\n").slice(0, 15000);
}
