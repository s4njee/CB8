import { describe, expect, it } from 'vitest';
import {
  adminPanelAfterLogin,
  adminPanelTitle,
  initialAdminPanelForRequest,
  isAdminOnlyPanel,
  isProtectedAdminPanel,
  toAdminPanel,
} from './adminPanelHelpers';

describe('adminPanelHelpers', () => {
  it('accepts only known admin panels', () => {
    expect(toAdminPanel('upload')).toBe('upload');
    expect(toAdminPanel('signup')).toBeNull();
    expect(toAdminPanel('not-a-panel')).toBeNull();
    expect(toAdminPanel(null)).toBeNull();
  });

  it('requires login before protected panels when unauthenticated', () => {
    expect(initialAdminPanelForRequest('upload', false, false)).toBe('login');
    expect(initialAdminPanelForRequest('settings', false, false)).toBe('login');
    expect(initialAdminPanelForRequest(null, false, false)).toBe('menu');
  });

  it('opens requested protected panels when the user has enough access', () => {
    expect(initialAdminPanelForRequest('upload', true, true)).toBe('upload');
    expect(initialAdminPanelForRequest('settings', true, false)).toBe('settings');
    expect(adminPanelAfterLogin('add-path', true)).toBe('add-path');
    expect(adminPanelAfterLogin('login', true)).toBe('menu');
  });

  it('blocks signed-in non-admin users from admin-only panels', () => {
    expect(initialAdminPanelForRequest('upload', true, false)).toBe('menu');
    expect(initialAdminPanelForRequest('add-path', true, false)).toBe('menu');
    expect(initialAdminPanelForRequest('users', true, false)).toBe('menu');
    expect(adminPanelAfterLogin('upload', false)).toBe('menu');
    expect(adminPanelAfterLogin('users', false)).toBe('menu');
  });

  it('keeps modal titles in one lookup table', () => {
    expect(adminPanelTitle('create-folder')).toBe('New folder');
    expect(adminPanelTitle('menu')).toBe('Admin');
    expect(isProtectedAdminPanel('users')).toBe(true);
    expect(isAdminOnlyPanel('upload')).toBe(true);
    expect(isAdminOnlyPanel('users')).toBe(true);
    expect(isAdminOnlyPanel('settings')).toBe(false);
    expect(isProtectedAdminPanel('forgot')).toBe(false);
  });
});
