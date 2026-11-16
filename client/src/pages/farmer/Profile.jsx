import TelegramConnect from "../../components/TelegramConnect.jsx";
import { useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../i18n/index.jsx";
import FarmForm from "../../components/FarmForm.jsx";
import { LangChips, useToast } from "../../components/ui.jsx";

export default function Profile() {
  const { t, lang } = useI18n();
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const save = async (body) => {
    try { setUser(await api("/farmers/me", { method: "PUT", body: { ...body, lang } })); toast(t("saved")); }
    catch { toast(t("err_generic")); }
  };
  return (
    <>
      <h2>{t("profile_title")}</h2>
      <div className="card"><FarmForm initial={user} onSubmit={save} /></div>
      <div className="card"><h3>{t("choose_lang")}</h3><p className="note" style={{ marginTop: 0 }}>{t("prof_lang_note")}</p><LangChips /></div>
      <TelegramConnect />
      <button className="btn big alt" onClick={() => { logout(); nav("/"); }}>⎋ {t("logout")}</button>
    </>
  );
}
