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
  settings: ModulePermission;
  approvals: { view: boolean; approve: boolean };
  canViewFinancials: boolean;
};

const defaultPermissions: Permissions = {
  projects: { view: false, create: false, edit: false, delete: false },
  time: { view: false, create: false, edit: false, delete: false },
  invoicing: { view: false, create: false, edit: false, delete: false },
  quotes: { view: false, create: false, edit: false, delete: false },
  settings: { view: false, create: false, edit: false, delete: false },
  approvals: { view: false, approve: false },
  canViewFinancials: false,
};

// Admin gets all permissions
const adminPermissions: Permissions = {
  projects: { view: true, create: true, edit: true, delete: true },
  time: { view: true, create: true, edit: true, delete: true },
  invoicing: { view: true, create: true, edit: true, delete: true },
  quotes: { view: true, create: true, edit: true, delete: true },
  settings: { view: true, create: true, edit: true, delete: true },
  approvals: { view: true, approve: true },
  canViewFinancials: true,
};

interface PermissionsContextType {
  permissions: Permissions;
  loading: boolean;
  isAdmin: boolean;
  canViewFinancials: boolean;
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

      // Get user's role from roles table
      if (profile.role_id) {
        const { data: roleData, error } = await supabase
          .from('roles')
          .select('*')
          .eq('id', profile.role_id)
          .single();

        if (!error && roleData) {
          const rolePermissions = roleData.permissions as Permissions || defaultPermissions;
          setPermissions(rolePermissions);
          setIsAdmin(roleData.name === 'Admin');
          setLoading(false);
          return;
        }
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
      console.error('Failed to load permissions:', error);
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
  const canApproveValue = isAdmin || permissions.approvals?.approve === true;

  return (
    <PermissionsContext.Provider value={{
      permissions,
      loading,
      isAdmin,
      canViewFinancials: canViewFinancialsValue,
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
