import { create } from 'zustand';

interface SelectionState {
  selectedIds: number[];
  lastClickedId: number | null;
  toggleSelect: (id: number) => void;
  selectRange: (id: number, orderedIds: number[]) => void;
  clearSelection: () => void;
  setSelection: (ids: number[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: [],
  lastClickedId: null,

  toggleSelect: (id) =>
    set((state) => {
      const isSelected = state.selectedIds.includes(id);
      const updated = isSelected
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id];
      return { selectedIds: updated, lastClickedId: id };
    }),

  selectRange: (id, orderedIds) =>
    set((state) => {
      if (state.lastClickedId === null) {
        const isSelected = state.selectedIds.includes(id);
        const updated = isSelected
          ? state.selectedIds.filter((x) => x !== id)
          : [...state.selectedIds, id];
        return { selectedIds: updated, lastClickedId: id };
      }
      const from = orderedIds.indexOf(state.lastClickedId);
      const to = orderedIds.indexOf(id);
      if (from < 0 || to < 0) {
        const isSelected = state.selectedIds.includes(id);
        const updated = isSelected
          ? state.selectedIds.filter((x) => x !== id)
          : [...state.selectedIds, id];
        return { selectedIds: updated, lastClickedId: id };
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      const slice = orderedIds.slice(lo, hi + 1);

      // Union the selection
      const newSelection = Array.from(new Set([...state.selectedIds, ...slice]));
      return { selectedIds: newSelection, lastClickedId: id };
    }),

  clearSelection: () => set({ selectedIds: [], lastClickedId: null }),
  setSelection: (ids) => set({ selectedIds: ids, lastClickedId: null }),
}));
