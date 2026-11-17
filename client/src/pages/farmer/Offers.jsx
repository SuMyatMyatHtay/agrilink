import { useEffect, useRef, useState } from "react";
import { useRealtime } from "../../context/RealtimeContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./requests.css";
import { api } from "../../api.js";
import { useI18n } from "../../i18n/index.jsx";
import { useApi } from "../../hooks/useApi.js";
import { ErrorBox, Loading, Modal, inr, useToast } from "../../components/ui.jsx";
import OfferAdvice from "../../components/OfferAdvice.jsx";
import PreSignCheck from "../../components/PreSignCheck.jsx";

const VK = { above: "p-good", fair: "p-warn", below: "p-bad" };

function CommitModal({ offer, max, onClose, onDone }) {
  const { t } = useI18n();
  const [v, setV] = useState(String(+Math.min(max, 10).toFixed(1)));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    const n = parseFloat(v);
    if (!(n > 0) || n > max) return setErr(t("over_commit", { max }));
    submitting.current = true; setBusy(true); setErr("");
    try {
      const result = await api(offer.allocationMode === "rating" ? `/allocation/${offer._id}/apply` : "/bonds", { method: "POST", body: offer.allocationMode === "rating" ? { tons: n } : { requirementId: offer._id, tons: n } });
      onDone(result);
    } catch (e) {
      setErr(e.code === "exceeds_capacity" ? t("over_commit", { max }) : e.code === "exceeds_need" ? t("err_exceeds_need") : e.message || t("err_generic"));
    } finally { submitting.current = false; setBusy(false); }
  };
  return (
    <Modal onClose={() => { if (!busy) onClose(); }}>
      <p className="note">Commit to {offer.buyerName}: Grade {offer.grade}, USD {Number(offer.priceUsd).toFixed(2)}/kg.</p>
      <p className="note">{offer.allocationMode === "rating" ? "This submits an application. The buyer awards using verified delivery ratings; quantity is reserved only on award." : "This reserves your quantity and creates a draft agreement for review. It does not sign the agreement."}</p>
      <h3>{t("commit_q", { max })}</h3>
      <input aria-label="Quantity to commit in metric tons" disabled={busy} type="number" step="0.1" min="0.1" max={max} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      {err && <p className="down" role="alert">{err}</p>}
      <PreSignCheck requirementId={offer._id} tons={parseFloat(v)} />
      <div className="mrow"><button className="btn alt" disabled={busy} onClick={onClose}>{t("cancel")}</button><button className="btn" disabled={busy} onClick={submit}>{busy ? "Saving..." : offer.allocationMode === "rating" ? "Submit application" : "Confirm commitment"}</button></div>
    </Modal>
  );
}

export default function Offers() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const target = search.get("requirement");
  const [grade, setGrade] = useState("all");
  const [pick, setPick] = useState(null);
  const offers = useApi(grade === "all" ? "/requirements?open=true" : `/requirements?open=true&grade=${grade}`, { refreshMs: 15000, live: ["requirements", "bonds"] });
  const sum = useApi("/farmers/me/summary", { live: ["bonds"] });
  const th = useApi("/farmers/me/costs").data?.thresholds; // break-even -> minimum offer to accept
  const free = sum.data?.freeTons ?? 0;
  const { markRequestsViewed } = useRealtime();
  const viewedIds = offers.data?.map((r) => r._id).join(",") || "";
  useEffect(() => {
    if (viewedIds) markRequestsViewed(viewedIds.split(",")).catch(() => {});
  }, [viewedIds, markRequestsViewed]);

  return (
    <>
      <h2>{t("offers_title")}</h2>
      <p className="sub">{t("offers_sub")}</p>
      <p className="insight">Standard requests are first come, first served: claiming reserves your quantity immediately. Rating-based requests accept applications; the buyer awards them using verified delivery ratings. All agreements need buyer, farmer and FPO witness signatures.</p>
      {target && offers.data && !offers.data.some((r) => r._id === target) && <p role="status" className="note">That request is no longer available or is outside your selected grade. Other open requests are shown below.</p>}
      {th && <p className="insight">{t("th_banner", { base: Math.round(th.baseline_kg), min: th.min_offer_usd.toFixed(2), target: th.target_offer_usd.toFixed(2) })}</p>}
      <div className="chips">
        {["all", "A", "B", "C"].map((g) => <button key={g} className={`chip ${grade === g ? "on" : ""}`} onClick={() => setGrade(g)}>{g === "all" ? t("all_grades") : `${t("grade")} ${g}`}</button>)}
      </div>
      {offers.loading && <Loading />}
      <ErrorBox error={offers.error} />
      <ErrorBox error={sum.error} />
      {sum.loading && <p className="note">Checking your available farm capacity…</p>}
      {offers.data?.length === 0 && <p className="note">{t("no_match")}</p>}
      <div className="offers-grid">
      {offers.data?.slice().sort((a, b) => Number(b._id === target) - Number(a._id === target)).map((r) => (
        <div className={`card offer ${r._id === target ? "request-highlight" : ""}`} key={r._id}>
          <div className="offerhead">
            <div><b>{r.buyerName}</b><div className="note">{t("grade")} {r.grade} · {t("left", { n: r.left })}</div></div>
            <div className="bigprice">{inr(r.offerInr)}<small>{t("per_kg")}</small></div>
          </div>
          <div className="bar"><i style={{ width: `${(r.filled / r.tons) * 100}%` }} /></div>
          {r.verdict.status === "unavailable" ? <p className="note">Price advice is currently unavailable. You can still review this offer and commit.</p> : <div className="tags">
            <span className={`pill ${VK[r.verdict.status]}`}>{t(r.verdict.status === "above" ? "above" : r.verdict.status === "fair" ? "fair" : "below")}</span>
            <span className={`pill ${r.vsMandiPct >= 0 ? "p-good" : "p-bad"}`}>{t("vs_mandi", { p: `${r.vsMandiPct >= 0 ? "+" : ""}${Math.round(r.vsMandiPct)}%` })}</span>
          </div>}
          <OfferAdvice advice={r.advice} />
          <p className="note">{t("deliver_by")} {r.deliverBy.slice(0, 10)}{r.escalation?.enabled && ` · ${t("escalation", { p: r.escalation.pct })}`}</p>
          <button className="btn" disabled={r.left <= 0 || sum.loading || !!sum.error} onClick={() => (free > 0 ? setPick(r) : toast(t("over_commit", { max: 0 })))}>{r.allocationMode === "rating" ? "Apply for this request" : "Claim this request"}</button>
        </div>
      ))}
      </div>
      {pick && <CommitModal offer={pick} max={+Math.min(pick.left, free).toFixed(1)} onClose={() => setPick(null)}
        onDone={(result) => { setPick(null); if (!result.agreementId) { toast("Application submitted. The buyer will review the ranked applicants."); offers.reload(); return; } toast("Commitment saved. Review your draft agreement next."); nav(result.agreementId ? `/contracts/${result.agreementId}` : "/farmer/agreements"); }} />}
    </>
  );
}
