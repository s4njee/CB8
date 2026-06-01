import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/hooks/useToast';

interface LoginPanelProps {
  onNavigate: (panel: string) => void;
  onSuccess: () => void;
  onBack: () => void;
}

export default function LoginPanel({ onNavigate, onSuccess, onBack }: LoginPanelProps) {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowResend(false);

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setErrorMsg('Please enter both username/email and password.');
      return;
    }

    setLoading(true);
    try {
      await api.login(trimmedId, password);
      // Invalidate session query to trigger React re-render across application
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      showToast('Signed in successfully');
      onSuccess();
    } catch (err: any) {
      const msg = err.message || 'Sign-in failed';
      setErrorMsg(msg);

      // Detect if email is not verified
      const isEmailNotVerified = err.code === 'EMAIL_NOT_VERIFIED' || 
        /not verified|verify your email/i.test(msg);
      if (isEmailNotVerified && trimmedId.includes('@')) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const trimmedId = identifier.trim();
    setResending(true);
    try {
      await api.sendVerificationEmail(trimmedId);
      showToast('Verification email sent — check your inbox.');
    } catch (err: any) {
      showToast(err.message || 'Could not resend verification email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-foreground text-left">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div className="space-y-1">
          <Label htmlFor="login-username" className="text-foreground">Username or email</Label>
          <Input
            id="login-username"
            type="text"
            className="bg-secondary border-border"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="login-pass" className="text-foreground">Password</Label>
          <Input
            id="login-pass"
            type="password"
            className="bg-secondary border-border"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        {errorMsg && (
          <div className="text-destructive text-xs font-semibold leading-relaxed bg-destructive/10 p-2.5 rounded border border-destructive/20 flex flex-col gap-1">
            <span>{errorMsg}</span>
            {showResend && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-left underline hover:text-destructive-foreground mt-1 disabled:opacity-50 text-xs font-bold"
              >
                {resending ? 'Sending...' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 justify-between">
          <Button
            type="button"
            variant="outline"
            className="border-border text-foreground hover:bg-muted"
            onClick={onBack}
            disabled={loading}
          >
            Back
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-1.5 pt-2 border-t border-border text-xs text-center">
        <button
          type="button"
          className="text-primary hover:underline font-semibold"
          onClick={() => onNavigate('signup')}
          disabled={loading}
        >
          Create an account
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:underline"
          onClick={() => onNavigate('forgot')}
          disabled={loading}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}
