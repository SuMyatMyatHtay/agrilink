import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { Shell } from "../Layout.jsx";

/** Agreements are ordinary pages inside the same role-specific AgriLink shell. */
export default function TrustShell() {
  const { user } = useAuth();
  return <Shell role={user.role}>
    <div className="agreement-pages">
      <nav className="agreement-nav" aria-label="Agreement tools">
        <NavLink to="/contracts" end>Agreements</NavLink>
        <NavLink to="/contracts/verify">Verify a document</NavLink>
        <NavLink to="/contracts/network">Blockchain status</NavLink>
      </nav>
      <Outlet />
    </div>
  </Shell>;
}
