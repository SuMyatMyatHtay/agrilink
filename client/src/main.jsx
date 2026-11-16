import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RealtimeProvider } from "./context/RealtimeContext.jsx";
import { I18nProvider } from "./i18n/index.jsx";
import { ToastProvider } from "./components/ui.jsx";
import "./styles.css";
import "./trust.css";
import { registerServiceWorker } from "./offline.js";
import StaticDemo from "./StaticDemo.jsx";

const standalone = import.meta.env.VITE_DEMO_MODE !== "false" && (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE === "true");
if (!standalone) registerServiceWorker();
else if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((items) => items.forEach((item) => item.unregister())).catch(() => {});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        {standalone ? <StaticDemo /> : <>
        <ToastProvider>
          <AuthProvider>
            <RealtimeProvider>
              <App />
            </RealtimeProvider>
          </AuthProvider>
        </ToastProvider>
        </>}
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
