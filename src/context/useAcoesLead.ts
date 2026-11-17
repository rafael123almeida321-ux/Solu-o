import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Estagio, Lead, ProducaoStatus } from "../lib/types";
import { erroMsg, vibrar } from "../lib/utils";
import { useTeam } from "./TeamContext";
import { useToast } from "./ToastContext";

export function useAcoesLead() {
  const { atualizarLeadLocal, recarregar } = useTeam();
  const toast = useToast();

  const atualizar = useCallback(
    async (lead: Lead, patch: Partial<Lead>, msgOk?: string) => {
      atualizarLeadLocal(lead.id, patch);
      const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (error) {
        atualizarLeadLocal(lead.id, lead);
        toast(erroMsg(error), "erro");
        return false;
      }
      if (msgOk) toast(msgOk);
      recarregar();
      return true;
    },
    [atualizarLeadLocal, recarregar, toast],
  );

  const mover = useCallback(
    async (lead: Lead, estagio: Estagio, motivo?: string) => {
      if (lead.estagio === estagio) return true;
      const patch: Partial<Lead> = { estagio };
      if (estagio === "perdido") patch.motivo_perda = motivo || "Não informado";
      if (estagio === "fechado") {
        patch.producao_status = "afazer";
        patch.temperatura = Math.max(lead.temperatura, 90);
        patch.proximo_followup = null;
        vibrar(60);
      }
      return atualizar(
        lead,
        patch,
        estagio === "fechado" ? `🎉 ${lead.nome_negocio} fechado! Já entrou na fila de produção.` : undefined,
      );
    },
    [atualizar],
  );

  const moverProducao = useCallback(
    (lead: Lead, status: ProducaoStatus) =>
      atualizar(lead, { producao_status: status }, status === "entregue" ? `${lead.nome_negocio} entregue ✓` : undefined),
    [atualizar],
  );

  return { atualizar, mover, moverProducao };
}
