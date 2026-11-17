# Pesquisa de CRMs — o que foi copiado (e adaptado) pro CLYENT CRM

Pesquisa feita em outubro/2026 em CRMs de vendas tradicionais, CRMs brasileiros e — o mais importante pro seu caso — apps de **venda de campo / porta a porta**, que são feitos pra quem prospecta andando na rua.

## O que cada um faz de melhor → como entrou no app

| Referência | O melhor que ela tem | Como ficou no CLYENT CRM |
|---|---|---|
| **Pipedrive** | "Venda baseada em atividade": todo negócio precisa de um próximo passo; negócio parado é sinalizado ("deal rotting"); cores de urgência (atrasado/hoje/futuro) | Todo lead tem **próximo contato + o que fazer**. Início mostra **Pra hoje**, **Esfriando** (5+ dias sem contato) e **Sem próximo passo**. Cartão mostra "atrasado"/"hoje". Botões de 1 toque: amanhã, +3 dias, +1 semana |
| **Follow Up Boss** (imobiliárias) | "Lead Ponds": lead que o corretor largou vai pra um lago onde outro pode pegar | **Lago de leads**: o admin define X dias; lead sem contato nesse tempo aparece pra equipe com botão **Assumir lead**. Resolve vendedor "segurando" lead sem trabalhar |
| **SalesRabbit / SPOTIO** (porta a porta) | Registro rápido de batida de porta com GPS e "resultado" (não estava, voltar depois…); mapa de território; ranking e gamificação | **Cadastro rápido** com 6 botões de resultado (Dono não estava, Pediu pra voltar, Interessado, Quer proposta, Fechou, Sem interesse) que já ajustam temperatura, etapa e data de retorno. GPS automático. **Mapa da equipe** mostrando onde cada um já bateu |
| **Badger Maps** | Rota otimizada com várias paradas; "check-in" com localização; contas que precisam de atenção perto de você; nota por voz | **Rota do dia**: pega seus leads mornos/quentes/revisita/retorno-hoje num raio de 15 km, ordena pelo mais perto e abre no Google Maps. Botão **Visitei agora** (check-in com GPS). **Nota por voz** (Whisper/Groq) |
| **Kommo** (forte no Brasil) | Tudo girando em torno do WhatsApp | Botão de WhatsApp em todo lead, mensagem gerada por IA que já abre o WhatsApp com o texto pronto e registra o contato no histórico sozinho |
| **RD Station CRM / Agendor / PipeRun** | Motivo de perda obrigatório e relatório; lembrete de follow-up; app de campo | **Motivo de perda** obrigatório (chips prontos) e relatório **Por que perdemos**; **conversão por origem** |
| **HubSpot (Breeze)** | Copiloto de IA dentro do CRM; distribuição de leads entre vendedores | **Agente de IA** com acesso real aos dados (consulta, move etapa, marca follow-up, registra nota, monta briefing). Distribuição: em vez de round-robin automático, o dono **transfere** ou **libera** lead pra pessoa certa |
| **Zoho Motivator** | Competições, placar e "modo TV" pra passar no escritório | **Ranking** semanal/mensal com pontos e **Modo TV** em tela cheia |

## O que é só nosso (não achei pronto em nenhum)

- **Contato protegido por padrão**: a equipe vê *quem* já foi abordado, mas não *como contatar*. Evita um vendedor pegar o cliente do outro e evita dois vendedores baterem na mesma porta.
- **Pedido de acesso**: o vendedor pede o contato, o dono aprova com 1 toque na tela de Início.
- **Aviso de duplicado sem vazar dado**: ao cadastrar, se o telefone ou o nome já existir na equipe, aparece "já é lead do João" — sem mostrar o número dele.
- **Mapa com área aproximada**: lead protegido aparece como um círculo de ~1 km, não como ponto exato.
- **Termômetro arrastável** de 0 a 100° com vibração ao trocar de faixa (frio/morno/quente) e atalhos de 1 toque.
- **Fila offline**: cadastrou sem sinal, o lead fica guardado no celular e sobe sozinho quando a internet volta.
- **Produção conectada**: fechou → entra na fila de produção com o prazo de 3 dias úteis contando.
- **Comissão automática** (percentual configurável) e **barra do teto anual** (ex.: MEI) com alerta em 80%.
- **Saída do vendedor**: quem sai da equipe deixa os leads com o dono — a carteira fica com a empresa.

## Ficou de fora (próximas versões)

- Notificação push no celular quando alguém pede acesso ou um lead vence (hoje aparece dentro do app, em tempo real).
- Integração direta com WhatsApp Business API (receber mensagens dentro do CRM, como o Kommo) — exige conta Meta e é paga por conversa.
- Distribuição automática de leads que chegam por tráfego pago (round-robin) — faz sentido quando os formulários/anúncios estiverem ligados ao CRM.
- Propostas/contratos com assinatura dentro do app (o PipeRun tem).
- Importar planilha de leads (exportar CSV já existe).
- Territórios desenhados no mapa por vendedor (SPOTIO/SalesRabbit).
