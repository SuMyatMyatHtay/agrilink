import { useId, useState } from "react";
import { useI18n } from "../i18n/index.jsx";

export const DISTRICTS = ["Sindhudurg", "Ratnagiri", "Raigad", "Palghar"];

/** Farm profile form used for onboarding and for editing the profile. */
export default function FarmForm({ initial, onSubmit, busy, onboarding = false, submitLabel }) {
  const prefix = useId();
  const { t } = useI18n();
  const f = initial?.farm || {};
  const [v, setV] = useState({
    name: initial?.name || "", village: f.village || "", district: f.district || "Sindhudurg", acres: f.acres ?? "",
    trees: f.trees ?? "", age: f.age ?? "", irrigation: f.irrigation || "drip", fpo: f.fpo || "",
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ name: v.name.trim(), farm: { village: v.village.trim(), district: v.district, acres: +v.acres, variety: "Alphonso", trees: +v.trees, age: +v.age, irrigation: v.irrigation, fpo: v.fpo.trim() } });
  };
  return (
    <form onSubmit={submit} autoComplete="off" className="farm-form">
      <fieldset disabled={busy} className="farm-form-group">
      {onboarding && <legend>Your details & location</legend>}
      <label htmlFor={`${prefix}-name`}>{t("name")}</label>
      <input id={`${prefix}-name`} autoComplete="name" value={v.name} onChange={set("name")} required />
      <div className="row">
        <div><label htmlFor={`${prefix}-village`}>{t("village")}</label><input id={`${prefix}-village`} value={v.village} onChange={set("village")} required /></div>
        <div><label htmlFor={`${prefix}-district`}>{t("district")}</label>
          <select id={`${prefix}-district`} value={v.district} onChange={set("district")}>{DISTRICTS.map((d) => <option key={d} value={d}>{t("d_" + d)}</option>)}</select></div>
      </div>
      </fieldset>
      <fieldset disabled={busy} className="farm-form-group">
      {onboarding && <legend>Your orchard</legend>}
      <div className="row">
        <div><label htmlFor={`${prefix}-acres`}>{t("acres")}</label><input id={`${prefix}-acres`} type="number" step="0.5" min="0.5" value={v.acres} onChange={set("acres")} required /></div>
        <div><label htmlFor={`${prefix}-variety`}>{t("variety")}</label><select id={`${prefix}-variety`} value="Alphonso" onChange={() => {}}><option value="Alphonso">{t("v_alphonso")}</option></select></div>
      </div>
      <div className="row">
        <div><label htmlFor={`${prefix}-trees`}>{t("trees")}</label><input id={`${prefix}-trees`} type="number" min="1" value={v.trees} onChange={set("trees")} required /></div>
        <div><label htmlFor={`${prefix}-age`}>{t("age")}</label><input id={`${prefix}-age`} type="number" min="1" max="100" value={v.age} onChange={set("age")} required /></div>
      </div>
      </fieldset>
      <fieldset disabled={busy} className="farm-form-group">
      {onboarding && <legend>Farm management</legend>}
      <div className="row">
        <div><label htmlFor={`${prefix}-irrigation`}>{t("irrigation")}</label>
          <select id={`${prefix}-irrigation`} value={v.irrigation} onChange={set("irrigation")}>{["drip", "well", "rain"].map((i) => <option key={i} value={i}>{t("irr_" + i)}</option>)}</select></div>
        <div><label htmlFor={`${prefix}-fpo`}>{t("fpo")}</label><input id={`${prefix}-fpo`} value={v.fpo} onChange={set("fpo")} /></div>
      </div>
      </fieldset>
      <button className="btn big" type="submit" disabled={busy}>{submitLabel || t("save")}</button>
    </form>
  );
}
