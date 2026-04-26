/**
 * SettingsDialog.tsx — Web Server settings modal for CB8.
 *
 * Opened by App.tsx when the renderer receives an 'open-settings' IPC event
 * (sent from the main process via Settings → Web Server… menu item).
 */

import React, { useEffect, useReducer, useCallback, useRef } from 'react';
import {
  getWebServerSettings,
  setWebServerSettings,
  type WebServerSettings,
} from '../ipcClient';
import {
  overlay, dialog, header, headerTitle, closeBtn,
  body, rowLabel, rowText, rowName, rowDesc, divider,
  toggle, toggleKnob, portField,
  statusSection, statusRow, statusDot, statusText,
  urlBlock, urlLabel, urlValue, urlBtn,
  hintText, errorText,
  footer, cancelBtnStyle, saveBtnStyle,
} from './SettingsDialog.styles';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The dialog has one logical state machine spanning loaded/applied settings,
 * the user's pending edits, the in-flight save, and the transient
 * "copied to clipboard" affordance. Modeling it as one reducer keeps the
 * "ok to save" / "is dirty" derivations co-located with the data they read.
 */
interface State {
  /** Latest server-confirmed settings; null until the first load resolves. */
  settings: WebServerSettings | null;
  /** User's pending edits — mirror of `settings` until they touch a control. */
  pendingEnabled: boolean;
  pendingPort: number;
  portInput: string;
  /** Whether a save is in flight. */
  saving: boolean;
  /** Last save error message (cleared on next save attempt or load). */
  saveError: string | null;
  /** Transient "✓ copied" indicator on URL copy buttons. */
  copied: boolean;
}

type Action =
  | { type: 'load-start' }
  | { type: 'load-ok'; settings: WebServerSettings }
  | { type: 'set-enabled'; enabled: boolean }
  | { type: 'set-port-input'; value: string }
  | { type: 'save-start' }
  | { type: 'save-ok'; settings: WebServerSettings }
  | { type: 'save-error'; message: string }
  | { type: 'copied' }
  | { type: 'copied-clear' };

const INITIAL_STATE: State = {
  settings: null,
  pendingEnabled: false,
  pendingPort: 8008,
  portInput: '8008',
  saving: false,
  saveError: null,
  copied: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load-start':
      return { ...state, saveError: null };
    case 'load-ok':
    case 'save-ok':
      return {
        ...state,
        settings: action.settings,
        pendingEnabled: action.settings.enabled,
        pendingPort: action.settings.port,
        portInput: String(action.settings.port),
        saving: false,
        saveError: null,
      };
    case 'set-enabled':
      return { ...state, pendingEnabled: action.enabled };
    case 'set-port-input': {
      const n = parseInt(action.value, 10);
      const validPort = !Number.isNaN(n) && n >= 1024 && n <= 65535;
      return { ...state, portInput: action.value, pendingPort: validPort ? n : state.pendingPort };
    }
    case 'save-start':
      return { ...state, saving: true, saveError: null };
    case 'save-error':
      return { ...state, saving: false, saveError: action.message };
    case 'copied':
      return { ...state, copied: true };
    case 'copied-clear':
      return { ...state, copied: false };
  }
}

export const SettingsDialog: React.FC<Props> = ({ open, onClose }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { settings, pendingEnabled, pendingPort, portInput, saving, saveError, copied } = state;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load current settings when the dialog opens
  useEffect(() => {
    if (!open) return;
    dispatch({ type: 'load-start' });
    getWebServerSettings()
      .then((s) => dispatch({ type: 'load-ok', settings: s }))
      .catch(console.error);
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

  const handleSave = useCallback(async () => {
    const port = parseInt(portInput, 10);
    if (Number.isNaN(port) || port < 1024 || port > 65535) {
      dispatch({ type: 'save-error', message: 'Port must be a number between 1024 and 65535.' });
      return;
    }
    dispatch({ type: 'save-start' });
    try {
      const updated = await setWebServerSettings(pendingEnabled, port);
      dispatch({ type: 'save-ok', settings: updated });
    } catch (err) {
      dispatch({ type: 'save-error', message: err instanceof Error ? err.message : 'Failed to apply settings.' });
    }
  }, [pendingEnabled, portInput]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      dispatch({ type: 'copied' });
      setTimeout(() => dispatch({ type: 'copied-clear' }), 1800);
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
              onClick={() => dispatch({ type: 'set-enabled', enabled: !pendingEnabled })}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); dispatch({ type: 'set-enabled', enabled: !pendingEnabled }); } }}
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
              onChange={(e) => dispatch({ type: 'set-port-input', value: e.target.value })}
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
