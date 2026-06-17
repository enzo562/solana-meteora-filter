import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import FilterPage from "./pages/FilterPage";
import PoolsPage from "./pages/PoolsPage";

function Nav() {
  const location = useLocation();

  const linkStyle = (path: string): React.CSSProperties => ({
    marginRight: "1rem",
    fontWeight: location.pathname === path ? "bold" : "normal",
    textDecoration: location.pathname === path ? "underline" : "none",
  });

  return (
      <nav style={{ padding: "1rem", borderBottom: "1px solid #ccc", fontFamily: "monospace" }}>
        <Link to="/filter" style={linkStyle("/filter")}>Filtrage Tokens</Link>
        <Link to="/pools" style={linkStyle("/pools")}>Nouvelles Pools Meteora</Link>
      </nav>
  );
}

export default function App() {
  return (
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<FilterPage />} />
          <Route path="/filter" element={<FilterPage />} />
          <Route path="/pools" element={<PoolsPage />} />
        </Routes>
      </BrowserRouter>
  );
}