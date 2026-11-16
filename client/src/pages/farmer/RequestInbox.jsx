import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useRealtime } from "../../context/RealtimeContext.jsx";
import Icon from "../../components/Icon.jsx";
import "./requests.css";

export default function RequestInbox() {
  const requests = useApi("/requirements?open=true", { refreshMs: 15000, live: ["requirements", "bonds"] });
  const { unseenRequestIds = [] } = useRealtime();
  const unseen = new Set(unseenRequestIds);
  const count = (requests.data || []).filter((r) => unseen.has(r._id)).length;
  if (!count) return null;
  return <aside className="request-banner" role="status" aria-live="polite">
    <span className="request-banner-icon"><Icon name="bell" size={20} /></span>
    <div><strong>{count} new buyer request{count === 1 ? "" : "s"}</strong><p>You have requests you have not viewed yet.</p></div>
    <Link to="/farmer/offers">View all requests <span aria-hidden="true">&rarr;</span></Link>
  </aside>;
}
