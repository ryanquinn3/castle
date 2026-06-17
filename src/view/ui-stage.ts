import { STAGE_WIDTH } from '../config.ts';

/**
 * Returns the CSS scale factor for the logical stage given the canvas's current
 * CSS pixel width and the fixed logical stage width.
 *
 * When FitScreen scales the canvas to fill the window the canvas element's CSS
 * dimensions grow but STAGE_WIDTH (the logical coordinate space) stays fixed.
 * Multiplying any logical coordinate by stageScale() converts it to CSS pixels
 * so DOM overlays (HUD, toolbar) stay aligned to the board.
 */
export function stageScale(canvasCssWidth: number, stageWidth = STAGE_WIDTH): number {
  if (stageWidth <= 0) {
    return 1;
  }
  return canvasCssWidth / stageWidth;
}

export type ScaleListener = (scale: number) => void;

/**
 * Attaches a ResizeObserver to the Excalibur canvas element and calls
 * `onScale` whenever the CSS width changes (and once immediately on setup).
 * Returns a cleanup function that disconnects the observer.
 */
export function observeStageScale(
  canvas: HTMLCanvasElement,
  onScale: ScaleListener,
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const cssWidth = entry.contentRect.width;
      onScale(stageScale(cssWidth));
    }
  });
  observer.observe(canvas);
  // Fire once immediately so the initial layout is correct before the first
  // ResizeObserver callback, which may arrive asynchronously.
  onScale(stageScale(canvas.getBoundingClientRect().width));
  return () => observer.disconnect();
}
