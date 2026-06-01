import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showToast } from '@/hooks/useToast';
import { Trash2, UserPlus, ArrowLeft } from 'lucide-react';

interface UsersPanelProps {
  onBack: () => void;
}

export default function UsersPanel({ onBack }: UsersPanelProps) {
  const queryClient = useQueryClient();
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Get active session
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
  });

  // Get user list
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: api.getUsers,
  });

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: ({ username, password }: any) => api.createUser(username, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User created successfully');
      setNewUsername('');
      setNewPassword('');
      setAddingUser(false);
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to create user');
    },
  });

  // Set Role Mutation
  const setRoleMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: number; isAdmin: boolean }) => api.setUserRole(id, isAdmin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User role updated');
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to update user role');
      refetch(); // Rollback local UI switch state
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User deleted successfully');
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to delete user');
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUsername.trim();
    if (!trimmed || !newPassword) {
      showToast('Please enter both username and password.');
      return;
    }
    createUserMutation.mutate({ username: trimmed, password: newPassword });
  };

  const handleToggleAdmin = (id: number, currentVal: boolean) => {
    setRoleMutation.mutate({ id, isAdmin: !currentVal });
  };

  const handleDeleteUser = (id: number, username: string) => {
    if (session?.user?.id === id) {
      showToast('Cannot delete yourself.');
      return;
    }
    const confirmed = window.confirm(`Are you sure you want to delete user "${username}"?`);
    if (confirmed) {
      deleteUserMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground text-left">User Management</h2>
      </div>

      {/* Add User Section */}
      {!addingUser ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-border text-foreground hover:bg-muted"
          onClick={() => setAddingUser(true)}
        >
          <UserPlus className="h-4 w-4 mr-2 text-primary" />
          Add new user
        </Button>
      ) : (
        <form onSubmit={handleCreateUser} className="bg-secondary/20 border border-border p-3 rounded-lg space-y-3 text-left">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Add User</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="new-username" className="text-xs text-foreground">Username</Label>
              <Input
                id="new-username"
                type="text"
                className="h-8 bg-secondary border-border text-xs"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-pass" className="text-xs text-foreground">Password</Label>
              <Input
                id="new-pass"
                type="password"
                className="h-8 bg-secondary border-border text-xs"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAddingUser(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={createUserMutation.isPending}
            >
              Create
            </Button>
          </div>
        </form>
      )}

      {/* Users List Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-secondary/10">
        <ScrollArea className="h-48">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No users registered</div>
          ) : (
            <div className="divide-y divide-border/60">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between p-3 text-left">
                  <div className="space-y-0.5 max-w-[60%]">
                    <div className="text-sm font-semibold truncate text-foreground" title={u.username}>
                      {u.username}
                      {session?.user?.id === u.id && (
                        <span className="ml-1.5 text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">
                      ID: {u.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`role-${u.id}`} className="text-[10px] text-muted-foreground uppercase font-bold cursor-pointer">
                        Admin
                      </Label>
                      <Switch
                        id={`role-${u.id}`}
                        checked={u.isAdmin}
                        onCheckedChange={() => handleToggleAdmin(u.id, u.isAdmin)}
                        disabled={session?.user?.id === u.id || setRoleMutation.isPending}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      disabled={session?.user?.id === u.id || deleteUserMutation.isPending}
                      aria-label={`Delete user ${u.username}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
