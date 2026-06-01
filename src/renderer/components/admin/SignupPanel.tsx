import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/hooks/useToast';

interface SignupPanelProps {
  onNavigate: (panel: string) => void;
  onSuccess: () => void;
  onBack: () => void;
}

export default function SignupPanel({ onNavigate, onSuccess, onBack }: SignupPanelProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      setErrorMsg('Username must be between 3 and 30 characters.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      await api.signup({
        username: trimmedUsername,
        email: trimmedEmail,
        password: password,
      });
      // Invalidate session
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      showToast('Account created — check your inbox to verify your email.');
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-foreground text-left">Create account</h2>
      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div className="space-y-1">
          <Label htmlFor="signup-username" className="text-foreground">Username</Label>
          <Input
            id="signup-username"
            type="text"
            className="bg-secondary border-border"
            autoComplete="username"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="signup-email" className="text-foreground">Email</Label>
          <Input
            id="signup-email"
            type="email"
            className="bg-secondary border-border"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="signup-password" className="text-foreground">Password</Label>
          <Input
            id="signup-password"
            type="password"
            className="bg-secondary border-border"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Creating...' : 'Create account'}
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
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
}
