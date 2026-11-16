import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useApi } from "../../hooks/useApi.js";
import { ErrorBox, Loading } from "../../components/ui.jsx";
import "./buyer.css";

const dateAfter = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const initialForm = () => ({ grade: "A", tons: "", priceUsd: "", deliverBy: dateAfter(30), floorUsd: "", escalation: false, pct: "8" });
const GRADES = { A: "Grade A - premium export quality", B: "Grade B - standard quality", C: "Grade C - processing quality" };

export default function BuyerDashboard() {
  const { user } = useAuth();
  const reqs = useApi("/requirements", { refreshMs: 60000, live: ["requirements", "bonds"] });
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [withdrawing, setWithdrawing] = useState(null);
  const publishing = useRef(false);
  const formHeading = useRef(null);
  const rows = reqs.data || [];
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const openForm = () => {
    setShowForm(true);
    setError("");
    setSuccess("");
    requestAnimationFrame(() => { formHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" }); formHeading.current?.focus(); });
  };
  const publish = async (event) => {
    event.preventDefault();
    if (publishing.current) return;
    setError(""); setSuccess("");
    if (form.deliverBy <= dateAfter(0)) { setError("Choose a delivery date after today."); return; }
    if (form.floorUsd !== "" && +form.floorUsd > +form.priceUsd) { setError("The price floor cannot exceed your offered price."); return; }
    publishing.current = true; setBusy(true);
    try {
      await api("/requirements", { method: "POST", body: {
        grade: form.grade, tons: +form.tons, priceUsd: +form.priceUsd, deliverBy: form.deliverBy,
        ...(form.floorUsd !== "" && { floorUsd: +form.floorUsd }),
        escalation: { enabled: form.escalation, pct: form.escalation ? +form.pct : 0 },
      } });
      setSuccess("Requirement posted. Farmers can now see your offer. It is listed below under Your requirements.");
      setShowForm(false); setForm(initialForm());
      await reqs.reload();
    } catch (err) { setError(err.message === "Request failed" ? "Could not post your requirement. Check the fields and try again." : err.message); }
    finally { publishing.current = false; setBusy(false); }
  };
  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this requirement? Farmers will no longer see this offer.")) return;
    setWithdrawing(id); setError(""); setSuccess("");
    try { await api(`/requirements/${id}`, { method: "DELETE" }); setSuccess("Requirement withdrawn."); await reqs.reload(); }
    catch (err) { setError(err.message || "Could not withdraw this requirement."); }
    finally { setWithdrawing(null); }
  };

  return <div id="buyer" className="buyer-workspace">
    <div className="page-head buyer-heading">
      <div><p className="buyer-eyebrow">{user.company || user.name || "Buyer portal"}</p><h2>Your requirements</h2>
        <p className="sub">Tell farmers what mangoes you need, how much you will pay, and when to deliver.</p></div>
      <button type="button" className="btn" onClick={openForm} disabled={busy} aria-expanded={showForm} aria-controls="buyer-requirement-form">+ Post a requirement</button>
    </div>
    <ol className="buyer-steps" aria-label="Buying process"><li><b>1. Post a requirement</b><span>Choose grade, quantity, price and date.</span></li><li><b>2. Receive commitments</b><span>Farmers respond to your offer.</span></li><li><b>3. Review an agreement</b><span>Confirm terms with your farmer.</span></li></ol>
    {success && <div className="buyer-success" role="status">{success}</div>}
    {error && <div className="buyer-error" role="alert">{error}</div>}
    {showForm && <section className="card buyer-form" id="buyer-requirement-form" aria-labelledby="requirement-title">
      <h3 id="requirement-title" ref={formHeading} tabIndex={-1}>Post a requirement</h3>
      <p className="sub">Crop: Alphonso mangoes. Complete these four details to publish your offer.</p>
      <form onSubmit={publish}>
        <fieldset disabled={busy} className="buyer-fields">
          <div className="row">
            <div><label htmlFor="req-grade">Mango grade</label><select id="req-grade" value={form.grade} onChange={set("grade")}>{Object.entries(GRADES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div><label htmlFor="req-tons">Quantity (metric tons)</label><input id="req-tons" type="number" min="1" step="0.1" placeholder="e.g. 10" value={form.tons} onChange={set("tons")} required /><span className="note">1 metric ton = 1,000 kg. Minimum 1 ton.</span></div>
          </div>
          <div className="row">
            <div><label htmlFor="req-price">Your offered price (USD per kg)</label><input id="req-price" type="number" min="0.1" step="0.01" placeholder="e.g. 5.00" value={form.priceUsd} onChange={set("priceUsd")} required /></div>
            <div><label htmlFor="req-date">Delivery date</label><input id="req-date" type="date" min={dateAfter(1)} value={form.deliverBy} onChange={set("deliverBy")} required /></div>
          </div>
          <details className="buyer-optional"><summary>Optional pricing terms</summary>
            <p className="note">Leave these unchanged for a straightforward fixed-price offer.</p>
            <label htmlFor="req-floor">Minimum price floor (USD per kg)</label><input id="req-floor" type="number" min="0" max={form.priceUsd || undefined} step="0.01" value={form.floorUsd} onChange={set("floorUsd")} />
            <label className="buyer-check"><input type="checkbox" checked={form.escalation} onChange={set("escalation")} /> Allow a higher offer if supply is tight</label>
            {form.escalation && <><label htmlFor="req-escalation">Maximum increase (%)</label><input id="req-escalation" type="number" min="0" max="30" step="0.1" value={form.pct} onChange={set("pct")} required /></>}
          </details>
          {+form.tons > 0 && +form.priceUsd > 0 && <p className="insight">Estimated produce value: <b>USD {(+form.tons * 1000 * +form.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>. Excludes transport and other charges.</p>}
          <div className="buyer-actions"><button className="btn" type="submit">{busy ? "Posting?" : "Post requirement"}</button><button className="btn alt" type="button" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button></div>
        </fieldset>
      </form>
    </section>}
    <section className="card" aria-labelledby="requirements-list-title">
      <div className="page-head"><h3 id="requirements-list-title">Your requirements ({rows.length})</h3><button type="button" className="btn alt small" onClick={reqs.reload}>Refresh</button></div>
      {reqs.loading && <Loading />}
      <ErrorBox error={reqs.error} />
      {!reqs.loading && !reqs.error && rows.length === 0 && <div className="buyer-empty"><h3>Start with your first requirement</h3><p>Post an offer so farmers know what you want to buy.</p><button className="btn" type="button" onClick={openForm}>Post a requirement</button></div>}
      {rows.length > 0 && <div className="tableWrap"><table><thead><tr><th>Grade</th><th>Quantity</th><th>Offer (USD/kg)</th><th>Delivery date</th><th>Claimed / requested</th><th>Interested</th><th>Actions</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r._id}><td>Grade {r.grade}</td><td>{r.tons} t</td><td>${Number(r.priceUsd).toFixed(2)}</td><td>{r.deliverBy.slice(0, 10)}</td><td>{+((r.filled || 0) + (r.reserved || 0)).toFixed(1)} / {r.tons} t</td><td>{r.interested || 0} farmers</td><td><button className="btn alt small" type="button" disabled={withdrawing !== null} onClick={() => withdraw(r._id)}>{withdrawing === r._id ? "Withdrawing?" : "Withdraw"}</button></td></tr>)}
      </tbody></table></div>}
    </section>
    <p className="note">Already received a farmer commitment? <Link to="/contracts">Review your agreements</Link>.</p>
  </div>;
}
