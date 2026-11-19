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

/** The bytes each <img> was made from (see loadImageOnce), so decoding never re-downloads. */
const sourceBlobs = new WeakMap<HTMLImageElement, Blob>();

/**
 * Download an image once and keep its bytes: the <img> is built from the
 * same Blob that decodeOffThread later turns into a bitmap. Re-fetching
 * img.src for the bitmap doubled every texture's download whenever the HTTP
 * cache missed (cache disabled, evicted, or a cold edge).
 */
export async function loadImageOnce(src: string): Promise<HTMLImageElement> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`图片加载失败 ${src} (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  sourceBlobs.set(img, blob);
  return img;
}

/**
 * Chrome decodes `createImageBitmap(<img>)` on the main thread; only a Blob
 * source decodes off it. Images from loadImageOnce reuse their bytes; any
 * other <img> falls back to a fetch (normally an HTTP cache hit).
 */
async function decodeOffThread(img: HTMLImageElement, opts?: ImageBitmapOptions): Promise<ImageBitmap> {
  const kept = sourceBlobs.get(img);
  if (kept) return createImageBitmap(kept, opts);
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
