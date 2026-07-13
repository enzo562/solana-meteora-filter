import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import FilterPage from "./pages/FilterPage";
import PoolsPage from "./pages/PoolsPage";
import GeckoTerminalPage from "./pages/GeckoTerminalPage";
import DexScreenerPage from "./pages/DexScreenerPage";
import SolanaTrackerPage from "./pages/SolanaTrackerPage";

const NAV_ITEMS = [
  { to: "/filter", label: "Birdeye" },
  { to: "/gecko", label: "GeckoTerminal" },
  { to: "/dexscreener", label: "DexScreener" },
  { to: "/solanatracker", label: "Solana Tracker" },
  { to: "/pools", label: "Pools Meteora" },
];

function Nav() {
  const location = useLocation();
  const isActive = (path: string) =>
    location.pathname === path || (path === "/filter" && location.pathname === "/");

  return (
      <nav className="nav">
        <span className="nav-brand"><span className="dot" />Solana Scout</span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`nav-link${isActive(item.to) ? " active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
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