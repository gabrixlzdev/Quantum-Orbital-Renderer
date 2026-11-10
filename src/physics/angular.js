import { factorial,validateQuantumNumbers } from "./quantum-numbers.js";

// Precomputed constant sqrt(2) to avoid calling Math.sqrt(2) inside real-orbital hot loops
const SQRT2 = Math.SQRT2;

// Precomputed constant 4 * pi (solid angle of a full sphere in steradians)
const FOUR_PI = 4.0 * Math.PI;

/**
 * Evaluates the Associated Legendre Function P_l^m(x) for 0 <= m <= l and x in [-1, 1]
 * using the Condon-Shortley phase convention (-1)^m and upward recurrence in degree l.
 */
export function associatedLegendre(l,m,x){
    
    if (!Number.isInteger(l) || !Number.isInteger(m) || l < 0 || m < 0 || m > l ){
        // Reject negative m or m > l (callers pass |m| for negative magnetic states)
        throw new RangeError(`Associated Legendre requires integers 0 <= m <= 1, received l = $(l), m = $(m)`);
    }

    // Cosine argument x = cos(theta) must lie within the closed interval [-1, 1]
    if (typeof x !== 'number' || Number.isNaN(x) || x < -1.0 || x > 1.0){

        throw new RangeError(`Argument x = cos(theta) must be in [-1, 1], received: ${x}`)
    }

    // Compute sectoral seed P_m^m(x) = (-1)^m * (2m - 1)!! * (1 - x^2)^(m / 2)
    let pmm = 1.0;

    if(m > 0){
        
        // sin(theta) = sqrt(1 - cos^2(theta)), clamped to 0 to guard against floating-point rounding
        const sinTheta = Math.sqrt(Math.max(0.0, (1.0 - x) * (1.0 + x)))

         // Odd factor (2i - 1) starts at 1 for i = 1 and steps by +2 each iteration
        let oddFactor = 1.0;

        // Multiply (-sinTheta * oddFactor) m times to include Condon-Shortley phase (-1)^m
        for(let i = 1; i <= m; i++){

            // Each step multiplies by -1 (Condon-Shortley sign), (2i - 1), and sin(theta)
            pmm *= -oddFactor * sinTheta;

            // Advance odd integer to next term: 1 -> 3 -> 5 -> ... -> (2m - 1)
            oddFactor += 2.0;
        }
    }

      // Base case 1: If degree l equals order m, the sectoral seed P_m^m(x) is the final answer
    if( l === m ){
        return pmm;
    }

    // First upward step l = m + 1: P_{m+1}^m(x) = x * (2m + 1) * P_m^m(x)
    let pmmpl = x * (2 * m + 1) * pmm;

     // Base case 2: If degree l equals m + 1, return P_{m+1}^m(x) directly
     if(l === m + 1){
        return pmmpl;
     }

     // Three-term upward recurrence in degree j from 
     // m + 1 up to l - 1 using scalar CPU registers
     let pPrev = pmm;
     let pCurr = pmmpl;


     for(let j = m + 1; j < l; j++){

        // Compute P_{j+1}^m(x) = ((2j + 1) * x * P_j^m(x) - (j + m) * P_{j-1}^m(x)) / (j - m + 1)
        const pNext = (((2 * j) + 1) * x * pCurr - (j + m) * pPrev) / (j - m + 1);

        // Shift current register into previous register for next step
        pPrev = pCurr;

        // Store newly computed polynomial value in current register
        pCurr = pNext;
    }

    // Return P_l^m(x)
    return pCurr;

}

/**
 * Computes the spherical harmonic normalization constant N_{l, |m|}:
 * N_{l, |m|} = sqrt( ((2l + 1) / (4 * pi)) * ((l - |m|)! / (l + |m|)!) )
 */

export function sphericalHarmonicNormalization(l,m)
{

    validateQuantumNumbers(l+1,l,m);

    // Normalization depends onlu on the magnitude m
    const absM = Math.abs(m);

    // Angular momentum prefactor (2l + 1) / (4 * pi) from Legendre orthogonality on the sphere
    const prefactor = ((2.0 * l) + 1.0)/ FOUR_PI;

    // Factorial ratio (l - |m|)! / (l + |m|)! from O(1) lookup table
    const factRatio = factorial(l - absM) / factorial(l + absM);

    // Return square root so that integral over solid angle dOmega equals 1
    return Math.sqrt(prefactor * factRatio)
}

/**
 * Evaluates the real spherical harmonic Y_{l,m}^{real}(theta, phi) used for Cartesian orbitals:
 * m > 0: sqrt(2) * N_{l,m} * P_l^m(cos(theta)) * cos(m * phi)
 * m = 0: N_{l,0} * P_l^0(cos(theta))
 * m < 0: sqrt(2) * N_{l,|m|} * P_l^{|m|}(cos(theta)) * sin(|m| * phi)
 */

export function realSphericalHarmonic(l, m, theta, phi)
{
    validateQuantumNumbers(l+1,l,m);

// Compute absolute magnetic order |m| for the Associated Legendre function
  const absM = Math.abs(m);
  // Convert polar angle theta in [0, pi] to x = cos(theta) in [-1, 1]
  const cosTheta = Math.cos(theta);
  // Evaluate polar part N_{l,|m|} * P_l^{|m|}(cos(theta))
  const polarPart = sphericalHarmonicNormalization(l, absM) * associatedLegendre(l, absM, cosTheta);

  // Axisymmetric m = 0 state (e.g., s, p_z, d_{z^2}) has no azimuthal phi dependence
  if (m === 0) {
    return polarPart;
  }
  // Positive m > 0 state (e.g., p_x, d_{x^2-y^2}) modulates by sqrt(2) * cos(m * phi)
  if (m > 0) {
    return SQRT2 * polarPart * Math.cos(m * phi);
  }
  // Negative m < 0 state (e.g., p_y, d_{xy}) modulates by sqrt(2) * sin(|m| * phi)
  return SQRT2 * polarPart * Math.sin(absM * phi);
}


/**
 * Evaluates the complex spherical harmonic Y_l^m(theta, phi) returning { re, im }:
 * For m >= 0: Y_l^m = N_{l,m} * P_l^m(cos(theta)) * exp(i * m * phi)
 * For m < 0:  Y_l^{-|m|} = (-1)^|m| * N_{l,|m|} * P_l^{|m|}(cos(theta)) * exp(-i * |m| * phi)
 */

export function complexSphericalHarmonic(l, m, theta, phi) {
  // Validate quantum numbers (l, m)
  validateQuantumNumbers(l + 1, l, m);
  // Magnitude |m| for Legendre evaluation
  const absM = Math.abs(m);
  // Polar cosine x = cos(theta)
  const cosTheta = Math.cos(theta);
  // Parity factor: for m < 0, Y_l^{-|m|} = (-1)^|m| * conj(Y_l^{|m|})
  const negMParity = m < 0 && absM % 2 === 1 ? -1.0 : 1.0;
  // Signed polar amplitude A(theta) = negMParity * N_{l,|m|} * P_l^{|m|}(cos(theta))
  const amplitude =
    negMParity *
    sphericalHarmonicNormalization(l, absM) *
    associatedLegendre(l, absM, cosTheta);
  // Azimuthal phase angle m * phi
  const phase = m * phi;
  // Euler's formula exp(i * m * phi) = cos(m * phi) + i * sin(m * phi)
  return {
    re: amplitude * Math.cos(phase),
    im: amplitude * Math.sin(phase),
  };
}
/**
 * Evaluates the angular probability density |Y_{l,m}(theta, phi)|^2 in either real or complex mode.
 * Integrates over the unit sphere integral_0^{2pi} dphi integral_0^pi |Y|^2 sin(theta) dtheta = 1.
 */
export function angularProbabilityDensity(l, m, theta, phi, isReal = true) {
  // In real mode, square the real spherical harmonic value directly
  if (isReal) {
    const yReal = realSphericalHarmonic(l, m, theta, phi);
    return yReal * yReal;
  }
  // In complex mode, |exp(i * m * phi)|^2 = 1, so density depends only on theta!
  validateQuantumNumbers(l + 1, l, m);
  const absM = Math.abs(m);
  const polarAmp = sphericalHarmonicNormalization(l, absM) * associatedLegendre(l, absM, Math.cos(theta));
  return polarAmp * polarAmp;
}