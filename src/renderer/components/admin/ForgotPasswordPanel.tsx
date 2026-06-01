import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/hooks/useToast';
import * as api from '@/lib/api';

interface ForgotPasswordPanelProps {
  onNavigate: (panel: string) => void;
  onSuccess: () => void;
  onBack: () => void;
}

export default function ForgotPasswordPanel({ onNavigate, onSuccess, onBack }: ForgotPasswordPanelProps) {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email.');
      return;
    }

    setLoading(true);
    try {
      await api.requestPasswordReset(trimmedEmail);
      showToast('Reset link sent — check your inbox.');
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 text-left">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Reset password</h2>
        <p className="text-sm text-muted-foreground">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div className="space-y-1">
          <Label htmlFor="fp-email" className="text-foreground">Email</Label>
          <Input
            id="fp-email"
            type="email"
            className="bg-secondary border-border"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        {errorMsg && (
          <div className="text-destructive text-xs font-semibold leading-relaxed bg-destructive/10 p-2.5 rounded border border-destructive/20">
            {errorMsg}
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
            {loading ? 'Sending...' : 'Send link'}
          </Button>
        </div>
      </form>

      <div className="flex justify-center pt-2 border-t border-border text-xs">
        <button
          type="button"
          className="text-primary hover:underline font-semibold"
          onClick={() => onNavigate('login')}
          disabled={loading}
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
