import { useState, useCallback } from 'react';
import type { QueryOptions, FilterPreset } from '../../../../shared/types';
import { getDefaultSortOrder, toggleSortOrder } from '../../../../shared/filterLogic';

interface UseLibraryFiltersParams {
  onPresetChange: (preset: FilterPreset) => void;
}

interface UseLibraryFiltersResult {
  sortBy: QueryOptions['sortBy'];
  setSortBy: React.Dispatch<React.SetStateAction<QueryOptions['sortBy']>>;
  sortOrder: 'asc' | 'desc';
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  readStatus: QueryOptions['readStatus'] | undefined;
  setReadStatus: React.Dispatch<React.SetStateAction<QueryOptions['readStatus'] | undefined>>;
  fileExt: string | undefined;
  setFileExt: React.Dispatch<React.SetStateAction<string | undefined>>;
  filterTag: string | undefined;
  setFilterTag: React.Dispatch<React.SetStateAction<string | undefined>>;
  availableTags: string[];
  setAvailableTags: React.Dispatch<React.SetStateAction<string[]>>;
  handleSortByChange: (field: QueryOptions['sortBy']) => void;
  handleSortOrderToggle: () => void;
  handleReadStatusChange: (status: QueryOptions['readStatus'] | undefined) => void;
  handleFileExtChange: (ext: string | undefined) => void;
  handleTagChange: (tag: string | undefined) => void;
}

export function useLibraryFilters({ onPresetChange }: UseLibraryFiltersParams): UseLibraryFiltersResult {
  const [sortBy, setSortBy] = useState<QueryOptions['sortBy']>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [readStatus, setReadStatus] = useState<QueryOptions['readStatus'] | undefined>(undefined);
  const [fileExt, setFileExt] = useState<string | undefined>(undefined);
  const [filterTag, setFilterTag] = useState<string | undefined>(undefined);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const handleSortByChange = useCallback((field: QueryOptions['sortBy']) => {
    const newOrder = getDefaultSortOrder(field);
    setSortBy(field);
    setSortOrder(newOrder);
    const preset: FilterPreset = { sortBy: field, sortOrder: newOrder, readStatus, fileExt, tag: filterTag };
    onPresetChange(preset);
  }, [readStatus, fileExt, filterTag, onPresetChange]);

  const handleSortOrderToggle = useCallback(() => {
    setSortOrder((prev) => {
      const newOrder = toggleSortOrder(prev);
      const preset: FilterPreset = { sortBy, sortOrder: newOrder, readStatus, fileExt, tag: filterTag };
      onPresetChange(preset);
      return newOrder;
    });
  }, [sortBy, readStatus, fileExt, filterTag, onPresetChange]);

  const handleReadStatusChange = useCallback((status: QueryOptions['readStatus'] | undefined) => {
    setReadStatus(status);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus: status, fileExt, tag: filterTag };
    onPresetChange(preset);
  }, [sortBy, sortOrder, fileExt, filterTag, onPresetChange]);

  const handleFileExtChange = useCallback((ext: string | undefined) => {
    setFileExt(ext);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus, fileExt: ext, tag: filterTag };
    onPresetChange(preset);
  }, [sortBy, sortOrder, readStatus, filterTag, onPresetChange]);

  const handleTagChange = useCallback((tag: string | undefined) => {
    setFilterTag(tag);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus, fileExt, tag };
    onPresetChange(preset);
  }, [sortBy, sortOrder, readStatus, fileExt, onPresetChange]);

  return {
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    readStatus,
    setReadStatus,
    fileExt,
    setFileExt,
    filterTag,
    setFilterTag,
    availableTags,
    setAvailableTags,
    handleSortByChange,
    handleSortOrderToggle,
    handleReadStatusChange,
    handleFileExtChange,
    handleTagChange,
  };
}
