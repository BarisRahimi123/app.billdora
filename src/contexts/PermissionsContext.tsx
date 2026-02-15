import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export type ModulePermission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

export type Permissions = {
  projects: ModulePermission;
  time: ModulePermission;
  invoicing: ModulePermission;
  quotes: ModulePermission;
  clients: ModulePermission;
  team: ModulePermission;
  settings: ModulePermission;
  approvals: { view: boolean; approve: boolean };
  canViewFinancials: boolean;
  canViewAllProjects: boolean;
};

const defaultPermissions: Permissions = {
  projects: { view: false, create: false, edit: false, delete: false },
  time: { view: false, create: false, edit: false, delete: false },
  invoicing: { view: false, create: false, edit: false, delete: false },
  quotes: { view: false, create: false, edit: false, delete: false },
  clients: { view: false, create: false, edit: false, delete: false },
  team: { view: false, create: false, edit: false, delete: false },
  settings: { view: false, create: false, edit: false, delete: false },
  approvals: { view: false, approve: false },
  canViewFinancials: false,
  canViewAllProjects: false,
};

// Admin gets all permissions
const adminPermissions: Permissions = {
  projects: { view: true, create: true, edit: true, delete: true },
  time: { view: true, create: true, edit: true, delete: true },
  invoicing: { view: true, create: true, edit: true, delete: true },
  quotes: { view: true, create: true, edit: true, delete: true },
  clients: { view: true, create: true, edit: true, delete: true },
  team: { view: true, create: true, edit: true, delete: true },
  settings: { view: true, create: true, edit: true, delete: true },
  approvals: { view: true, approve: true },
  canViewFinancials: true,
  canViewAllProjects: true,
};

interface PermissionsContextType {
  permissions: Permissions;
  loading: boolean;
  isAdmin: boolean;
  canViewFinancials: boolean;
  canViewAllProjects: boolean;
  canApprove: boolean;
  canView: (module: keyof Permissions) => boolean;
  canCreate: (module: keyof Permissions) => boolean;
  canEdit: (module: keyof Permissions) => boolean;
  canDelete: (module: keyof Permissions) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadPermissions = async () => {
    if (!profile?.company_id || !profile?.id) {
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }

    try {
      // Check if user has admin role string (from signup)
      if (profile.role === 'admin') {
        setPermissions(adminPermissions);
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      // Resolve role_id: use profile's role_id, or fetch fresh from DB if cached profile is stale
      let roleId = profile.role_id;
      if (!roleId) {
        // Cached profile may be stale and missing role_id -- fetch directly from DB
        const { data: freshProfile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', profile.id)
          .single();
        if (freshProfile?.role_id) {
          roleId = freshProfile.role_id;
          console.log('[Permissions] Fetched fresh role_id from DB:', roleId, 'for', profile.email);
        }
      }

      // Get user's role from roles table
      if (roleId) {
        const { data: roleData, error } = await supabase
          .from('roles')
          .select('*')
          .eq('id', roleId)
          .single();

        if (!error && roleData) {
          const rolePermissions = roleData.permissions as Permissions || defaultPermissions;
          setPermissions(rolePermissions);
          setIsAdmin(roleData.name === 'Admin');
          setLoading(false);
          return;
        }
        console.warn('[Permissions] Failed to load role:', error?.message, 'roleId:', roleId);
      }

      // Fallback: check if user is only user in company (make them admin)
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id);
      
      if (count === 1) {
        setPermissions(adminPermissions);
        setIsAdmin(true);
      } else {
        setPermissions(defaultPermissions);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('[Permissions] Failed to load permissions:', error);
      setPermissions(defaultPermissions);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPermissions();
  }, [profile?.id, profile?.role_id, profile?.company_id]);

  const canView = (module: keyof Permissions) => isAdmin || (permissions[module] as ModulePermission)?.view === true;
  const canCreate = (module: keyof Permissions) => isAdmin || (permissions[module] as ModulePermission)?.create === true;
  const canEdit = (module: keyof Permissions) => isAdmin || (permissions[module] as ModulePermission)?.edit === true;
  const canDelete = (module: keyof Permissions) => isAdmin || (permissions[module] as ModulePermission)?.delete === true;
  const canViewFinancialsValue = isAdmin || permissions.canViewFinancials === true;
  const canViewAllProjectsValue = isAdmin || permissions.canViewAllProjects === true;
  const canApproveValue = isAdmin || permissions.approvals?.approve === true;

  return (
    <PermissionsContext.Provider value={{
      permissions,
      loading,
      isAdmin,
      canViewFinancials: canViewFinancialsValue,
      canViewAllProjects: canViewAllProjectsValue,
      canApprove: canApproveValue,
      canView,
      canCreate,
      canEdit,
      canDelete,
      refreshPermissions: loadPermissions,
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
