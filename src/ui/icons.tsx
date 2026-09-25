/** Small original line icons (24×24), so the HUD does not depend on emoji fonts. */
const PATHS = {
  pause: 'M8 5v14M16 5v14',
  soundOn: 'M4 9v6h4l5 4V5L8 9H4Zm12.5 -.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  soundOff: 'M4 9v6h4l5 4V5L8 9H4Zm12 .5 5 5m0-5-5 5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
} as const;

export function Icon({
  name,
  size = 22,
}: {
  readonly name: keyof typeof PATHS;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
