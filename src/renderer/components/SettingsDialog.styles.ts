/**
 * SettingsDialog.styles.ts — co-located inline-style objects for
 * SettingsDialog. Pulled out so the component file is just behavior.
 */

import type React from 'react';

export const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export const dialog: React.CSSProperties = {
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

export const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px 12px',
  borderBottom: '1px solid #272727',
};

export const headerTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: '#e0e0e0', letterSpacing: '0.01em',
};

export const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#666',
  cursor: 'pointer', fontSize: 16, padding: '2px 4px',
  borderRadius: 4, lineHeight: 1,
  transition: 'color 120ms',
};

export const body: React.CSSProperties = {
  padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 4,
};

export const rowLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 16, padding: '10px 0',
};

export const rowText: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
};

export const rowName: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: '#d8d8d8',
};

export const rowDesc: React.CSSProperties = {
  fontSize: 12, color: '#666',
};

export const divider: React.CSSProperties = {
  height: 1, background: '#272727', margin: '2px 0',
};

export const toggle = (on: boolean): React.CSSProperties => ({
  width: 40, height: 22, borderRadius: 11, flexShrink: 0,
  background: on ? '#4a9eff' : '#3a3a3a',
  position: 'relative', cursor: 'pointer',
  transition: 'background 180ms',
  border: '1px solid ' + (on ? '#3080df' : '#444'),
  outline: 'none',
});

export const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: 'absolute', top: 2, left: on ? 18 : 2,
  width: 16, height: 16, borderRadius: '50%',
  background: '#fff',
  transition: 'left 180ms',
  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
});

export const portField = (enabled: boolean): React.CSSProperties => ({
  width: 90, padding: '5px 10px',
  background: enabled ? '#111' : '#161616',
  border: '1px solid ' + (enabled ? '#383838' : '#2a2a2a'),
  borderRadius: 6,
  color: enabled ? '#d8d8d8' : '#555',
  fontSize: 13, textAlign: 'right',
  transition: 'border-color 150ms, color 150ms',
  MozAppearance: 'textfield',
});

export const statusSection: React.CSSProperties = {
  padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 8,
};

export const statusRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

export const statusDot = (on: boolean): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  background: on ? '#4caf82' : '#555',
  boxShadow: on ? '0 0 6px #4caf82' : 'none',
});

export const statusText: React.CSSProperties = {
  fontSize: 12, color: '#888',
};

export const urlBlock: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#111', borderRadius: 6, padding: '6px 10px',
  border: '1px solid #272727',
};

export const urlLabel: React.CSSProperties = {
  fontSize: 11, color: '#555', width: 32, flexShrink: 0,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

export const urlValue: React.CSSProperties = {
  flex: 1, fontSize: 12, color: '#4a9eff',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontFamily: 'monospace',
};

export const urlBtn: React.CSSProperties = {
  flexShrink: 0, padding: '3px 8px',
  background: '#1e1e1e', border: '1px solid #333',
  borderRadius: 4, color: '#aaa', fontSize: 11, cursor: 'pointer',
};

export const hintText: React.CSSProperties = {
  fontSize: 12, color: '#555', lineHeight: 1.5, margin: '4px 0',
};

export const errorText: React.CSSProperties = {
  fontSize: 12, color: '#e05252', marginTop: 6,
};

export const footer: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '12px 20px 16px',
  borderTop: '1px solid #272727',
};

export const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 18px', borderRadius: 6, fontSize: 13,
  background: 'none', border: '1px solid #333',
  color: '#999', cursor: 'pointer',
};

export const saveBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500,
  background: active ? '#4a9eff' : '#1e2e40',
  border: '1px solid ' + (active ? '#3080df' : '#2a3a50'),
  color: active ? '#fff' : '#4a6a8a',
  cursor: active ? 'pointer' : 'not-allowed',
  transition: 'background 150ms, color 150ms',
});
