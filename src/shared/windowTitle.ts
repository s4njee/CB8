/**
 * Window title generator for displaying the current comic filename.
 */

/**
 * Generate a window title containing the filename from a file path.
 * @param filePath - Full path to the file
 * @returns Window title containing the basename
 */
export function generateWindowTitle(filePath: string): string {
  const basename = filePath.split(/[/\\]/).pop()?.trim() || '';
  if (!basename) {
    return 'CB8';
  }
  return `${basename} - CB8`;
}
