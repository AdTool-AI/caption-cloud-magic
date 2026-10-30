/**
 * Frame inside the source media where a Director's Cut scene starts.
 * - Scene with its own clip (additionalMedia): its trim point (mediaSourceStart).
 * - Scene cut from the single original upload: its original position.
 */
export function getSceneSourceStartFrame(
  scene: { mediaSourceStart?: number; originalStartTime?: number; startTime: number },
  fps: number,
  hasOwnClip: boolean,
): number {
  const seconds = hasOwnClip
    ? (scene.mediaSourceStart ?? 0)
    : (scene.originalStartTime ?? scene.startTime);
  return Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) * fps));
}
