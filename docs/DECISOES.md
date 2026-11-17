# Decisões técnicas

1. **Módulo pessoal dentro do CRM (mesmo app, mesmo Supabase).** Reaproveita login, mapa, rota e leads. Os dados financeiros ficam em tabelas próprias (`fin_*`) com RLS `user_id = auth.uid()`: dono/admin da equipe não enxerga.
2. **Dinheiro em centavos inteiros (`bigint`)**, convertido para texto só na tela. Nada de float em soma.
3. **Datas como `date` / "AAAA-MM-DD" no fuso America/Sao_Paulo.** A aritmética usa UTC meio-dia como régua para não haver salto de fuso.
4. **Saldo inicial = início do dia da data-base.** Entram os lançamentos realizados com `data_pagamento >= data_base`. Mesmo critério para dívidas (`data_referencia`).
5. **Cartão de crédito como conta do tipo `cartao`.** Compra = saída do cartão; pagar fatura = transferência conta → cartão. Assim a despesa conta uma vez só. "Caixa" ignora cartões.
6. **Previsto nunca entra no saldo realizado.** Liquidar um previsto altera o mesmo registro (sem duplicar).
7. **Recorrências idempotentes** por `(recorrencia_id, recorrencia_seq)` único; o app usa upsert ignorando duplicados.
8. **Meta acumulativa x mensal.** Redução de dívida e reserva usam restante ÷ dias restantes (contando hoje e o prazo). Faturamento/lucro mensal só olham o mês corrente.
9. **Ritmo observado só com 2 semanas completas (seg–dom)** desde a data-base; antes disso aparece "sem base suficiente".
10. **Revisões imutáveis** (gatilho bloqueia update/delete); correção = nova revisão com `corrige_id`.
11. **Metas versionadas por gatilho** (`fin_goal_history`); auditoria de lançamentos, dívidas e metas em `fin_audit`.
12. **Restauração via função `fin_restaurar`** (security definer, tudo filtrado por `auth.uid()`, gatilhos forçam o dono e conferem referências). Tudo ou nada; o app baixa um backup antes.
13. **Sem dependência de IA** para registrar, calcular ou revisar.
