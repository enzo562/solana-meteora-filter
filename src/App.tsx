import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import FilterPage from "./pages/FilterPage";
import PoolsPage from "./pages/PoolsPage";
import GeckoTerminalPage from "./pages/GeckoTerminalPage";
import DexScreenerPage from "./pages/DexScreenerPage";
import SolanaTrackerPage from "./pages/SolanaTrackerPage";

function Nav() {
  const location = useLocation();

  const linkStyle = (path: string): React.CSSProperties => ({
    marginRight: "1rem",
    fontWeight: location.pathname === path ? "bold" : "normal",
    textDecoration: location.pathname === path ? "underline" : "none",
  });

  return (
      <nav style={{ padding: "1rem", borderBottom: "1px solid #ccc", fontFamily: "monospace" }}>
        <Link to="/filter" style={linkStyle("/filter")}>Filtrage Tokens (Birdeye)</Link>
        <Link to="/gecko" style={linkStyle("/gecko")}>GeckoTerminal</Link>
        <Link to="/dexscreener" style={linkStyle("/dexscreener")}>DexScreener</Link>
        <Link to="/solanatracker" style={linkStyle("/solanatracker")}>Solana Tracker</Link>
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
          <Route path="/gecko" element={<GeckoTerminalPage />} />
          <Route path="/dexscreener" element={<DexScreenerPage />} />
          <Route path="/solanatracker" element={<SolanaTrackerPage />} />
          <Route path="/pools" element={<PoolsPage />} />
        </Routes>
      </BrowserRouter>
  );
}