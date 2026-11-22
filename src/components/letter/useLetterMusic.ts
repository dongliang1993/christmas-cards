"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The letter's music: on by default once the letter opens, off with one tap.
 *
 * Browsers start sound only inside a user gesture, so `start()` is meant to be
 * called from one (breaking the seal). When it is refused anyway — a letter
 * opened on an earlier visit has no such tap — the first touch on the page
 * starts it, unless the reader has turned it off.
 */
export function useLetterMusic(url: string | null | undefined) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  /** The reader turned it off: nothing starts it again but the button. */
  const muted = useRef(false);
  const [waitingForTouch, setWaitingForTouch] = useState(false);

  const play = useCallback(() => {
    const el = audio.current;
    if (!el || !url) return;
    el.play()
      .then(() => {
        setPlaying(true);
        setWaitingForTouch(false);
      })
      .catch(() => {
        setPlaying(false);
        setWaitingForTouch(true);
      });
  }, [url]);

  const start = useCallback(() => {
    if (!muted.current) play();
  }, [play]);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      muted.current = true;
      el.pause();
      setPlaying(false);
      return;
    }
    muted.current = false;
    play();
  }, [playing, play]);

  // Refused without a gesture: the next touch anywhere is one.
  useEffect(() => {
    if (!waitingForTouch) return;
    const onTouch = () => start();
    window.addEventListener("pointerdown", onTouch, { once: true });
    return () => window.removeEventListener("pointerdown", onTouch);
  }, [waitingForTouch, start]);

  return { audio, playing, start, toggle };
}
