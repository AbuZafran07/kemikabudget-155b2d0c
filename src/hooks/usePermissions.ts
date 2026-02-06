import { useAuth, AppRole } from '@/contexts/AuthContext';

/**
 * Hook for checking user permissions for edit/delete operations.
 * 
 * PERMISSION RULES:
 * - super_admin: Full access (view, create, edit, delete, approve)
 * - finance: Can view, create, pay, settle (no approve, limited edit/delete)
 * - admin: Can view ALL menus, can APPROVE, but CANNOT edit or delete
 * - user: Can view own division, create own requests (no edit/delete others)
 */
export function usePermissions() {
  const { role, hasRoleExact } = useAuth();

  /**
   * Check if user can edit records (admin CANNOT edit)
   */
  const canEdit = (): boolean => {
    if (!role) return false;
    // Admin can view and approve but NOT edit
    if (hasRoleExact('admin')) return false;
    // super_admin, finance can edit
    return role === 'super_admin' || role === 'finance';
  };

  /**
   * Check if user can delete records (admin CANNOT delete)
   */
  const canDelete = (): boolean => {
    if (!role) return false;
    // Admin cannot delete
    if (hasRoleExact('admin')) return false;
    // Only super_admin can delete
    return role === 'super_admin';
  };

  /**
   * Check if user can create new records
   */
  const canCreate = (): boolean => {
    if (!role) return false;
    // All authenticated users can create (their own requests, etc.)
    return true;
  };

  /**
   * Check if user can approve requests
   * Now includes admin role
   */
  const canApprove = (): boolean => {
    if (!role) return false;
    return role === 'super_admin' || role === 'admin';
  };

  /**
   * Check if user can process payments
   */
  const canPay = (): boolean => {
    if (!role) return false;
    return role === 'super_admin' || role === 'finance';
  };

  /**
   * Check if user can manage users (create, edit roles, etc.)
   * Admin can VIEW users but NOT modify
   */
  const canManageUsers = (): boolean => {
    if (!role) return false;
    // Admin can view but not modify
    if (hasRoleExact('admin')) return false;
    return role === 'super_admin';
  };

  /**
   * Check if user can manage master data (divisions, categories, etc.)
   * Admin can VIEW but NOT edit/delete
   */
  const canManageMasterData = (): boolean => {
    if (!role) return false;
    if (hasRoleExact('admin')) return false;
    return role === 'super_admin';
  };

  return {
    canEdit,
    canDelete,
    canCreate,
    canApprove,
    canPay,
    canManageUsers,
    canManageMasterData,
    // Expose role for conditional rendering
    role,
    isAdmin: hasRoleExact('admin'),
    isSuperAdmin: hasRoleExact('super_admin'),
    isFinance: hasRoleExact('finance'),
  };
}
