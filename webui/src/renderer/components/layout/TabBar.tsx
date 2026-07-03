import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { Home, LayoutGrid, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabPanel, setTabPanel } = useUiStore();

  const handleTabClick = (tab: 'home' | 'browse' | 'settings') => {
    if (tab === 'home') {
      setTabPanel(null);
      navigate('/');
    } else if (tab === 'settings') {
      setTabPanel(null);
      navigate('/settings');
    } else {
      // Toggle the combined browse panel
      setTabPanel(tabPanel === 'browse' ? null : 'browse');
    }
  };

  const isTabActive = (tab: 'home' | 'browse' | 'settings') => {
    if (tab === 'home') {
      return (location.pathname === '/' || location.pathname === '') && tabPanel === null;
    }
    if (tab === 'settings') {
      return location.pathname === '/settings' && tabPanel === null;
    }
    return tabPanel === 'browse';
  };

  const btnClass = (active: boolean) =>
    cn(
      "flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium h-full border-none bg-transparent transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-tab-bar bg-card border-t border-border flex items-center justify-around z-40 select-none pb-safe">
      <button
        onClick={() => handleTabClick('home')}
        className={btnClass(isTabActive('home'))}
      >
        <Home className="h-5 w-5" />
        Home
      </button>

      <button
        onClick={() => handleTabClick('browse')}
        className={btnClass(isTabActive('browse'))}
      >
        <LayoutGrid className="h-5 w-5" />
        Browse
      </button>

      <button
        onClick={() => handleTabClick('settings')}
        className={btnClass(isTabActive('settings'))}
      >
        <Settings className="h-5 w-5" />
        Settings
      </button>
    </nav>
  );
}
