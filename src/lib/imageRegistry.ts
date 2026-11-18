/**
 * Images the page has already loaded, by URL. Lets synchronous canvas code
 * (the inside-page textures) draw a paper-cut element that the card loaded
 * for its cover, without loading it again or waiting. The bake worker fills
 * the same registry with ImageBitmaps it fetched itself.
 */
const loaded = new Map<string, HTMLImageElement | ImageBitmap>();

export function rememberImage(src: string, img: HTMLImageElement | ImageBitmap): void {
  loaded.set(src, img);
}

export function loadedImage(src: string): HTMLImageElement | ImageBitmap | null {
  return loaded.get(src) ?? null;
}
