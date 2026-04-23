import React from 'react';

export function ContextMenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ padding: '5px 8px 2px', color: '#7f8a9a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      {children}
    </div>
  );
}

export function ContextMenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '6px 8px', textAlign: 'left',
        backgroundColor: 'transparent', color: disabled ? '#666' : danger ? '#fca5a5' : '#ddd',
        border: 'none', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = danger ? '#3a2222' : '#303030'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {label}
    </button>
  );
}

export function ContextCreateForm({
  placeholder,
  value,
  error,
  creating,
  onChange,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  value: string;
  error: string | null;
  creating: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const trimmed = value.trim();

  return (
    <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed && !creating) onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '5px 7px',
          backgroundColor: '#111827', color: '#eee', border: '1px solid #4b5563',
          borderRadius: 4, outline: 'none', fontSize: 13,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!trimmed || creating}
          style={{
            flex: 1, padding: '5px 8px', backgroundColor: trimmed && !creating ? '#2563eb' : '#333',
            color: '#fff', border: 'none', borderRadius: 4,
            cursor: trimmed && !creating ? 'pointer' : 'default', fontSize: 12,
          }}
        >{creating ? 'Creating...' : 'Create'}</button>
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          style={{
            flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc',
            border: 'none', borderRadius: 4, cursor: creating ? 'default' : 'pointer', fontSize: 12,
          }}
        >Cancel</button>
      </div>
      {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
