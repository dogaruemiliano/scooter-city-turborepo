export function formatSecondsAsMinutesAndSeconds(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
