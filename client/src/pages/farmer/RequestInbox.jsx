import { Link } from "react-router-dom";
import { useRealtime } from "../../context/RealtimeContext.jsx";
import Icon from "../../components/Icon.jsx";
import "./requests.css";

export default function RequestInbox() {
  const { unseenRequestIds = [], markRequestsViewed } = useRealtime();
  const count = unseenRequestIds.length;
  if (!count) return null;
  return <aside className="request-banner" role="status" aria-live="polite">
    <span className="request-banner-icon"><Icon name="bell" size={20} /></span>
    <div><strong>{count === 1 ? "A new request has been added." : `${count} new requests have been added.`}</strong></div>
    <Link to="/farmer/offers" onClick={() => { markRequestsViewed([...unseenRequestIds]).catch(() => {}); }}>Click here to view <span aria-hidden="true">&rarr;</span></Link>
  </aside>;
}
