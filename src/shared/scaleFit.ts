/**
 * Aspect-ratio preserving scaling for image display.
 * Computes display dimensions that fit within viewport while preserving aspect ratio.
 */

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Calculate display dimensions that fit within viewport while preserving aspect ratio.
 * @param imageWidth - Original image width
 * @param imageHeight - Original image height
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @returns Display dimensions that fit within viewport
 */
export function scaleToFit(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): Dimensions {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const imageAspect = imageWidth / imageHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (imageAspect > viewportAspect) {
    // Image is wider than viewport - constrain by width
    displayWidth = viewportWidth;
    displayHeight = viewportWidth / imageAspect;
  } else {
    // Image is taller than viewport - constrain by height
    displayHeight = viewportHeight;
    displayWidth = viewportHeight * imageAspect;
  }

  return {
    width: displayWidth,
    height: displayHeight,
  };
}
