import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import * as hostBridge from '@/lib/hostBridge';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { useUiStore, ThemeType } from '@/store/uiStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { showToast } from '@/hooks/useToast';
import { Copy, Trash, Check, ArrowLeft } from 'lucide-react';

interface SettingsPanelProps {
  onBack: () => void;
  onClose: () => void;
}

const THEME_LIST: { id: ThemeType; label: string; color: string }[] = [
  { id: 'red', label: 'Red', color: '#ef4d4d' },
  { id: 'blue', label: 'Blue', color: '#4a9eff' },
  { id: 'green', label: 'Green', color: '#34c759' },
  { id: 'purple', label: 'Purple', color: '#a374ff' },
  { id: 'orange', label: 'Orange', color: '#f59342' },
  { id: 'teal', label: 'Teal', color: '#2dd4bf' },
];

export default function SettingsPanel({ onBack, onClose }: SettingsPanelProps) {
  const queryClient = useQueryClient();
  const { theme: activeTheme, setTheme } = useUiStore();
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
  });

  // Temporary password state
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [clearingTempPass, setClearingTempPass] = useState(false);

  // Web server settings state (Electron only)
  const isElectron = hostBridge.isElectron();
  const [wsSettings, setWsSettings] = useState<any | null>(null);
  const [wsEnabled, setWsEnabled] = useState(false);
  const [wsPort, setWsPort] = useState('8008');
  const [applyingWs, setApplyingWs] = useState(false);

  // Clear library state
  const [clearingLibrary, setClearingLibrary] = useState(false);

  const guestAccessMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setGuestAccess(enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      showToast('Guest access updated');
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to update guest access');
    },
  });

  // Fetch initial system credentials on mount
  useEffect(() => {
    api.fetchInitialCredentials()
      .then((creds) => {
        if (creds?.initial_password) {
          setTempPassword(creds.initial_password);
        }
      })
      .catch(() => {});

    // Fetch web server settings in Electron context
    if (isElectron) {
      hostBridge.getWebServerSettings()
        .then((settings) => {
          if (settings) {
            setWsSettings(settings);
            setWsEnabled(settings.enabled);
            setWsPort(String(settings.port));
          }
        })
        .catch(() => {});
    }
  }, [isElectron]);

  // Copy initial password helper
  const handleCopyPassword = () => {
    if (!tempPassword) return;
    navigator.clipboard?.writeText(tempPassword)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => {});
  };

  // Clear initial password
  const handleClearPassword = async () => {
    setClearingTempPass(true);
    try {
      await api.clearInitialCredentials();
      setTempPassword(null);
      showToast('Temporary password cleared');
    } catch (err: any) {
      showToast(err.message || 'Failed to clear temporary password');
    } finally {
      setClearingTempPass(false);
    }
  };

  // Clear library catalog zone
  const handleClearLibrary = async () => {
    const confirmation = window.prompt(
      'Type CLEAR to wipe the library catalog. Files on disk will not be deleted.'
    );
    if (confirmation !== 'CLEAR') return;

    setClearingLibrary(true);
    try {
      const response = await api.clearLibrary();
      const n = response?.removed?.comics ?? 0;
      await invalidateLibraryQueries(queryClient);
      showToast(`Library cleared (${n.toLocaleString()} item${n === 1 ? '' : 's'} removed).`);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to clear library.');
    } finally {
      setClearingLibrary(false);
    }
  };

  // Apply web server settings (Electron only)
  const handleApplyWebServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const port = parseInt(wsPort, 10);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      showToast('Port must be a number between 1024 and 65535.');
      return;
    }

    setApplyingWs(true);
    try {
      const updated = await hostBridge.setWebServerSettings(wsEnabled, port);
      if (updated) {
        setWsSettings(updated);
        setWsEnabled(updated.enabled);
        setWsPort(String(updated.port));
      }
      showToast('Web server settings applied.');
    } catch (err: any) {
      showToast(err.message || 'Failed to apply web server settings.');
    } finally {
      setApplyingWs(false);
    }
  };

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Settings</h2>
      </div>

      {/* 1. Temporary Password block */}
      {tempPassword && (
        <div className="bg-secondary/40 border border-border p-3.5 rounded-lg space-y-2">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Temporary password</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-secondary border border-border p-1.5 rounded font-mono text-sm break-all font-semibold">
              {tempPassword}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopyPassword} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleClearPassword}
              disabled={clearingTempPass}
              title="Clear"
            >
              <Trash className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-normal">
            Change your password to invalidate this.
          </p>
        </div>
      )}

      {/* 2. Theme picker swatches */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Theme color</div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`flex items-center gap-2 p-2 border rounded-lg hover:bg-muted transition text-xs font-semibold cursor-pointer text-foreground ${
                activeTheme === t.id ? 'border-primary bg-muted' : 'border-border bg-secondary/10'
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="truncate flex-1">{t.label}</span>
              {activeTheme === t.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-secondary/20 border border-border p-3.5 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="guest-access" className="text-sm text-foreground cursor-pointer select-none">
              Guest access
            </Label>
            <p className="text-[10px] text-muted-foreground leading-normal">
              Allows unauthenticated read-only browsing on the web server.
            </p>
          </div>
          <Switch
            id="guest-access"
            checked={session?.guestAccess === true}
            onCheckedChange={(checked) => guestAccessMutation.mutate(checked)}
            disabled={guestAccessMutation.isPending}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {/* 3. Electron Web Server configuration */}
      {isElectron && (
        <form onSubmit={handleApplyWebServer} className="bg-secondary/20 border border-border p-3.5 rounded-lg space-y-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Web Server Settings</div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="ws-enabled" className="text-sm text-foreground cursor-pointer select-none">
              Expose to local network
            </Label>
            <Switch
              id="ws-enabled"
              checked={wsEnabled}
              onCheckedChange={setWsEnabled}
              disabled={applyingWs}
              className="data-[state=checked]:bg-primary"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-normal mt-[-4px] ml-0.5">
            When off, the server only listens on 127.0.0.1 (this machine).
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ws-port" className="text-xs text-foreground">Port</Label>
            <Input
              id="ws-port"
              type="number"
              min="1024"
              max="65535"
              step="1"
              className="bg-secondary border-border"
              value={wsPort}
              onChange={(e) => setWsPort(e.target.value)}
              disabled={applyingWs}
              required
            />
          </div>

          {wsSettings && (
            <div className="text-[10px] font-mono text-muted-foreground leading-relaxed space-y-0.5 mt-1 border-t border-border/50 pt-2">
              {wsSettings.url && <div>Local: {wsSettings.url}</div>}
              {wsEnabled && wsSettings.lanUrl && <div>LAN: {wsSettings.lanUrl}</div>}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={applyingWs}
            >
              {applyingWs ? 'Applying...' : 'Apply'}
            </Button>
          </div>
        </form>
      )}

      {/* 4. Danger zone CLEAR WIPE */}
      <div className="bg-destructive/10 border border-destructive/20 p-3.5 rounded-lg space-y-2">
        <div className="text-xs font-bold text-destructive uppercase tracking-wider">Danger zone</div>
        <p className="text-xs text-muted-foreground leading-normal">
          Removes every comic, book, folder, collection, tag, and reading-progress record from the database. Users and sessions are kept.{' '}
          <strong>Files on disk are not deleted.</strong>
        </p>
        <Button
          type="button"
          variant="destructive"
          className="w-full font-semibold"
          onClick={handleClearLibrary}
          disabled={clearingLibrary}
        >
          {clearingLibrary ? 'Clearing catalog...' : 'Clear library'}
        </Button>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
