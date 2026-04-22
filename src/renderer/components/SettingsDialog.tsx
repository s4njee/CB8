/**
 * SettingsDialog.tsx — Web Server settings modal for CB8.
 *
 * Opened by App.tsx when the renderer receives an 'open-settings' IPC event
 * (sent from the main process via Settings → Web Server… menu item).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getWebServerSettings,
  setWebServerSettings,
  type WebServerSettings,
} from '../ipcClient';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<Props> = ({ open, onClose }) => {
  const [settings, setSettings] = useState<WebServerSettings | null>(null);
  const [pendingEnabled, setPendingEnabled] = useState(false);
  const [pendingPort, setPendingPort] = useState(8008);
  const [portInput, setPortInput] = useState('8008');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load current settings when the dialog opens
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    getWebServerSettings().then((s) => {
      setSettings(s);
      setPendingEnabled(s.enabled);
      setPendingPort(s.port);
      setPortInput(String(s.port));
    }).catch(console.error);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap: focus the dialog when it opens
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const handlePortChange = (value: string) => {
    setPortInput(value);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1024 && n <= 65535) {
      setPendingPort(n);
    }
  };

  const handleSave = useCallback(async () => {
    const port = parseInt(portInput, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      setSaveError('Port must be a number between 1024 and 65535.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await setWebServerSettings(pendingEnabled, port);
      setSettings(updated);
      setPendingEnabled(updated.enabled);
      setPendingPort(updated.port);
      setPortInput(String(updated.port));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to apply settings.');
    } finally {
      setSaving(false);
    }
  }, [pendingEnabled, portInput]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(console.error);
  };

  if (!open) return null;

  const isDirty = settings !== null && (pendingEnabled !== settings.enabled || pendingPort !== settings.port);

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Web Server Settings"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} style={dialog} tabIndex={-1}>
        {/* Header */}
        <div style={header}>
          <span style={headerTitle}>Web Server Settings</span>
          <button style={closeBtn} onClick={onClose} aria-label="Close settings" title="Close">✕</button>
        </div>

        {/* Body */}
        <div style={body}>
          {/* Enable toggle */}
          <label style={rowLabel} htmlFor="ws-enabled-toggle">
            <span style={rowText}>
              <span style={rowName}>Enable Web Server</span>
              <span style={rowDesc}>Serve your library over HTTP on the local network</span>
            </span>
            <div
              id="ws-enabled-toggle"
              role="switch"
              aria-checked={pendingEnabled}
              tabIndex={0}
              style={toggle(pendingEnabled)}
              onClick={() => setPendingEnabled((v) => !v)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPendingEnabled((v) => !v); } }}
            >
              <div style={toggleKnob(pendingEnabled)} />
            </div>
          </label>

          <div style={divider} />

          {/* Port */}
          <div style={rowLabel}>
            <span style={rowText}>
              <span style={rowName}>Port</span>
              <span style={rowDesc}>HTTP port the server listens on (1024–65535)</span>
            </span>
            <input
              id="ws-port-input"
              type="number"
              min={1024}
              max={65535}
              step={1}
              value={portInput}
              onChange={(e) => handlePortChange(e.target.value)}
              disabled={!pendingEnabled}
              style={portField(pendingEnabled)}
              aria-label="Web server port"
            />
          </div>

          {/* Status / URL display */}
          {settings && (
            <>
              <div style={divider} />
              <div style={statusSection}>
                <div style={statusRow}>
                  <span style={statusDot(settings.enabled)} />
                  <span style={statusText}>
                    {settings.enabled ? 'Running' : 'Stopped'}
                  </span>
                </div>

                {settings.enabled && settings.url && (
                  <div style={urlBlock}>
                    <span style={urlLabel}>Local</span>
                    <span style={urlValue}>{settings.url}</span>
                    <button style={urlBtn} onClick={() => handleCopy(settings.url!)} title="Copy URL">
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                )}

                {settings.enabled && settings.lanUrl && (
                  <div style={urlBlock}>
                    <span style={urlLabel}>LAN</span>
                    <span style={urlValue}>{settings.lanUrl}</span>
                    <button style={urlBtn} onClick={() => handleCopy(settings.lanUrl!)} title="Copy LAN URL">
                      Copy
                    </button>
                  </div>
                )}

                {!settings.enabled && (
                  <p style={hintText}>
                    Enable the web server to browse and read your library from any device on your local network.
                  </p>
                )}
              </div>
            </>
          )}

          {saveError && <p style={errorText}>{saveError}</p>}
        </div>

        {/* Footer */}
        <div style={footer}>
          <button style={cancelBtnStyle} onClick={onClose}>Cancel</button>
          <button
            style={saveBtnStyle(isDirty && !saving)}
            onClick={handleSave}
            disabled={!isDirty || saving}
            aria-busy={saving}
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const dialog: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #2e2e2e',
  borderRadius: 10,
  width: 460,
  maxWidth: '92vw',
  boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column',
  outline: 'none',
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px 12px',
  borderBottom: '1px solid #272727',
};

const headerTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: '#e0e0e0', letterSpacing: '0.01em',
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#666',
  cursor: 'pointer', fontSize: 16, padding: '2px 4px',
  borderRadius: 4, lineHeight: 1,
  transition: 'color 120ms',
};

const body: React.CSSProperties = {
  padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 4,
};

const rowLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 16, padding: '10px 0',
};

const rowText: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
};

const rowName: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: '#d8d8d8',
};

const rowDesc: React.CSSProperties = {
  fontSize: 12, color: '#666',
};

const divider: React.CSSProperties = {
  height: 1, background: '#272727', margin: '2px 0',
};

const toggle = (on: boolean): React.CSSProperties => ({
  width: 40, height: 22, borderRadius: 11, flexShrink: 0,
  background: on ? '#4a9eff' : '#3a3a3a',
  position: 'relative', cursor: 'pointer',
  transition: 'background 180ms',
  border: '1px solid ' + (on ? '#3080df' : '#444'),
  outline: 'none',
});

const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: 'absolute', top: 2, left: on ? 18 : 2,
  width: 16, height: 16, borderRadius: '50%',
  background: '#fff',
  transition: 'left 180ms',
  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
});

const portField = (enabled: boolean): React.CSSProperties => ({
  width: 90, padding: '5px 10px',
  background: enabled ? '#111' : '#161616',
  border: '1px solid ' + (enabled ? '#383838' : '#2a2a2a'),
  borderRadius: 6,
  color: enabled ? '#d8d8d8' : '#555',
  fontSize: 13, textAlign: 'right',
  transition: 'border-color 150ms, color 150ms',
  MozAppearance: 'textfield',
});

const statusSection: React.CSSProperties = {
  padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 8,
};

const statusRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const statusDot = (on: boolean): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  background: on ? '#4caf82' : '#555',
  boxShadow: on ? '0 0 6px #4caf82' : 'none',
});

const statusText: React.CSSProperties = {
  fontSize: 12, color: '#888',
};

const urlBlock: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#111', borderRadius: 6, padding: '6px 10px',
  border: '1px solid #272727',
};

const urlLabel: React.CSSProperties = {
  fontSize: 11, color: '#555', width: 32, flexShrink: 0,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const urlValue: React.CSSProperties = {
  flex: 1, fontSize: 12, color: '#4a9eff',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontFamily: 'monospace',
};

const urlBtn: React.CSSProperties = {
  flexShrink: 0, padding: '3px 8px',
  background: '#1e1e1e', border: '1px solid #333',
  borderRadius: 4, color: '#aaa', fontSize: 11, cursor: 'pointer',
};

const hintText: React.CSSProperties = {
  fontSize: 12, color: '#555', lineHeight: 1.5, margin: '4px 0',
};

const errorText: React.CSSProperties = {
  fontSize: 12, color: '#e05252', marginTop: 6,
};

const footer: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '12px 20px 16px',
  borderTop: '1px solid #272727',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 18px', borderRadius: 6, fontSize: 13,
  background: 'none', border: '1px solid #333',
  color: '#999', cursor: 'pointer',
};

const saveBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500,
  background: active ? '#4a9eff' : '#1e2e40',
  border: '1px solid ' + (active ? '#3080df' : '#2a3a50'),
  color: active ? '#fff' : '#4a6a8a',
  cursor: active ? 'pointer' : 'not-allowed',
  transition: 'background 150ms, color 150ms',
});
