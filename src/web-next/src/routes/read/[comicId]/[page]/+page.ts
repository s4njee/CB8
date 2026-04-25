import { error } from '@sveltejs/kit';
import { ApiError, fetchComic, getBookmarks, type Bookmark, type ComicListRecord } from '../../../../lib/api';

export async function load({ params, parent }: { params: { comicId: string; page: string }; parent: () => Promise<{ session: { authenticated: boolean; user: { id: number; username: string; isAdmin: boolean } | null } | null }> }) {
  const comicId = Number.parseInt(params.comicId, 10);
  const initialPageIndex = Number.parseInt(params.page, 10);

  if (!Number.isInteger(comicId) || comicId <= 0) throw error(404, 'Comic not found');
  if (!Number.isInteger(initialPageIndex)) throw error(404, 'Page not found');

  const { session } = await parent();
  const isAuthenticated = Boolean(session?.authenticated && session?.user);

  try {
    const [comic, bookmarks] = await Promise.all([
      fetchComic(comicId),
      isAuthenticated ? getBookmarks(comicId).catch(() => [] as Bookmark[]) : Promise.resolve([] as Bookmark[]),
    ]);

    return {
      comic,
      initialPageIndex,
      bookmarks,
    };
  } catch (err) {
    if (err instanceof ApiError) throw error(err.status, err.message);
    throw error(500, err instanceof Error ? err.message : 'Failed to load comic');
  }
}
