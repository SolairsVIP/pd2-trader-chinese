export function positionWhisperPopup(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  bounds: { left: number; top: number; right: number; bottom: number },
) {
  const gap = 12;
  const x = pointer.x + gap + size.width <= bounds.right ? pointer.x + gap : pointer.x - gap - size.width;
  const y = pointer.y + gap + size.height <= bounds.bottom ? pointer.y + gap : pointer.y - gap - size.height;
  return {
    left: Math.max(bounds.left, Math.min(x, bounds.right - size.width)),
    top: Math.max(bounds.top, Math.min(y, bounds.bottom - size.height)),
  };
}
