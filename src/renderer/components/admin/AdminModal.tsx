import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showToast } from '@/hooks/useToast';
import AdminMenu from './AdminMenu';
import LoginPanel from './LoginPanel';
import SignupPanel from './SignupPanel';
import ForgotPasswordPanel from './ForgotPasswordPanel';
import ResetPasswordPanel from './ResetPasswordPanel';
import AddPathPanel from './AddPathPanel';
import UploadPanel from './UploadPanel';
import UsersPanel from './UsersPanel';
import SettingsPanel from './SettingsPanel';

interface AdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPanel: string | null;
  droppedFiles?: { file: File; relPath: string }[];
}

export default function AdminModal({ open, onOpenChange, initialPanel, droppedFiles }: AdminModalProps) {
  const [activePanel, setActivePanel] = useState<string>('menu');

  // Verify auth session
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 30_000,
  });

  const isAuthenticated = session?.authenticated ?? false;

  // Sync with initialPanel when dialog opens
  useEffect(() => {
    if (open && initialPanel) {
      // If user requests a protected panel but is not authenticated, redirect to login
      const protectedPanels = [
        'upload',
        'add-path',
        'settings',
        'users',
        'create-collection',
        'create-folder',
      ];
      if (protectedPanels.includes(initialPanel) && !isAuthenticated) {
        setActivePanel('login');
      } else {
        setActivePanel(initialPanel);
      }
    }
  }, [open, initialPanel, isAuthenticated]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const getTitle = () => {
    switch (activePanel) {
      case 'login':
        return 'Sign in';
      case 'signup':
        return 'Create account';
      case 'forgot':
        return 'Reset password';
      case 'reset':
        return 'Set a new password';
      case 'add-path':
        return 'Add from server path';
      case 'upload':
        return 'Upload comics';
      case 'users':
        return 'User Management';
      case 'settings':
        return 'Settings';
      case 'create-collection':
        return 'New collection';
      case 'create-folder':
        return 'New folder';
      default:
        return 'Admin';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm rounded-lg overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle className="text-foreground text-left">{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {activePanel === 'menu' && (
            <AdminMenu
              onNavigate={setActivePanel}
              onClose={handleClose}
            />
          )}

          {activePanel === 'login' && (
            <LoginPanel
              onNavigate={setActivePanel}
              onSuccess={() => {
                // If they came in wanting to upload or do other admin actions, redirect on success
                const protectedPanels = [
                  'upload',
                  'add-path',
                  'settings',
                  'users',
                  'create-collection',
                  'create-folder',
                ];
                if (initialPanel && protectedPanels.includes(initialPanel)) {
                  setActivePanel(initialPanel);
                } else {
                  setActivePanel('menu');
                }
              }}
              onBack={() => {
                if (initialPanel === 'login') {
                  handleClose();
                } else {
                  setActivePanel('menu');
                }
              }}
            />
          )}

          {activePanel === 'signup' && (
            <SignupPanel
              onNavigate={setActivePanel}
              onSuccess={() => setActivePanel('login')}
              onBack={() => setActivePanel('login')}
            />
          )}

          {activePanel === 'forgot' && (
            <ForgotPasswordPanel
              onNavigate={setActivePanel}
              onSuccess={() => setActivePanel('login')}
              onBack={() => setActivePanel('login')}
            />
          )}

          {activePanel === 'add-path' && (
            <AddPathPanel
              onSuccess={handleClose}
              onBack={() => setActivePanel('menu')}
            />
          )}

          {activePanel === 'upload' && (
            <UploadPanel
              initialFiles={droppedFiles}
              onSuccess={handleClose}
              onBack={() => setActivePanel('menu')}
            />
          )}

          {activePanel === 'users' && (
            <UsersPanel
              onBack={() => setActivePanel('menu')}
            />
          )}

          {activePanel === 'settings' && (
            <SettingsPanel
              onBack={() => setActivePanel('menu')}
              onClose={handleClose}
            />
          )}

          {activePanel === 'create-collection' && (
            <CreateCollectionPanel
              onSuccess={handleClose}
              onCancel={handleClose}
            />
          )}

          {activePanel === 'create-folder' && (
            <CreateFolderPanel
              onSuccess={handleClose}
              onCancel={handleClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Subcomponents for collection and folder creation
interface CreateCollectionPanelProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function CreateCollectionPanel({ onSuccess, onCancel }: CreateCollectionPanelProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [mediaType, setMediaType] = useState<'comic' | 'book'>('comic');

  const mutation = useMutation({
    mutationFn: () => api.createLibrary(name.trim(), mediaType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      showToast(`Created collection "${name.trim()}"`);
      onSuccess();
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to create collection');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <h2 className="text-xl font-bold tracking-tight text-foreground">New collection</h2>
      <div className="space-y-1">
        <Label htmlFor="col-name" className="text-foreground">Name</Label>
        <Input
          id="col-name"
          type="text"
          className="bg-secondary border-border"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-foreground">Type</Label>
        <Tabs
          value={mediaType}
          onValueChange={(val) => setMediaType(val as 'comic' | 'book')}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 bg-secondary border border-border">
            <TabsTrigger value="comic" disabled={mutation.isPending}>Comics</TabsTrigger>
            <TabsTrigger value="book" disabled={mutation.isPending}>Books</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex gap-2 pt-2 justify-between border-t border-border">
        <Button
          type="button"
          variant="outline"
          className="border-border text-foreground hover:bg-muted"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          disabled={mutation.isPending || !name.trim()}
        >
          {mutation.isPending ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

interface CreateFolderPanelProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function CreateFolderPanel({ onSuccess, onCancel }: CreateFolderPanelProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.createFolder(name.trim(), []),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      showToast(`Created folder "${name.trim()}"`);
      onSuccess();
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to create folder');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <h2 className="text-xl font-bold tracking-tight text-foreground">New folder</h2>
      <div className="space-y-1">
        <Label htmlFor="fld-name" className="text-foreground">Name</Label>
        <Input
          id="fld-name"
          type="text"
          className="bg-secondary border-border"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      <div className="flex gap-2 pt-2 justify-between border-t border-border">
        <Button
          type="button"
          variant="outline"
          className="border-border text-foreground hover:bg-muted"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          disabled={mutation.isPending || !name.trim()}
        >
          {mutation.isPending ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
