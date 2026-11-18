/**
 * The loading veil (src/app/layout.tsx, styled in globals.css).
 *
 * It is plain HTML painted with the first frame of the document - no
 * Three.js, no hydration - so it shows even while the 3D bundle is still
 * downloading. Once the homepage's 3D scene has rendered its first frame,
 * hideChristmasLoading() fades it out over 480ms.
 */

const VEIL_ID = "site-loading";

declare global {
  interface Window {
    hideChristmasLoading?: () => void;
  }
}

/** Fade the loading veil out. Safe to call repeatedly or when absent. */
export function hideChristmasLoading(): void {
  const veil = document.getElementById(VEIL_ID);
  if (!veil || veil.classList.contains("is-hidden")) return;
  veil.classList.add("is-hidden");
  veil.addEventListener(
    "transitionend",
    () => {
      if (veil.classList.contains("is-hidden")) veil.setAttribute("aria-hidden", "true");
    },
    { once: true },
  );
}

if (typeof window !== "undefined") {
  // Exposed for the reference implementation (window.hideChristmasLoading)
  // and for ad-hoc use from the console.
  window.hideChristmasLoading = hideChristmasLoading;
  // Safety net: if the 3D scene never fires (very old device, WebGL
  // unavailable), do not trap the visitor behind the veil.
  window.setTimeout(hideChristmasLoading, 15_000);
}
