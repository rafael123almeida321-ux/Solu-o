# Changelog

## 2.0.0 — 2026-11-17 · CLYENT Comando (V1 do módulo pessoal)
- Novo módulo pessoal, dentro do CRM, com 5 áreas: **Hoje**, **Caixa**, **Meta e plano**, **Frentes e ações**, **Revisão semanal**, mais a tela **Mais** (atalhos, categorias, exportar/restaurar, resumo para o Claude).
- Banco: migração `supabase/migrations/001_comando_v1.sql` (tabelas `fin_*`), com RLS por usuário, auditoria, versões de meta e revisões imutáveis.
- Cálculos centralizados em `src/fin/calc.ts` (dinheiro em centavos, datas em São Paulo), cobertos por testes (`npm test`) e testes de banco com RLS (`npm run test:banco`).
- Exportação JSON completa com versão do esquema, CSV de lançamentos e restauração validada (prévia, checagem de compatibilidade, backup automático antes, tudo-ou-nada).
- Navegação: "Hoje" virou a tela inicial; o início antigo do CRM está em `/crm`. O botão "+" agora registra lead, entrada, saída ou ação.

## 1.0.0
- CRM de prospecção da equipe (leads, funil, mapa, ranking, agente de IA).
