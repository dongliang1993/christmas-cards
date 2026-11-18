/**
 * Uploading an <img> to WebGL decodes it synchronously on the main thread
 * (~30 ms for a 940x1316 webp). A card switch uploads seven of those on the
 * frame the real card lands, which was the visible hitch. An ImageBitmap is
 * already decoded (off the main thread) and uploads in ~1 ms.
 *
 * Bitmaps ignore WebGL's UNPACK_FLIP_Y / PREMULTIPLY_ALPHA flags, so the flip
 * is baked in here and the texture must set `flipY = false`. three.js uploads
 * these textures with UNPACK_COLORSPACE_CONVERSION = NONE, matched by
 * `colorSpaceConversion: "none"`, so the pixels are identical to the <img>.
 */
export const BITMAP_OPTIONS: ImageBitmapOptions = {
  imageOrientation: "flipY",
  premultiplyAlpha: "none",
  colorSpaceConversion: "none",
};

interface DecodeDeps<I> {
  isImage: (s: unknown) => s is I;
  decode: (img: I, opts?: ImageBitmapOptions) => Promise<ImageBitmap>;
}

/**
 * Chrome decodes `createImageBitmap(<img>)` on the main thread; only a Blob
 * source decodes off it. The <img> already loaded, so the fetch is an HTTP
 * cache hit.
 */
async function decodeOffThread(img: HTMLImageElement, opts?: ImageBitmapOptions): Promise<ImageBitmap> {
  const res = await fetch(img.currentSrc || img.src);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return createImageBitmap(await res.blob(), opts);
}

const browserDeps: DecodeDeps<HTMLImageElement> = {
  isImage: (s): s is HTMLImageElement =>
    typeof HTMLImageElement !== "undefined" && s instanceof HTMLImageElement,
  decode: decodeOffThread,
};

/**
 * Decode every distinct <img> among `sources` into a ready-to-upload bitmap.
 * Anything else (canvases, bitmaps) is skipped; an image that fails to decode
 * is left out, and simply uploads from the <img> as before.
 */
export async function decodeImages<I extends object = HTMLImageElement>(
  sources: Iterable<unknown>,
  deps: DecodeDeps<I> = browserDeps as unknown as DecodeDeps<I>,
): Promise<Map<object, ImageBitmap>> {
  const images = [...new Set([...sources].filter(deps.isImage))];
  if (typeof createImageBitmap === "undefined" && deps === (browserDeps as unknown)) return new Map();
  const decoded = await Promise.all(
    images.map((img) =>
      deps.decode(img, BITMAP_OPTIONS).then(
        (bitmap) => [img, bitmap] as const,
        () => null,
      ),
    ),
  );
  return new Map(decoded.filter((d): d is readonly [I, ImageBitmap] => d !== null));
}

/** Whether a texture source is a bitmap with the flip already applied. */
export function isPreflipped(source: unknown): boolean {
  return typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
}
