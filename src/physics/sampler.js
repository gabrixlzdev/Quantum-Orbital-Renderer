import { validateQuantumNumbers } from './quantum-numbers.js';
import { radialWavefunction, radialProbabilityDensity } from './radial.js';
import { associatedLegendre } from './angular.js';

// Number of grid points for the tabulated radial Cumulative Distribution Function (CDF)
export const RADIAL_CDF_GRID_SIZE = 4096;

// Number of grid points for the tabulated polar cos(theta) CDF
export const POLAR_CDF_GRID_SIZE = 2048;

// Precomputed 2 * pi constant for azimuthal angle sampling
const TWO_PI = 2.0 * Math.PI;

/**
 * Creates a deterministic, seedable 32-bit Mulberry32 Pseudorandom Number Generator (PRNG).
 * Returns a closure () => number yielding uniform floats in [0, 1) with zero heap allocations.
 */
export function mulberry32(seed = 1337) {
  // '>>> 0' forces 'seed' to be stored as an unsigned 32-bit integer (0 to 4,294,967,295)
  let state = seed >>> 0;
  
  // Returns a function nextRandom() that you call just like Math.random()
  return function nextRandom() {
    // Adds a large constant (0x6d2b79f5 = 1,831,565,813) so 'state' changes on every call
    state = (state + 0x6d2b79f5) >>> 0;
    // Scrambles the bits (shifts right by 15 bits, XORs with '^', and multiplies)
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    // Scrambles the bits a second time (shifts right by 7 bits, XORs, and multiplies)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // Final bit shift (>>> 14), converts to unsigned integer (>>> 0) between 0 and 4294967295,
    // and divides by 2^32 (4294967296.0) to return a decimal in [0.0, 1.0)!
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
  };
}

/**
 * Computes an adaptive upper radius rMax (in Bohr radii a_0) such that the radial
 * probability tail mass beyond rMax is strictly below 1e-7 for any n >= 1.
 */
export function computeAdaptiveRMax(n, l) {

  validateQuantumNumbers(n, l, 0);

  // Start with a conservative analytical bound where exp(-2 * r / n) < 1e-12
  let rMax = n * (3.0 * n + 24.0);
  // Step outward if needed until the tail density rMax * P(rMax) is below 1e-9
  while (radialProbabilityDensity(n, l, rMax) * rMax > 1e-9 && rMax < 2000.0) {
    rMax += 5.0 * n;
  }
  return rMax;
}

/**
 * Builds a normalized Cumulative Distribution Function (CDF) table for P(r) = r^2 * R_{n,l}(r)^2
 * over [0, rMax] on 'gridSize' points using the trapezoidal rule.
 */
export function buildRadialCDF(n, l, gridSize = RADIAL_CDF_GRID_SIZE) {
  // Validate quantum numbers once before building the table
  validateQuantumNumbers(n, l, 0);
  // Determine adaptive upper radius rMax where tail probability < 1e-7
  const rMax = computeAdaptiveRMax(n, l);
  // Uniform radial step size dr
  const dr = rMax / (gridSize - 1);
  // Contiguous Float64Array storing monotonically increasing cumulative probability in [0, 1]
  const cdf = new Float64Array(gridSize);
  // At r = 0, cumulative probability is 0
  cdf[0] = 0.0;

  // Evaluate P(0) = 0
  let prevDensity = 0.0;
  let cumulative = 0.0;

  // Integrate P(r) across the grid using trapezoidal quadrature
  for (let i = 1; i < gridSize; i++) {
    const r = i * dr;
    const currDensity = radialProbabilityDensity(n, l, r);
    // Add trapezoid area 0.5 * (prev + curr) * dr
    cumulative += 0.5 * (prevDensity + currDensity) * dr;
    cdf[i] = cumulative;
    prevDensity = currDensity;
  }

  // Normalize every entry by total integral so cdf[gridSize - 1] === 1.0 exactly
  const invTotal = 1.0 / cumulative;
  for (let i = 1; i < gridSize; i++) {
    cdf[i] *= invTotal;
  }
  cdf[gridSize - 1] = 1.0;

  return { cdf, rMax, dr };
}

/**
 * Builds a normalized CDF table for the polar cosine x = cos(theta) in [-1, 1]
 * proportional to |P_l^{|m|}(x)|^2 on 'gridSize' points.
 */
export function buildPolarCosThetaCDF(l, m, gridSize = POLAR_CDF_GRID_SIZE) {
  // Validate (l, m) using minimal shell n = l + 1
  validateQuantumNumbers(l + 1, l, m);
  const absM = Math.abs(m);
  // Step width dx across [-1, 1] (total length = 2.0)
  const dx = 2.0 / (gridSize - 1);
  const cdf = new Float64Array(gridSize);
  cdf[0] = 0.0;

  // Initial density at South Pole x = -1.0
  const pStart = associatedLegendre(l, absM, -1.0);
  let prevDensity = pStart * pStart;
  let cumulative = 0.0;

  // Integrate |P_l^{|m|}(x)|^2 from x = -1 to x = +1
  for (let i = 1; i < gridSize; i++) {
    // Clamp x to [-1, 1] to guard against floating-point overshoot at i = gridSize - 1
    const x = Math.min(1.0, -1.0 + i * dx);
    const pVal = associatedLegendre(l, absM, x);
    const currDensity = pVal * pVal;
    cumulative += 0.5 * (prevDensity + currDensity) * dx;
    cdf[i] = cumulative;
    prevDensity = currDensity;
  }

  // Normalize so cdf[gridSize - 1] === 1.0
  const invTotal = 1.0 / cumulative;
  for (let i = 1; i < gridSize; i++) {
    cdf[i] *= invTotal;
  }
  cdf[gridSize - 1] = 1.0;

  return { cdf, dx };
}

/**
 * Inverts a normalized CDF array at uniform random number u in [0, 1) using O(log N)
 * binary search followed by linear sub-grid interpolation.
 */
export function invertCDF(cdf, u, minVal, step) {
  // Binary search bracket [low, high] such that cdf[low] <= u <= cdf[high]
  let low = 0;
  let high = cdf.length - 1;

  while (low + 1 < high) {
    // Bitwise unsigned right shift by 1 computes integer midpoint floor((low + high) / 2)
    const mid = (low + high) >>> 1;
    if (cdf[mid] <= u) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Linearly interpolate between grid index 'low' and 'high'
  const cdfLow = cdf[low];
  const span = cdf[high] - cdfLow;
  const frac = span > 1e-15 ? (u - cdfLow) / span : 0.0;
  return minVal + (low + frac) * step;
}

/**
 * Samples the azimuthal angle phi in [0, 2*pi):
 * - Uniform on [0, 2*pi) for complex orbitals or when m === 0.
 * - 1D rejection sampling from cos^2(m * phi) (m > 0) or sin^2(|m| * phi) (m < 0) for real mode (~50% acceptance).
 */
export function sampleAzimuthalPhi(m, isReal, prng) {
  // Complex orbitals and m = 0 real orbitals have rotationally symmetric phi distribution
  if (!isReal || m === 0) {
    return TWO_PI * prng();
  }
  const absM = Math.abs(m);
  // 1D rejection loop with theoretical acceptance probability of exactly 50%
  while (true) {
    const phi = TWO_PI * prng();
    const u = prng();
    const trig = m > 0 ? Math.cos(m * phi) : Math.sin(absM * phi);
    // Accept candidate phi if u <= trig^2
    if (u <= trig * trig) {
      return phi;
    }
  }
}

/**
 * Generates a 3D point cloud of 'count' electron positions for orbital (n, l, m)
 * using factorized inverse-CDF sampling with zero per-sample object allocations.
 *
 * Returns contiguous Float32Array buffers:
 * - positions: Float32Array(count * 3) [x0, y0, z0, x1, y1, z1, ...]
 * - radii:     Float32Array(count)     [r0, r1, ...]
 * - phases:    Float32Array(count)     [sign (+1/-1) in real mode, or phase (-pi..pi) in complex mode]
 * - rMax:      Adaptive grid cutoff radius
 * - r995:      Radius containing 99.5% of the radial probability (for automatic camera fitting)
 */
export function sampleOrbitalCloud({
  n,
  l,
  m,
  count = 100000,
  isReal = true,
  seed = 1337,
}) {
  // Validate quantum numbers (n, l, m)
  validateQuantumNumbers(n, l, m);
  // Validate sample count is a positive integer
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`Sample count must be a positive integer, received: ${count}`);
  }

  // Initialize deterministic PRNG
  const prng = mulberry32(seed);
  const absM = Math.abs(m);

  // Precompute 1D radial and polar CDF lookup tables once per orbital
  const { cdf: radialCDF, rMax, dr } = buildRadialCDF(n, l, RADIAL_CDF_GRID_SIZE);
  const { cdf: polarCDF, dx } = buildPolarCosThetaCDF(l, m, POLAR_CDF_GRID_SIZE);

  // Compute radius containing 99.5% of the probability for camera distance fitting (Task T5)
  const r995 = invertCDF(radialCDF, 0.995, 0.0, dr);

  // Preallocate flat, contiguous Float32Array buffers (zero GC pressure inside the loop)
  const positions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const phases = new Float32Array(count);

  // Populate all 'count' points in a tight, allocation-free loop
  for (let i = 0; i < count; i++) {
    // 1. Sample radius r from inverted radial CDF (100% acceptance)
    const r = invertCDF(radialCDF, prng(), 0.0, dr);

    // 2. Sample cos(theta) in [-1, 1] from inverted polar Legendre CDF (100% acceptance)
    const cosTheta = Math.max(-1.0, Math.min(1.0, invertCDF(polarCDF, prng(), -1.0, dx)));
    const sinTheta = Math.sqrt(Math.max(0.0, (1.0 - cosTheta) * (1.0 + cosTheta)));

    // 3. Sample azimuthal angle phi in [0, 2*pi)
    const phi = sampleAzimuthalPhi(m, isReal, prng);

    // 4. Convert spherical (r, theta, phi) to Cartesian (x, y, z)
    // Using Three.js Y-up convention where quantum polar z-axis maps to Y (or standard Z)
    const rSinTheta = r * sinTheta;
    const idx3 = i * 3;
    positions[idx3] = rSinTheta * Math.cos(phi);
    positions[idx3 + 1] = rSinTheta * Math.sin(phi);
    positions[idx3 + 2] = r * cosTheta;

    // Store radius r for radial histogram and color mapping
    radii[i] = r;

    // 5. Compute wavefunction sign (real mode) or complex phase angle (complex mode)
    const rVal = radialWavefunction(n, l, r);
    const pVal = associatedLegendre(l, absM, cosTheta);
    const rpProduct = rVal * pVal;

    if (isReal) {
      // Real mode sign depends on R_{n,l}(r) * P_l^{|m|}(cosTheta) * trig(m * phi)
      let trigSign = 1.0;
      if (m > 0) {
        trigSign = Math.cos(m * phi);
      } else if (m < 0) {
        trigSign = Math.sin(absM * phi);
      }
      phases[i] = rpProduct * trigSign >= 0.0 ? 1.0 : -1.0;
    } else {
      // Complex mode phase: m * phi, plus pi where R * P is negative (wrapped to [-pi, pi])
      const negMParity = m < 0 && absM % 2 === 1 ? -1.0 : 1.0;
      let rawPhase = m * phi + (rpProduct * negMParity < 0.0 ? Math.PI : 0.0);
      // Wrap phase into [-pi, pi]
      rawPhase = ((rawPhase + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
      phases[i] = rawPhase;
    }
  }

  return { positions, radii, phases, rMax, r995 };
}