/**
 * Cover image selection logic for comic book archives.
 * 
 * Priority:
 * 1. If an entry has basename "cover" (case-insensitive), use it
 * 2. Otherwise, use the first entry in the sorted list
 */

export interface ImageEntry {
  filename: string;
  index: number;
}

/**
 * Select the cover image from a list of image entries.
 * Returns the entry with basename "cover" if present, otherwise the first entry.
 */
export function selectCoverImage(entries: ImageEntry[]): ImageEntry | null {
  if (entries.length === 0) {
    return null;
  }

  // Look for an entry with basename "cover" (case-insensitive)
  const coverEntry = entries.find((entry) => {
    const basename = entry.filename.split('/').pop()?.split('.')[0]?.toLowerCase();
    return basename === 'cover';
  });

  return coverEntry ?? entries[0];
}
