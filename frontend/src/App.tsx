import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Radio,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { NAV_ITEMS, canAccessPath } from './navigation';
import { LoginPage } from './pages/LoginPage';

export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading)
    return (
      <div className="page-loading">
        <span className="spinner" />
        Checking your session…
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!canAccessPath(user, location.pathname)) return <Navigate to="/" replace />;
  return <AppShell />;
}

export function LoginRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return (
      <div className="page-loading">
        <span className="spinner" />
        Loading…
      </div>
    );
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

const iconMap = {
  overview: LayoutDashboard,
  citizens: Users,
  studio: Radio,
  sessions: MessagesSquare,
  campaigns: Activity,
  complaints: ClipboardList,
  reports: FileBarChart2,
  settings: Settings2,
} as const;

function AppShell() {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const title = NAV_ITEMS.find(({ path }) => isActive(path))?.label ?? 'Overview';
  if (!user) return null;

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Building2 size={20} />
          </span>
          <span>
            Nagar<span className="brand-light">Seva</span>
            <small>Municipal services</small>
          </span>
          <button
            className="sidebar-close icon-button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="org-switcher">
          <span className="org-icon">
            <Building2 size={16} />
          </span>
          <span>
            <small>WORKSPACE</small>
            <strong>{user.organizationName}</strong>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-heading">MENU</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.filter((item) => user.permissions.includes(item.permission)).map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={isActive(item.path) ? 'nav-link active' : 'nav-link'}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {!item.ready && <span className="nav-soon">Soon</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note">
            <ShieldCheck size={17} />
            <span>
              Secure workspace
              <br />
              <small>Your access is role-based</small>
            </span>
          </div>
          <button className="nav-link signout" onClick={() => void signOut()}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-divider">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment-pill">
              <i /> Local environment
            </span>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="user-menu">
              <div className="avatar">
                {user.name
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <span className="user-menu-copy">
                <strong>{user.name}</strong>
                <small>{user.role}</small>
              </span>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>© 2026 NagarSeva</span>
          <span>Local simulation workspace</span>
        </footer>
      </div>
    </div>
  );
}
