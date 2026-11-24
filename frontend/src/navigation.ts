import type { AuthUser } from './auth/types';

export const NAV_ITEMS = [
  { path: '/', label: 'Overview', permission: 'dashboard:read', icon: 'overview', ready: true },
  {
    path: '/citizens',
    label: 'Citizens',
    permission: 'citizens:read',
    icon: 'citizens',
    ready: true,
  },
  {
    path: '/studio',
    label: 'AI call studio',
    permission: 'sessions:run',
    icon: 'studio',
    ready: true,
  },
  {
    path: '/sessions',
    label: 'Sessions',
    permission: 'sessions:read',
    icon: 'sessions',
    ready: true,
  },
  {
    path: '/campaigns',
    label: 'Campaigns',
    permission: 'campaigns:manage',
    icon: 'campaigns',
    ready: true,
  },
  {
    path: '/complaints',
    label: 'Complaints',
    permission: 'complaints:read',
    icon: 'complaints',
    ready: true,
  },
  { path: '/reports', label: 'Reports', permission: 'reports:read', icon: 'reports', ready: true },
  {
    path: '/settings',
    label: 'AI settings',
    permission: 'settings:manage',
    icon: 'settings',
    ready: false,
  },
] as const;

/** Finds the nav section a path belongs to, so detail pages like /complaints/12 inherit its permission. */
export function findNavItem(path: string) {
  return NAV_ITEMS.find(
    (entry) => entry.path === path || (entry.path !== '/' && path.startsWith(`${entry.path}/`)),
  );
}

export function canAccessPath(user: AuthUser, path: string): boolean {
  const item = findNavItem(path);
  return item ? user.permissions.includes(item.permission) : path === '/';
}
