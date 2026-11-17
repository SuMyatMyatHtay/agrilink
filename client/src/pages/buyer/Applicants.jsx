import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../api.js";
import { Modal, ErrorBox, Loading } from "../../components/ui.jsx";
export default function Applicants({ requirement, onClose }) {
  const ranking = useApi(`/allocation/${requirement._id}`, { refreshMs: 15000 }), nav = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const award = async () => { setBusy(true); setError(null); try { const result = await api(`/allocation/${requirement._id}/award`, { method: "POST", body: {} }); nav(`/contracts/${result.agreementId}`); } catch (e) { setError(e); await ranking.reload(); } finally { setBusy(false); } };
  return <Modal onClose={() => { if (!busy) onClose(); }}><h3>Rating-based applicants</h3><p className="note">Grade {requirement.grade} · {requirement.tons} t requested. An award reserves quantity and creates a draft; all three signatures are still required.</p>
    <ErrorBox error={error || ranking.error} />{ranking.loading && !ranking.data && <Loading />}
    {ranking.data && <><p className="note">{ranking.data.policy}</p>{ranking.data.newcomerTurn && <p className="insight">This award prioritizes an eligible newcomer.</p>}
      {ranking.data.candidates.length ? <div className="tableWrap"><table><thead><tr><th>Farmer</th><th>Requested</th><th>Rating score</th><th>Eligibility</th></tr></thead><tbody>{ranking.data.candidates.map(c => <tr key={c._id}><td><b>{c.name}</b><div className="note">{c.fpo}</div></td><td>{c.tons} t</td><td>{c.rating.score.toFixed(2)} / 5<div className="note">{c.rating.count} delivery ratings{c.rating.newcomer ? " · newcomer" : ""}</div></td><td>{String(c._id) === String(ranking.data.recommended) ? "Recommended" : c.eligible ? "Eligible" : "Quantity / capacity unavailable"}</td></tr>)}</tbody></table></div> : <p className="note">No applications yet. Farmers can apply from Offers.</p>}
      <div className="mrow"><button className="btn alt" disabled={busy} onClick={onClose}>Close</button><button className="btn" disabled={busy || !ranking.data.recommended} onClick={award}>{busy ? "Awarding..." : "Award highest eligible applicant"}</button></div>
    </>}
  </Modal>;
}
