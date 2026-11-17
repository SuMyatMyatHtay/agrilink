import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { ErrorBox, Loading } from "../../components/ui.jsx";
import Icon from "../../components/Icon.jsx";
import { useState } from "react";
import { api } from "../../api.js";

export default function Farmers() {
  // Reuse the desk-scoped endpoint used by the agronomist workspace.
  const farmers = useApi("/advisory/farmers", { live: ["advisory"] });
  const assignments = useApi("/contracts/witness-assignment");
  const [busy, setBusy] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const assign = async (farmerId, officerId) => {
    if (!officerId) return;
    setBusy(farmerId); setAssignmentError(null);
    try { await api(`/contracts/witness-assignment/${farmerId}`, { method: "PUT", body: { officerId } }); await assignments.reload(); }
    catch (error) { setAssignmentError(error); }
    finally { setBusy(null); }
  };
  return <>
    <div className="page-head"><div><h2>Farmers</h2><p className="sub">Farmers visible to your selected desk. Open a profile to review advice, inspections and follow-up tasks.</p></div><Link className="btn alt" to="/ops/agronomist"><Icon name="target" />Farmer support</Link></div>
    <section className="card">
      <h3>FPO witness assignments</h3>
      <p className="note">Assign a specific operations account to witness each farmer's contracts. The buyer and farmer sign first; that officer countersigns last. An officer can belong to one FPO. Existing sent documents retain their assigned witness.</p>
      <ErrorBox error={assignmentError || assignments.error} />
      {assignments.data && <div className="tableWrap"><table><thead><tr><th>Farmer</th><th>FPO</th><th>Assigned witness</th></tr></thead><tbody>
        {assignments.data.farmers.map(f => <tr key={f.id}><td>{f.name}</td><td>{f.fpo}</td><td>
          {assignments.data.canAssign ? <select aria-label={`FPO witness for ${f.name}`} value={f.officerId || ""} disabled={busy === f.id} onChange={e => assign(f.id, e.target.value)}>
            <option value="">Select an officer account</option>
            {assignments.data.officers.filter(o => !o.fpoId || o.fpoId === f.fpoId || o.id === f.officerId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select> : assignments.data.officers.find(o => o.id === f.officerId)?.name || "Not assigned"}
        </td></tr>)}
      </tbody></table></div>}
      {assignments.data?.canAssign && <p className="note">If the officer is missing, create their separate operations account from the login page first. Assignment is managed from the AgriLink operations desk.</p>}
      <Link to="/contracts">Open agreements &amp; witness requests →</Link>
    </section>
    {farmers.loading && !farmers.data && <Loading />}
    <ErrorBox error={farmers.error} />
    {farmers.data && <div className="card">
      <h3>Assigned farmers <span className="note">({farmers.data.length})</span></h3>
      {farmers.data.length ? <div className="tableWrap"><table>
        <thead><tr><th>Farmer</th><th>Location</th><th>Active advice</th><th>Needs attention</th><th>Profile</th></tr></thead>
        <tbody>{farmers.data.map(f => <tr key={f.id}>
          <td><Link to={`/ops/agronomist/farmers/${f.id}`}><b>{f.name}</b></Link></td>
          <td>{[f.village, f.district].filter(Boolean).join(", ") || "—"}</td><td>{f.active ?? 0}</td>
          <td>{f.high ? <span className="pill p-bad">{f.high} urgent</span> : "No urgent advice"}</td>
          <td><Link to={`/ops/agronomist/farmers/${f.id}`}>View farmer →</Link></td>
        </tr>)}</tbody>
      </table></div> : <p className="note">No farmers are assigned to this desk yet. Check the desk selected in the header.</p>}
    </div>}
  </>;
}
