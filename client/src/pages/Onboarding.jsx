import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../i18n/index.jsx";
import FarmForm from "../components/FarmForm.jsx";
import { LangChips, Loading } from "../components/ui.jsx";
import { Brand } from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import "./onboarding.css";

export default function Onboarding() {
  const { t, lang } = useI18n();
  const { user, setUser, ready, logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login/farmer" replace />;
  if (user.role !== "farmer") return <Navigate to={user.role === "buyer" ? "/buyer" : "/ops/decisions"} replace />;
  if (user.farm) return <Navigate to="/farmer/home" replace />;
  const save = async (body) => {
    setBusy(true); setErr("");
    try {
      setUser(await api("/farmers/me", { method: "PUT", body: { ...body, lang } }));
      nav("/farmer/home", { replace: true });
    } catch { setErr(t("err_generic")); setBusy(false); }
  };
  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <button type="button" className="onboarding-back" disabled={busy} onClick={() => { logout(); nav("/", { replace: true }); }}><Icon name="arrowLeft" size={18} />Back to home</button>
        <Brand /><LangChips />
      </header>
      <main className="onboarding-main">
        <div className="onboarding-intro"><span className="onboarding-step">FARMER ACCOUNT SETUP</span><h1>{t("setup_title")}</h1><p>{t("setup_sub")}</p></div>
        <section className="onboarding-card" aria-label="Farm profile">
          {err && <p className="onboarding-error" role="alert">{err}</p>}
          <FarmForm initial={user} onSubmit={save} busy={busy} onboarding submitLabel={busy ? "Saving your farm…" : "Save and open dashboard"} />
        </section>
        <p className="onboarding-footnote">You can update your farm details later in your profile.</p>
      </main>
    </div>
  );
}
