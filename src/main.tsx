import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { TeamProvider } from "./context/TeamContext";
import { ToastProvider } from "./context/ToastContext";
import { FinProvider } from "./fin/FinContext";

// link de convite: https://seuapp.vercel.app/?convite=ABC123
try {
  const convite = new URLSearchParams(window.location.search).get("convite");
  if (convite) sessionStorage.setItem("clyent-convite", convite.toUpperCase());
} catch {
  /* ok */
}

// botão "Instalar app" (Android/Chrome)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as unknown as { __instalar?: Event }).__instalar = e;
  window.dispatchEvent(new Event("instalavel"));
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <TeamProvider>
            <FinProvider>
              <App />
            </FinProvider>
          </TeamProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
