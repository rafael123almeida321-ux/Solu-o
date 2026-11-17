import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { useTeam } from "./context/TeamContext";
import { supabaseConfigurado } from "./lib/supabase";
import Auth from "./pages/Auth";
import Configurar from "./pages/Configurar";
import Equipes from "./pages/Equipes";
import Home from "./pages/Home";
import LeadDetail from "./pages/LeadDetail";
import LeadForm from "./pages/LeadForm";
import Leads from "./pages/Leads";

const Mapa = lazy(() => import("./pages/Mapa"));
const Agente = lazy(() => import("./pages/Agente"));
const EquipePage = lazy(() => import("./pages/EquipePage"));
const Hoje = lazy(() => import("./pages/comando/Hoje"));
const Caixa = lazy(() => import("./pages/comando/Caixa"));
const MetaPage = lazy(() => import("./pages/comando/MetaPage"));
const Frentes = lazy(() => import("./pages/comando/Frentes"));
const RevisaoPage = lazy(() => import("./pages/comando/Revisao"));
const Mais = lazy(() => import("./pages/comando/Mais"));

export default function App() {
  const { session, carregando } = useAuth();
  const { teamId, carregandoEquipes, minhasEquipes } = useTeam();

  if (!supabaseConfigurado) return <Configurar />;
  if (carregando) return <Carregando />;
  if (!session)
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  if (carregandoEquipes && !minhasEquipes.length && !teamId) return <Carregando texto="Abrindo suas equipes…" />;

  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/equipes" element={<Equipes />} />
        {teamId ? (
          <Route element={<Layout />}>
            <Route index element={<Hoje />} />
            <Route path="crm" element={<Home />} />
            <Route path="caixa" element={<Caixa />} />
            <Route path="meta" element={<MetaPage />} />
            <Route path="frentes" element={<Frentes />} />
            <Route path="revisao" element={<RevisaoPage />} />
            <Route path="mais" element={<Mais />} />
            <Route path="leads" element={<Leads />} />
            <Route path="leads/novo" element={<LeadForm />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="leads/:id/editar" element={<LeadForm />} />
            <Route path="mapa" element={<Mapa />} />
            <Route path="equipe" element={<EquipePage />} />
            <Route path="agente" element={<Agente />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/equipes" replace />} />
        )}
      </Routes>
    </Suspense>
  );
}
