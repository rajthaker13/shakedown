/**
 * Color scales for the matrix. Both were chosen to stay readable for viewers
 * with red-green color vision deficiency, and every fill is paired with a
 * text color that meets WCAG AA on it.
 */

const LIGHT = "#eceeed";
const DARK = "#0b0c0c";

/** Cividis, nine steps, for success rate. Passes through gray, so no step reads as a status. */
const CIVIDIS: { fill: string; text: string }[] = [
  { fill: "#002051", text: LIGHT },
  { fill: "#11366c", text: LIGHT },
  { fill: "#3c4d6e", text: LIGHT },
  { fill: "#62646f", text: LIGHT },
  { fill: "#7f7c75", text: DARK },
  { fill: "#9a9478", text: DARK },
  { fill: "#bbaf71", text: DARK },
  { fill: "#e2cb5c", text: DARK },
  { fill: "#fdea45", text: DARK },
];

export function heat(rate: number) {
  const i = Math.min(CIVIDIS.length - 1, Math.max(0, Math.floor(rate * CIVIDIS.length)));
  return CIVIDIS[i];
}

export const heatLegend = CIVIDIS;

/** Diverging scale for change in success rate: vermilion for worse, sky blue for better. */
const DIVERGING = {
  down3: { fill: "#e54d2e", text: DARK },
  down2: { fill: "#a33b26", text: LIGHT },
  down1: { fill: "#5e2a1f", text: LIGHT },
  zero: { fill: "#2a2e2d", text: LIGHT },
  up1: { fill: "#1b4a66", text: LIGHT },
  up2: { fill: "#3d8fc4", text: DARK },
  up3: { fill: "#56b4e9", text: DARK },
};

/**
 * Strong color is reserved for changes with statistical support. A change
 * that is large but could be sampling noise gets only the faintest tint of
 * its direction, however many points it is.
 */
export function diverge(delta: number, noisePts: number, supported = true) {
  const pts = delta * 100;
  if (Math.abs(pts) < noisePts) return DIVERGING.zero;
  if (!supported) return pts < 0 ? DIVERGING.down1 : DIVERGING.up1;
  if (pts <= -20) return DIVERGING.down3;
  if (pts <= -10) return DIVERGING.down2;
  if (pts < 0) return DIVERGING.down1;
  if (pts >= 20) return DIVERGING.up3;
  if (pts >= 10) return DIVERGING.up2;
  return DIVERGING.up1;
}

export const divergeLegend = [
  { ...DIVERGING.down3, label: "−20 or worse" },
  { ...DIVERGING.down2, label: "−10" },
  { ...DIVERGING.down1, label: "" },
  { ...DIVERGING.zero, label: "within noise" },
  { ...DIVERGING.up1, label: "" },
  { ...DIVERGING.up2, label: "+10" },
  { ...DIVERGING.up3, label: "+20 or better" },
];
