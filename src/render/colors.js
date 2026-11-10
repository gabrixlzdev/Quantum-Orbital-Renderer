// Supported color mapping modes exposed in the UI selector
export const COLOR_MODES = ['phase', 'radius', 'single'];

// Positive wavefunction lobe RGB color (Electric Cyan-Blue, colorblind-safe contrast)
const POS_SIGN_R = 0.20;
const POS_SIGN_G = 0.72;
const POS_SIGN_B = 1.00;

// Negative wavefunction lobe RGB color (Vibrant Coral-Orange, opposite sign lobe)
const NEG_SIGN_R = 1.00;
const NEG_SIGN_G = 0.38;
const NEG_SIGN_B = 0.22;

// Monochrome single-color mode RGB values
const SINGLE_R = 0.30;
const SINGLE_G = 0.78;
const SINGLE_B = 1.00;

// Phase wheel 120-degree (2 * pi / 3) channel offsets for smooth cyclic complex phase coloring
const TWO_PI_OVER_3 = (2.0 * Math.PI) / 3.0;

/**
 * Fills a flat RGB Float32Array(count * 3) color buffer from sampled orbital radii and phases.
 * Accepts an optional preallocated 'outColors' Float32Array to avoid heap allocation when re-coloring.
 */
export function buildOrbitalColors({
  radii,
  phases,
  r995 = 10.0,
  isReal = true,
  colorMode = 'phase',
  outColors = null,
}) {
  // Validate input TypedArrays
  if (!(radii instanceof Float32Array) || !(phases instanceof Float32Array)) {
    throw new TypeError('radii and phases must be Float32Array instances');
  }
  if (radii.length !== phases.length) {
    throw new RangeError('radii and phases must have identical lengths');
  }

  const count = radii.length;
  const requiredLength = count * 3;

  // Reuse caller-supplied Float32Array if large enough; otherwise allocate once
  const colors =
    outColors instanceof Float32Array && outColors.length >= requiredLength
      ? outColors
      : new Float32Array(requiredLength);

  // Mode 1: Single monochrome color (fastest path, constant RGB write)
  if (colorMode === 'single') {
    for (let i = 0; i < count; i++) {
      const idx3 = i * 3;
      colors[idx3] = SINGLE_R;
      colors[idx3 + 1] = SINGLE_G;
      colors[idx3 + 2] = SINGLE_B;
    }
    return colors;
  }

  // Mode 2: Radial distance gradient normalized by r995
  if (colorMode === 'radius') {
    const invR995 = r995 > 1e-6 ? 1.0 / r995 : 0.1;
    for (let i = 0; i < count; i++) {
      // Normalized radial fraction t in [0, 1]
      const t = Math.min(1.0, Math.max(0.0, radii[i] * invR995));
      const oneMinusT = 1.0 - t;
      const idx3 = i * 3;
      // Smooth gradient: bright warm core (t=0) -> cyan mid-shell (t=0.5) -> deep blue/violet tail (t=1)
      colors[idx3] = oneMinusT * oneMinusT * 0.95 + t * 0.25;
      colors[idx3 + 1] = oneMinusT * 0.85 + t * (1.0 - t) * 0.9 + t * 0.20;
      colors[idx3 + 2] = 0.45 + 0.55 * t;
    }
    return colors;
  }

  // Mode 3 (Default 'phase'): Sign of psi in real mode, or cyclic phase angle in complex mode
  if (isReal) {
    for (let i = 0; i < count; i++) {
      const idx3 = i * 3;
      if (phases[i] >= 0.0) {
        colors[idx3] = POS_SIGN_R;
        colors[idx3 + 1] = POS_SIGN_G;
        colors[idx3 + 2] = POS_SIGN_B;
      } else {
        colors[idx3] = NEG_SIGN_R;
        colors[idx3 + 1] = NEG_SIGN_G;
        colors[idx3 + 2] = NEG_SIGN_B;
      }
    }
    return colors;
  }

  // Complex mode: map continuous phase in [-pi, pi] to a 2*pi-periodic cosine RGB wheel
  for (let i = 0; i < count; i++) {
    const phi = phases[i];
    const idx3 = i * 3;
    colors[idx3] = 0.55 + 0.45 * Math.cos(phi);
    colors[idx3 + 1] = 0.55 + 0.45 * Math.cos(phi - TWO_PI_OVER_3);
    colors[idx3 + 2] = 0.55 + 0.45 * Math.cos(phi + TWO_PI_OVER_3);
  }

  return colors;
}