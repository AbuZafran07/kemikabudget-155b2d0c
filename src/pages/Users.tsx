import { useState } from "react";
import {
  Search,
  UserPlus,
  Edit2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
  MoreVertical,
  Check,
  X,
  Building2,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUsers, UserWithRole } from "@/hooks/useUsers";
import { AppRole } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

const Users = () => {
  const { users, divisions, isLoading, updateUser, updateUserRole, toggleUserActive, deleteUser, createUser, refetch } = useUsers();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { canManageUsers, canEdit, canDelete } = usePermissions();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  
  // Edit dialog state
  const [editUser, setEditUser] = useState<UserWithRole | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Create dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createDivisionId, setCreateDivisionId] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState<AppRole>("user");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Edit form state
  const [editFullName, setEditFullName] = useState("");
  const [editDivisionId, setEditDivisionId] = useState<string>("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<AppRole>("user");
  const [editIsActive, setEditIsActive] = useState(true);

  const roleConfig: Record<AppRole, { label: string; icon: React.ElementType; color: string }> = {
    super_admin: { label: t('role.superAdmin'), icon: ShieldAlert, color: "text-destructive" },
    finance: { label: t('role.finance'), icon: ShieldCheck, color: "text-info" },
    admin: { label: t('role.admin'), icon: Shield, color: "text-warning" },
    user: { label: t('role.user'), icon: UserIcon, color: "text-muted-foreground" },
  };

  const filteredUsers = users?.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesDivision = divisionFilter === "all" || user.division_id === divisionFilter;
    return matchesSearch && matchesRole && matchesDivision;
  }) || [];

  const handleEditUser = (user: UserWithRole) => {
    setEditUser(user);
    setEditFullName(user.full_name);
    setEditDivisionId(user.division_id || "");
    setEditPhone(user.phone || "");
    setEditRole(user.role || "user");
    setEditIsActive(user.is_active);
    setIsEditDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;

    // Update profile
    await updateUser.mutateAsync({
      userId: editUser.id,
      fullName: editFullName,
      divisionId: editDivisionId || null,
      phone: editPhone || null,
      isActive: editIsActive,
    });

    // Update role if changed
    if (editRole !== editUser.role) {
      await updateUserRole.mutateAsync({
        userId: editUser.id,
        newRole: editRole,
      });
    }

    setIsEditDialogOpen(false);
    setEditUser(null);
  };

  const handleToggleActive = async (user: UserWithRole) => {
    await toggleUserActive.mutateAsync({
      userId: user.id,
      isActive: !user.is_active,
    });
  };

  const handleDeleteUser = (user: UserWithRole) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    await deleteUser.mutateAsync({ userId: userToDelete.id });
    setIsDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleResetPassword = async (user: UserWithRole) => {
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/settings`,
      });

      if (error) throw error;

      toast({
        title: t('users.resetPasswordSuccess'),
        description: `Email dikirim ke ${user.email}`,
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('users.resetPasswordError'),
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createEmail || !createFullName || !createDivisionId || !createPassword) return;
    
    // Validate password strength
    if (createPassword.length < 8) {
      toast({
        title: language === 'id' ? 'Password Lemah' : 'Weak Password',
        description: language === 'id' ? 'Password minimal 8 karakter' : 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: createEmail,
          password: createPassword,
          fullName: createFullName,
          divisionId: createDivisionId,
          phone: createPhone || undefined,
          role: createRole,
        },
      });

      if (response.error) throw response.error;
      
      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      toast({
        title: language === 'id' ? 'Berhasil' : 'Success',
        description: language === 'id' ? 'Pengguna berhasil dibuat' : 'User created successfully',
      });

      // Reset form
      setCreateEmail("");
      setCreatePassword("");
      setCreateFullName("");
      setCreateDivisionId("");
      setCreatePhone("");
      setCreateRole("user");
      setIsCreateDialogOpen(false);
      
      // Refetch users list
      refetch();
      
    } catch (error: any) {
      toast({
        title: language === 'id' ? 'Gagal' : 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{t('users.title')}</h1>
            <Badge className="bg-primary text-primary-foreground">
              {users?.length || 0}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t('users.description')}
          </p>
        </div>
        {canManageUsers() && (
          <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {t('users.addUser')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('users.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('users.allRoles')}</SelectItem>
              <SelectItem value="super_admin">{t('role.superAdmin')}</SelectItem>
              <SelectItem value="finance">{t('role.finance')}</SelectItem>
              <SelectItem value="admin">{t('role.admin')}</SelectItem>
              <SelectItem value="user">{t('role.user')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('users.division')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('users.allDivisions')}</SelectItem>
              {divisions?.map((div) => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User Cards */}
      <div className="grid gap-4">
        {filteredUsers.map((user) => {
          const roleInfo = user.role ? roleConfig[user.role] : roleConfig.user;
          const RoleIcon = roleInfo.icon;

          return (
            <div
              key={user.id}
              className={`bg-card rounded-xl border p-5 transition-all hover:shadow-card-hover ${
                !user.is_active ? "opacity-60 border-muted" : "border-border"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Avatar & Info */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-semibold text-primary">
                      {user.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {user.full_name}
                      </h3>
                      {!user.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          {t('users.inactive')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </p>
                    {user.phone && (
                      <p className="text-xs text-muted-foreground">{user.phone}</p>
                    )}
                  </div>
                </div>

                {/* Role & Division */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <RoleIcon className={`h-4 w-4 ${roleInfo.color}`} />
                    <span className="text-sm font-medium">{roleInfo.label}</span>
                  </div>
                  {user.division && (
                    <Badge variant="outline" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {user.division.code}
                    </Badge>
                  )}
                </div>

                {/* Actions - only show for super_admin */}
                {canManageUsers() && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditUser(user)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        {t('users.editUser')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleResetPassword(user)}
                        disabled={isResettingPassword}
                      >
                        <KeyRound className="h-4 w-4 mr-2" />
                        {t('users.resetPassword')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                        {user.is_active ? (
                          <>
                            <X className="h-4 w-4 mr-2" />
                            {t('users.deactivate')}
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            {t('users.activate')}
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => handleDeleteUser(user)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('action.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredUsers.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <UserIcon className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t('users.noUsers')}
          </h3>
          <p className="text-muted-foreground">
            {t('users.noUsersDesc')}
          </p>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('users.addUser')}</DialogTitle>
            <DialogDescription>
              {language === 'id' ? 'Tambah pengguna baru ke sistem' : 'Add a new user to the system'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="createEmail">{t('users.email')} *</Label>
              <Input
                id="createEmail"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="createPassword">Password *</Label>
              <div className="relative">
                <Input
                  id="createPassword"
                  type={showPassword ? "text" : "password"}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder={language === 'id' ? 'Minimal 8 karakter' : 'Minimum 8 characters'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {createPassword && createPassword.length < 8 && (
                <p className="text-xs text-destructive">
                  {language === 'id' ? 'Password minimal 8 karakter' : 'Password must be at least 8 characters'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="createFullName">{t('users.fullName')} *</Label>
              <Input
                id="createFullName"
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="createDivision">{t('users.division')} *</Label>
              <Select value={createDivisionId} onValueChange={setCreateDivisionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.selectDivision')} />
                </SelectTrigger>
                <SelectContent>
                  {divisions?.map((div) => (
                    <SelectItem key={div.id} value={div.id}>
                      {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="createPhone">{t('users.phone')}</Label>
              <Input
                id="createPhone"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="+62..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="createRole">{t('users.role')} *</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">{t('role.superAdmin')}</SelectItem>
                  <SelectItem value="finance">{t('role.finance')}</SelectItem>
                  <SelectItem value="admin">{t('role.admin')}</SelectItem>
                  <SelectItem value="user">{t('role.user')}</SelectItem>
                </SelectContent>
              </Select>
              {createRole === "super_admin" && (
                <p className="text-xs text-warning">
                  {t('users.otpWarning')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={isCreatingUser || !createEmail || !createFullName || !createDivisionId || !createPassword || createPassword.length < 8}
            >
              {isCreatingUser ? t('common.loading') : t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('users.editUser')}</DialogTitle>
            <DialogDescription>
              {language === 'id' ? 'Perbarui informasi pengguna dan hak akses' : 'Update user information and access rights'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('users.fullName')}</Label>
              <Input
                id="fullName"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="division">{t('users.division')}</Label>
              <Select value={editDivisionId} onValueChange={setEditDivisionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.selectDivision')} />
                </SelectTrigger>
                <SelectContent>
                  {divisions?.map((div) => (
                    <SelectItem key={div.id} value={div.id}>
                      {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('users.phone')}</Label>
              <Input
                id="phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+62..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">{t('users.role')}</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">{t('role.superAdmin')}</SelectItem>
                  <SelectItem value="finance">{t('role.finance')}</SelectItem>
                  <SelectItem value="admin">{t('role.admin')}</SelectItem>
                  <SelectItem value="user">{t('role.user')}</SelectItem>
                </SelectContent>
              </Select>
              {editRole === "super_admin" && (
                <p className="text-xs text-warning">
                  {t('users.otpWarning')}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">{t('users.status')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('users.statusDesc')}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={handleSaveUser}
              disabled={updateUser.isPending || updateUserRole.isPending}
            >
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Hapus Pengguna' : 'Delete User'}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? `Apakah Anda yakin ingin menghapus ${userToDelete?.full_name}? Tindakan ini tidak dapat dibatalkan.`
                : `Are you sure you want to delete ${userToDelete?.full_name}? This action cannot be undone.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? t('common.loading') : t('action.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;