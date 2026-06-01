import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function invalidateLibraryQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return [
        'comics',
        'comic',
        'folders',
        'libraries',
        'tags',
        'browse',
        'series',
        'folder-series',
        'folder-volumes',
        'folder-chapters',
        'folder-volume-comics-flat',
        'folder-volume-comics-unnumbered',
        'folder-chapter-comics',
        'browse-volumes',
        'browse-chapters',
        'browse-volume-comics-flat',
        'browse-volume-comics-unnumbered',
        'browse-chapter-comics',
        'continue-reading',
        'recently-read',
        'library-comics',
        'tag-comics',
      ].includes(String(key));
    },
  });
}
