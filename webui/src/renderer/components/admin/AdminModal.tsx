import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AdminMenu from './AdminMenu';
import LoginPanel from './LoginPanel';
import ForgotPasswordPanel from './ForgotPasswordPanel';
import AddPathPanel from './AddPathPanel';
import UploadPanel from './UploadPanel';
import UsersPanel from './UsersPanel';
import SettingsPanel from './SettingsPanel';
import { CreateCollectionPanel, CreateFolderPanel } from './AdminCreatePanels';
import {
  adminPanelAfterLogin,
  adminPanelTitle,
  initialAdminPanelForRequest,
  toAdminPanel,
  type AdminPanel,
} from './adminPanelHelpers';

interface AdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPanel: string | null;
  droppedFiles?: { file: File; relPath: string }[];
}

export default function AdminModal({ open, onOpenChange, initialPanel, droppedFiles }: AdminModalProps) {
  const [activePanel, setActivePanel] = useState<AdminPanel>('menu');
  const requestedPanel = toAdminPanel(initialPanel);

  // Verify auth session
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 30_000,
  });

  const isAuthenticated = session?.authenticated ?? false;
  const isAdmin = session?.user?.isAdmin === true;

  // Sync with initialPanel when dialog opens
  useEffect(() => {
    if (open) {
      setActivePanel(initialAdminPanelForRequest(requestedPanel, isAuthenticated, isAdmin));
    }
  }, [open, requestedPanel, isAuthenticated, isAdmin]);

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm rounded-lg overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle className="text-foreground text-left">{adminPanelTitle(activePanel)}</DialogTitle>
        </DialogHeader>

        {/* min-w-0: this is a CSS grid item (DialogContent is `grid`); without it
            the track's min-content equals the widest unbreakable string (a long
            filename in the upload/add-path panels), which forces the whole modal
            past its max-width and clips it on the right. */}
        <div className="py-2 min-w-0">
          {activePanel === 'menu' && (
            <AdminMenu
              onNavigate={setActivePanel}
              onClose={handleClose}
            />
          )}

          {activePanel === 'login' && (
            <LoginPanel
              onNavigate={setActivePanel}
              onSuccess={(loggedInIsAdmin) => {
                setActivePanel(adminPanelAfterLogin(requestedPanel, loggedInIsAdmin));
              }}
              onBack={() => {
                if (requestedPanel === 'login') {
                  handleClose();
                } else {
                  setActivePanel('menu');
                }
              }}
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
