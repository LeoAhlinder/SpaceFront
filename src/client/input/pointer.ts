import type { Camera } from "../render/camera";

/** Pixels the pointer may move before a press counts as a drag instead of a click. */
const DRAG_THRESHOLD = 5;
/** Zoom change per wheel pixel. */
const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * Mouse/touch on the game canvas: drag pans the camera, wheel zooms toward the
 * cursor, and a press without dragging is a click. `camera` returns the camera
 * of the view on screen; `onZoom` runs after every wheel zoom.
 */
export function attachPointer(
  canvas: HTMLCanvasElement,
  camera: () => Camera,
  onClick: (screenX: number, screenY: number) => void,
  onZoom: () => void = () => undefined,
): void {
  let down: { x: number; y: number; lastX: number; lastY: number; dragging: boolean } | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    down = { x: e.offsetX, y: e.offsetY, lastX: e.offsetX, lastY: e.offsetY, dragging: false };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (!down.dragging && Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > DRAG_THRESHOLD) {
      down.dragging = true;
    }
    if (down.dragging) camera().panBy(e.offsetX - down.lastX, e.offsetY - down.lastY);
    down.lastX = e.offsetX;
    down.lastY = e.offsetY;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (down && !down.dragging && e.button === 0) onClick(e.offsetX, e.offsetY);
    down = null;
  });

  canvas.addEventListener("pointercancel", () => (down = null));

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera().zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED));
      onZoom();
    },
    { passive: false },
  );
}
