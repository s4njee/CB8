import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { showToast } from '@/hooks/useToast';
import { Upload, FolderPlus, Settings, Users, LogIn, LogOut } from 'lucide-react';
import type { AdminPanel } from './adminPanelHelpers';

interface AdminMenuProps {
  onNavigate: (panel: AdminPanel) => void;
  onClose: () => void;
}

export default function AdminMenu({ onNavigate, onClose }: AdminMenuProps) {
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 30_000,
  });

  const isAuthenticated = session?.authenticated ?? false;
  const isAdmin = session?.user?.isAdmin ?? false;

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      void invalidateLibraryQueries(queryClient);
      showToast('Signed out successfully');
      onClose();
    },
    onError: (err) => {
      showToast(errorMessage(err, 'Failed to sign out'));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        {isAuthenticated ? (
          <>
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 text-foreground border-border hover:bg-muted"
                  onClick={() => onNavigate('upload')}
                >
                  <Upload className="h-5 w-5 text-primary" />
                  <span>Upload comics</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 text-foreground border-border hover:bg-muted"
                  onClick={() => onNavigate('add-path')}
                >
                  <FolderPlus className="h-5 w-5 text-primary" />
                  <span>Add from server path</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 text-foreground border-border hover:bg-muted"
                  onClick={() => onNavigate('users')}
                >
                  <Users className="h-5 w-5 text-primary" />
                  <span>User Management</span>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-11 text-foreground border-border hover:bg-muted"
              onClick={() => onNavigate('settings')}
            >
              <Settings className="h-5 w-5 text-primary" />
              <span>Settings</span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-11 text-destructive hover:text-destructive border-border hover:bg-destructive/10"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-foreground border-border hover:bg-muted"
            onClick={() => onNavigate('login')}
          >
            <LogIn className="h-5 w-5 text-primary" />
            <span>Log in</span>
          </Button>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
