// Utility functions for handling permissions and roles

export type Role = 'employee' | 'supervisor' | 'admin';

export interface Permission {
  resource: string;
  actions: string[];
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  employee: [
    { resource: 'attendance', actions: ['read', 'create'] },
    { resource: 'leave', actions: ['read', 'create'] },
    { resource: 'reports', actions: ['read'] },
  ],
  supervisor: [
    { resource: 'attendance', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'leave', actions: ['read', 'create', 'update'] },
    { resource: 'reports', actions: ['read', 'create'] },
    { resource: 'team', actions: ['read'] },
    { resource: 'supervisor-dashboard', actions: ['read'] },
  ],
  admin: [
    { resource: 'attendance', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'leave', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'reports', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'team', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'supervisor-dashboard', actions: ['read'] },
    { resource: 'security-dashboard', actions: ['read'] },
    { resource: 'admin', actions: ['read', 'create', 'update', 'delete'] },
  ],
};

export const hasPermission = (
  userRole: Role,
  resource: string,
  action: string
): boolean => {
  const permissions = ROLE_PERMISSIONS[userRole];
  
  if (!permissions) {
    return false;
  }
  
  const resourcePermission = permissions.find(p => p.resource === resource);
  
  if (!resourcePermission) {
    return false;
  }
  
  return resourcePermission.actions.includes(action);
};

export const hasAnyPermission = (
  userRole: Role,
  resource: string,
  actions: string[]
): boolean => {
  return actions.some(action => hasPermission(userRole, resource, action));
};

export const canAccessRoute = (
  userRole: Role,
  route: string
): boolean => {
  const routePermissions: Record<string, { resource: string; action: string }> = {
    '/dashboard': { resource: 'attendance', action: 'read' },
    '/attendance': { resource: 'attendance', action: 'read' },
    '/leave': { resource: 'leave', action: 'read' },
    '/reports': { resource: 'reports', action: 'read' },
    '/supervisor': { resource: 'supervisor-dashboard', action: 'read' },
    '/security': { resource: 'security-dashboard', action: 'read' },
  };
  
  const permission = routePermissions[route];
  
  if (!permission) {
    return false;
  }
  
  return hasPermission(userRole, permission.resource, permission.action);
};

export const getAccessibleRoutes = (userRole: Role): string[] => {
  const allRoutes = ['/dashboard', '/attendance', '/leave', '/reports', '/supervisor', '/security'];
  
  return allRoutes.filter(route => canAccessRoute(userRole, route));
};