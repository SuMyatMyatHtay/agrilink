import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { api, getToken } from "../../api.js";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { ErrorBox, Loading } from "../../components/ui.jsx";
import { Hash, fetchPdf, sha256Hex } from "../../components/trust/ui.jsx";
import "./pilot.css";

const usd = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
async function photoData(file) {
  if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try { const canvas = document.createElement("canvas"), scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length > 1500000) throw new Error("This photo is too large. Use a smaller image."); return data;
  } finally { bitmap.close(); }
}
function Review({ photo, busy, onConfirm }) {
  const [grade, setGrade] = useState(photo.analysis.grade_hint || "B"), [note, setNote] = useState("");
  return <div className="pilot-review"><select aria-label="Confirmed grade" value={grade} onChange={e => setGrade(e.target.value)}><option>A</option><option>B</option><option value="REJECT">Reject</option></select>
    <input aria-label="Review evidence" placeholder="What did the FPO / doctor confirm?" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
    <button className="btn small" disabled={busy || note.trim().length < 5} onClick={() => onConfirm(grade, note)}>Confirm review</button></div>;
}
export default function Pilot() {
  const { id } = useParams(), { user } = useAuth();
  const { hash: locationHash } = useLocation();
  const query = useApi(`/pilot/${id}`, { refreshMs: 15000, live: ["pilot", "contracts"] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [message, setMessage] = useState("");
  const [kg, setKg] = useState(""), [dispute, setDispute] = useState(""), [verification, setVerification] = useState(null), [preview, setPreview] = useState(null);
  const [scores, setScores] = useState({ quality: 5, reliability: 5, communication: 5, note: "" });
  useEffect(() => { if (locationHash === "#integrity-proof" && query.data?.agreement.id) requestAnimationFrame(() => document.getElementById("integrity-proof")?.scrollIntoView({ behavior: "smooth", block: "start" })); }, [locationHash, query.data?.agreement.id]);
  const act = async (path, body = {}) => {
    setBusy(true); setError(null); setMessage("");
    try { const result = await api(`/pilot/${id}${path}`, { method: "POST", body }); await query.reload(); setMessage("Saved. The agreement workspace is up to date."); return result; }
    catch (e) { setError(e); return null; } finally { setBusy(false); }
  };
  const upload = async file => { try { setBusy(true); const image = await photoData(file); await act("/quality", { image }); } catch (e) { setError(e); } finally { setBusy(false); } };
  const viewPhoto = async photo => {
    try { const response = await fetch(`/api/pilot/${id}/quality/${photo._id}/image`, { headers: { authorization: `Bearer ${getToken()}` } }); if (!response.ok) throw new Error("Photo unavailable");
      const reader = new FileReader(); reader.onload = () => setPreview(reader.result); reader.readAsDataURL(await response.blob()); }
    catch (e) { setError(e); }
  };
  const verify = async modified => {
    setBusy(true); setError(null);
    try { const { blob } = await fetchPdf(`/contracts/${id}/document`), bytes = new Uint8Array(await blob.arrayBuffer());
      if (modified) bytes[Math.floor(bytes.length / 2)] ^= 1;
      const hash = await sha256Hex(bytes.buffer);
      setVerification(await api(`/pilot/${id}/proof/verify`, { method: "POST", body: { hash } }));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  if (query.loading && !query.data) return <Loading />;
  if (!query.data) return <ErrorBox error={query.error} />;
  const { agreement: a, permissions: p, deal, photos, ratings, model, proof } = query.data;
  const e = deal.escrow, d = deal.delivery, settled = ["released", "refunded"].includes(e.status);
  const latestPhoto = photos[0];
  const reviewed = latestPhoto?.status === "confirmed" && (a.grade === "A" ? latestPhoto.grade === "A" : ["A", "B"].includes(latestPhoto.grade));
  const mine = ratings.find(r => String(r.from) === String(user._id));
  const nextStep = !a.signed ? "Complete the buyer, farmer and assigned FPO witness signatures." : e.status === "unfunded" ? "The buyer simulates funding the escrow." : e.status === "funded" ? "The buyer releases the simulated 50% advance." : e.status === "advance_released" ? d.status === "dispatched" ? "The buyer confirms receipt of the shipment." : reviewed ? "The farmer or FPO records the shipped kilograms." : "The FPO reviewer confirms the latest quality assessment before dispatch." : e.status === "received" ? "The buyer accepts the delivery or opens a dispute." : e.status === "disputed" ? "The FPO reviewer resolves the dispute while the remaining balance stays frozen." : "Buyer and farmer can now rate each other and verify the signed PDF.";
  const steps = [["Signatures", a.signed], ["Quality review", reviewed], ["Escrow funded", e.deposited > 0], ["Delivery settled", settled], ["Ratings", ratings.length >= 2]];
  const payAction = (action, label, enabled, body = {}) => enabled && <button className="btn small" disabled={busy || !a.signed} onClick={() => act(`/escrow/${action}`, body)}>{label}</button>;
  return <div className="pilot-workspace">
    <Link className="linkbtn" to={`/contracts/${id}`}>← Back to agreement</Link>
    <div className="page-head"><div><p className="pilot-eyebrow">From signed agreement to delivery</p><h2>Quality, delivery &amp; trust</h2><p className="sub">{id} · Version {a.version} · {a.buyer} ↔ {a.farmer}</p></div><span className="badge b-draft">Demo payments · no money moves</span></div>
    <ol className="pilot-progress">{steps.map(([label, done], i) => <li key={label} className={done ? "done" : ""}><b>{done ? "✓" : i + 1}</b><span>{label}</span></li>)}</ol>
    {!a.signed && <p className="insight">Complete buyer, farmer and FPO witness signatures before funding or dispatch. Photo assessment can be explored now.</p>}
    <ErrorBox error={error || query.error} />{message && <p role="status" className="pilot-success">{message}</p>}

    <details className="card pilot-section" open><summary><span>1. Crop quality &amp; FPO review</span><span className="note">{photos.length} assessments</span></summary>
      <p className="note">Upload a photo for live ML analysis, or explicitly choose an illustrative demo scenario. AI grades are provisional. Weight and Brix require physical measurements.</p>
      {(p.farmer || p.reviewer) && <div className="page-actions">
        <label className="btn small">Analyze a crop photo<input aria-label="Crop photo for live analysis" type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <button className="btn alt small" disabled={busy} onClick={() => act("/quality", { sample: "good" })}>Try Grade A scenario · demo</button>
        <button className="btn alt small" disabled={busy} onClick={() => act("/quality", { sample: "poor" })}>Try damaged crop · demo</button>
      </div>}
      {photos.length === 0 && <p className="note">No assessments yet. The farmer or FPO reviewer can submit the first one.</p>}
      {photos.map(photo => <article className="pilot-assessment" key={photo._id}>
        <div className="pilot-row"><b>{photo.simulated ? "Illustrative demo assessment" : "Live image analysis"}</b><span className={`badge ${photo.status === "confirmed" ? "b-registered" : "b-pending_signature"}`}>{photo.status === "confirmed" ? `Confirmed: ${photo.grade}` : "Awaiting human review"}</span></div>
        <p>Provisional grade: <b>{photo.analysis.grade_hint || "No usable fruit detected"}</b> · Visible blemishes: {photo.analysis.defect_pct}% · Confidence: {Math.round(photo.analysis.confidence * 100)}%</p>
        <p className="note">{photo.analysis.notes?.join(" ")}</p>
        {photo.analysis.learned && <p className="note">Doctor-trained classifier revision {photo.analysis.learningRevision}: {photo.analysis.learned.grade}. The human reviewer decides the final grade.</p>}
        {!photo.simulated && <button className="linkbtn" onClick={() => viewPhoto(photo)}>View submitted photo</button>}
        {photo.status === "confirmed" ? <p className="note">Reviewer: {photo.note}</p> : p.reviewer ? <Review photo={photo} busy={busy} onConfirm={(grade, note) => act(`/quality/${photo._id}/review`, { grade, note })} /> : <p className="note">Your FPO officer or assigned farmer doctor must confirm this assessment.</p>}
      </article>)}
      {preview && <div><img src={preview} alt="Submitted crop evidence" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 12 }} /><button className="linkbtn" onClick={() => setPreview(null)}>Close photo</button></div>}
      <div className="pilot-learning"><b>Learning from confirmed photos</b><p className="note">{model ? `${model.examples} unique photo labels · revision ${model.revision} · ${model.ready ? "learned grader active" : "collect at least 4 examples across 2 grades to activate predictions"}` : "No confirmed real-photo labels yet."} Each usable photo confirmed by a reviewer updates the prototype grader. Demo scenarios never enter training. Field validation is still required.</p></div>
    </details>

    <details className="card pilot-section" open><summary><span>2. Simulated escrow &amp; delivery</span><span className="badge b-draft">{e.status.replaceAll("_", " ")}</span></summary>
      <p className="note">Practice the payment workflow using a persistent demo ledger. No bank, card or crypto transfer occurs.</p>
      <p className="insight">Next step: {nextStep}</p>
      <div className="pilot-balances">{[["Contract", a.total], ["Held", e.held], ["Paid to FPO · simulated", e.paid], ["Refunded · simulated", e.refunded]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{usd(value)}</strong></div>)}</div>
      <div className="page-actions">
        {payAction("fund", "Simulate buyer funding", p.buyer && e.status === "unfunded")}
        {payAction("advance", "Release simulated 50% advance", p.buyer && e.status === "funded")}
        {(p.farmer || p.reviewer) && e.status === "advance_released" && d.status === "not_dispatched" && <><input aria-label="Shipped kilograms" style={{ width: 180 }} type="number" min="1" max={a.kg} value={kg} placeholder={`${a.kg} kg ordered`} onChange={event => setKg(event.target.value)} />{payAction("ship", "Record dispatch", reviewed && Number(kg) > 0 && Number(kg) <= a.kg, { kg: Number(kg) })}</>}
        {payAction("receive", "Confirm goods received", p.buyer && d.status === "dispatched")}
        {payAction("release", "Accept delivery & simulate settlement", p.buyer && e.status === "received")}
        {payAction("resolve_release", "Resolve: release for shipped quantity", p.reviewer && e.status === "disputed")}
        {payAction("resolve_refund", "Resolve: refund remaining held funds", p.reviewer && e.status === "disputed")}
      </div>
      {e.status === "advance_released" && !reviewed && <p className="note">Dispatch needs a confirmed quality assessment meeting the agreement's grade.</p>}
      {d.shippedKg && <p className="note">Shipment: {d.shippedKg} / {a.kg} kg · {d.status.replaceAll("_", " ")}{d.simulatedQuality ? " · Quality scenario is simulated" : ""}</p>}
      {p.buyer && e.status === "received" && <div className="pilot-review"><input aria-label="Delivery dispute reason" value={dispute} maxLength={500} placeholder="Describe an issue with this delivery" onChange={event => setDispute(event.target.value)} /><button className="btn alt small" disabled={busy || dispute.trim().length < 5} onClick={() => act("/escrow/dispute", { note: dispute })}>Open dispute · freeze balance</button></div>}
      {e.dispute && <p className="insight">Dispute: {e.dispute}</p>}
      {e.advanceExcessOwed > 0 && <p className="note">Advance exceeding shipped value: {usd(e.advanceExcessOwed)}. This is recorded as owed by the FPO; it has not been recovered.</p>}
      <div className="tableWrap"><table><thead><tr><th>Ledger event</th><th>Amount</th><th>Recorded</th></tr></thead><tbody>{e.ledger.map((entry, i) => <tr key={i}><td>{entry.step}</td><td>{usd(entry.amount)}</td><td>{new Date(entry.at).toLocaleString()}</td></tr>)}</tbody></table></div>
    </details>

    <details className="card pilot-section" open><summary><span>3. Two-way delivery ratings</span><span className="note">{ratings.length} recorded</span></summary>
      <p className="note">Only the buyer and farmer may rate this settled delivery, once each. These demonstration records feed the optional rating-based allocation policy; they are not proof of real-world performance.</p>
      {!settled ? <p className="note">Ratings unlock after settlement or dispute resolution.</p> : (p.buyer || p.farmer) && !mine && <>
        <div className="pilot-rating-fields">{[["quality", p.buyer ? "Produce quality" : "Fair grading"], ["reliability", p.buyer ? "Volume & timing" : "Payment reliability"], ["communication", "Communication"]].map(([key, label]) => <label key={key}>{label}<select value={scores[key]} onChange={event => setScores(s => ({ ...s, [key]: +event.target.value }))}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div>
        <input aria-label="Rating comment" value={scores.note} maxLength={500} placeholder="What went well? What can improve?" onChange={event => setScores(s => ({ ...s, note: event.target.value }))} />
        <button className="btn small" disabled={busy} style={{ marginTop: 10 }} onClick={() => act("/rating", scores)}>Submit delivery rating</button>
      </>}
      {ratings.map(r => <div className="pilot-assessment" key={r._id}><b>{r.side === "buyer" ? "Buyer → farmer" : "Farmer → buyer"}: {r.score.toFixed(1)} / 5</b><p className="note">{r.note || "Verified settled delivery"}</p></div>)}
    </details>

    <details className="card pilot-section" id="integrity-proof" open={locationHash === "#integrity-proof" || undefined}><summary><span>4. Document integrity proof</span><span className="note">{a.chain?.status === "registered" ? "Public-chain registration recorded" : proof ? "Demo proof recorded" : "Not recorded"}</span></summary>
      <p className="note">The demo hash ledger stores a write-once signed-PDF hash in MongoDB and links amended versions. It demonstrates tamper detection; it is not a public blockchain or externally immutable storage. Public Amoy anchoring still uses your configured registry.</p>
      <div className="page-actions"><button className="btn small" disabled={busy || !a.signed || !!proof || !(p.buyer || p.farmer || p.reviewer)} onClick={() => act("/proof")}>{proof ? "Demo proof saved" : "Record demo integrity proof"}</button><Link className="btn alt small" to="/contracts/network">Public blockchain status</Link></div>
      {proof && <><p><b>Signed PDF SHA-256</b></p><Hash value={proof.docHash} short={false} /><p className="note">Demo proof: {proof.proofHash}</p><div className="page-actions"><button className="btn alt small" disabled={busy} onClick={() => verify(false)}>Verify original PDF</button><button className="btn alt small" disabled={busy} onClick={() => verify(true)}>Test a modified copy</button></div></>}
      {verification && <p role="status" className={verification.matches ? "pilot-success" : "down"}>{verification.matches ? "Hash matches: the original signed PDF is unchanged." : "Hash mismatch: the modified file does not match the recorded proof."}</p>}
    </details>
  </div>;
}
