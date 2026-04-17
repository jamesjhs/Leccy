import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../App';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/data-entry', label: 'Data Entry' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/tariff', label: 'Tariff' },
  { to: '/analytics', label: 'Analytics' },
];

export default function NavBar() {
  const { user, isAdmin, logout } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const allLinks = isAdmin ? [...navLinks, { to: '/admin', label: 'Admin' }] : navLinks;

  const displayName = user?.display_name || user?.email || '';

  return (
    <nav className="bg-green-800 text-white shadow-md">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span>⚡</span>
            <span>Leccy</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {allLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-green-600 text-white'
                    : 'text-green-100 hover:bg-green-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* User info + account + logout (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/account"
              className={`text-sm truncate max-w-[160px] transition-colors ${
                location.pathname === '/account' ? 'text-white font-semibold' : 'text-green-200 hover:text-white'
              }`}
              title={displayName}
            >
              {displayName}
            </Link>
            <button
              onClick={handleLogout}
              className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Hamburger (mobile) */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 rounded hover:bg-green-700 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-3 border-t border-green-700 mt-1">
            <div className="flex flex-col gap-1 pt-2">
              {allLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'bg-green-600 text-white'
                      : 'text-green-100 hover:bg-green-700'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/account"
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/account'
                    ? 'bg-green-600 text-white'
                    : 'text-green-100 hover:bg-green-700'
                }`}
              >
                Account Settings
              </Link>
              <div className="flex items-center justify-between px-3 pt-2 border-t border-green-700 mt-1">
                <span className="text-green-200 text-sm truncate max-w-[160px]" title={displayName}>{displayName}</span>
                <button
                  onClick={handleLogout}
                  className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
