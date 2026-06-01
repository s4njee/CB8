import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUiStore, TabPanelType } from '@/store/uiStore';
import { BookOpen, Clock, Library, FolderOpen, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabPanel, setTabPanel } = useUiStore();

  const handleTabClick = (tab: 'all' | 'recent' | TabPanelType) => {
    if (tab === 'all') {
      setTabPanel(null);
      navigate('/');
    } else if (tab === 'recent') {
      setTabPanel(null);
      navigate('/recent');
    } else {
      // Toggle or set
      setTabPanel(tabPanel === tab ? null : tab);
    }
  };

  const isTabActive = (tab: 'all' | 'recent' | TabPanelType) => {
    if (tab === 'all') {
      return (location.pathname === '/' || location.pathname === '') && tabPanel === null;
    }
    if (tab === 'recent') {
      return location.pathname === '/recent' && tabPanel === null;
    }
    return tabPanel === tab;
  };

  const btnClass = (active: boolean) =>
    cn(
      "flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium h-full border-none bg-transparent transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-tab-bar bg-card border-t border-border flex items-center justify-around z-40 select-none pb-safe">
      <button
        onClick={() => handleTabClick('all')}
        className={btnClass(isTabActive('all'))}
      >
        <BookOpen className="h-5 w-5" />
        All
      </button>

      <button
        onClick={() => handleTabClick('recent')}
        className={btnClass(isTabActive('recent'))}
      >
        <Clock className="h-5 w-5" />
        Recent
      </button>

      <button
        onClick={() => handleTabClick('collections')}
        className={btnClass(isTabActive('collections'))}
      >
        <Library className="h-5 w-5" />
        Collections
      </button>

      <button
        onClick={() => handleTabClick('folders')}
        className={btnClass(isTabActive('folders'))}
      >
        <FolderOpen className="h-5 w-5" />
        Folders
      </button>

      <button
        onClick={() => handleTabClick('tags')}
        className={btnClass(isTabActive('tags'))}
      >
        <Tag className="h-5 w-5" />
        Tags
      </button>
    </nav>
  );
}
