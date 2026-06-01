import React, { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import AppShell from './components/layout/AppShell';
import * as api from './lib/api';

export default function App() {
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const session = await api.getSession();
        if (!session.authenticated) {
          const creds = await api.fetchInitialCredentials();
          if (creds?.initial_password) {
            const loggedIn = await api.adminLogin(creds.initial_password);
            if (loggedIn) {
              await queryClient.invalidateQueries({ queryKey: ['session'] });
              await queryClient.fetchQuery({
                queryKey: ['session'],
                queryFn: api.getSession,
              });
            }
          }
        }
      } catch (err) {
        console.error('Session bootstrap failed:', err);
      } finally {
        if (!cancelled) setSessionBootstrapped(true);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        {sessionBootstrapped ? (
          <AppShell />
        ) : (
          <div className="min-h-screen bg-background text-foreground" />
        )}
      </HashRouter>
    </QueryClientProvider>
  );
}
