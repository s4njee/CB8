import React from 'react';
import { useUiStore, SortByFilter } from '@/store/uiStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SORT_OPTIONS: Array<{ value: SortByFilter; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'dateAdded', label: 'Date added' },
  { value: 'fileSize', label: 'File size' },
  { value: 'pageCount', label: 'Pages' },
  { value: 'lastRead', label: 'Recently Read' },
];

export default function SortSheet({ open, onOpenChange }: SortSheetProps) {
  const { sortBy, setSortBy } = useUiStore();

  const handleSelect = (val: SortByFilter) => {
    setSortBy(val);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-xl p-4">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-foreground text-left">Sort Options</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1">
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.value;
            return (
              <Button
                key={opt.value}
                variant="ghost"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "w-full flex items-center justify-between text-left h-12 px-3 text-base font-medium rounded-lg transition-colors",
                  active
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <span>{opt.label}</span>
                {active && <Check className="h-5 w-5 text-primary shrink-0" />}
              </Button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
