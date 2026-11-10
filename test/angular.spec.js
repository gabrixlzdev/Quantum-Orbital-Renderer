// Import native Node.js test runner primitives (zero external npm dependencies)
import { describe, it } from 'node:test';
// Import strict assertion library for floating-point and exception verification
import assert from 'node:assert/strict';

// Import Associated Legendre and Spherical Harmonics functions from angular.js
import {
  associatedLegendre,
  sphericalHarmonicNormalization,
  realSphericalHarmonic,
  complexSphericalHarmonic,
  angularProbabilityDensity,
} from '../src/physics/angular.js';

/**
 * Integrates an angular density function fn(theta, phi) over the full unit sphere:
 * integral_0^{2*pi} dphi integral_0^pi fn(theta, phi) * sin(theta) dtheta
 * using a 2D composite midpoint rule.
 */
function integrateOverSphere(fn, nTheta = 120, nPhi = 240) {
  // Polar step size dtheta over [0, pi]
  const dTheta = Math.PI / nTheta;
  // Azimuthal step size dphi over [0, 2*pi]
  const dPhi = (2.0 * Math.PI) / nPhi;
  // Total integral accumulator
  let total = 0.0;

  // Outer loop over polar angle theta in [0, pi]
  for (let i = 0; i < nTheta; i++) {
    // Midpoint polar angle theta_i
    const theta = (i + 0.5) * dTheta;
    // Spherical surface area Jacobian factor sin(theta)
    const sinTheta = Math.sin(theta);
    // Inner accumulator for azimuthal integral over phi
    let phiSum = 0.0;
    for (let j = 0; j < nPhi; j++) {
      // Midpoint azimuthal angle phi_j
      const phi = (j + 0.5) * dPhi;
      // Evaluate integrand at (theta_i, phi_j)
      phiSum += fn(theta, phi);
    }
    // Multiply azimuthal sum by Jacobian sin(theta)
    total += phiSum * sinTheta;
  }

  // Multiply by differential solid angle area element dTheta * dPhi
  return total * dTheta * dPhi;
}

describe('Associated Legendre & Spherical Harmonics (angular.js)', () => {
  // Test 1: Verify exact closed-form expressions & Condon-Shortley phase (-1)^m
  it('matches analytical closed-form Associated Legendre polynomials and Condon-Shortley phase', () => {
    const x = 0.6;
    const sinTheta = Math.sqrt(1.0 - x * x); // 0.8

    // P_0^0(x) = 1
    assert.ok(Math.abs(associatedLegendre(0, 0, x) - 1.0) < 1e-12);
    // P_1^0(x) = x
    assert.ok(Math.abs(associatedLegendre(1, 0, x) - x) < 1e-12);
    // P_1^1(x) = -sqrt(1 - x^2) (negative sign from Condon-Shortley (-1)^1)
    assert.ok(Math.abs(associatedLegendre(1, 1, x) - -sinTheta) < 1e-12);
    // P_2^0(x) = 0.5 * (3x^2 - 1)
    assert.ok(Math.abs(associatedLegendre(2, 0, x) - 0.5 * (3 * x * x - 1)) < 1e-12);
    // P_2^1(x) = -3 * x * sqrt(1 - x^2)
    assert.ok(Math.abs(associatedLegendre(2, 1, x) - -3.0 * x * sinTheta) < 1e-12);
    // P_2^2(x) = 3 * (1 - x^2) (positive sign from Condon-Shortley (-1)^2)
    assert.ok(Math.abs(associatedLegendre(2, 2, x) - 3.0 * (1.0 - x * x)) < 1e-12);
  });

  // Test 2: Normalization of REAL spherical harmonics over the unit sphere for l = 0..5, m = -l..l
  it('normalizes real spherical harmonics integral |Y_real|^2 dOmega to 1 within 1e-3 for l = 0..5', () => {
    for (let l = 0; l <= 5; l++) {
      for (let m = -l; m <= l; m++) {
        const integral = integrateOverSphere((theta, phi) =>
          angularProbabilityDensity(l, m, theta, phi, true)
        );
        assert.ok(
          Math.abs(integral - 1.0) < 1e-3,
          `Real normalization failed for (l=${l}, m=${m}): got ${integral}`
        );
      }
    }
  });

  // Test 3: Normalization of COMPLEX spherical harmonics over the unit sphere for l = 0..5, m = -l..l
  it('normalizes complex spherical harmonics integral |Y_complex|^2 dOmega to 1 within 1e-3 for l = 0..5', () => {
    for (let l = 0; l <= 5; l++) {
      for (let m = -l; m <= l; m++) {
        const integral = integrateOverSphere((theta, phi) => {
          const { re, im } = complexSphericalHarmonic(l, m, theta, phi);
          return re * re + im * im;
        });
        assert.ok(
          Math.abs(integral - 1.0) < 1e-3,
          `Complex normalization failed for (l=${l}, m=${m}): got ${integral}`
        );

        // Also verify angularProbabilityDensity(..., false) matches re^2 + im^2
        const thetaSample = 1.1;
        const phiSample = 2.3;
        const { re, im } = complexSphericalHarmonic(l, m, thetaSample, phiSample);
        const density = angularProbabilityDensity(l, m, thetaSample, phiSample, false);
        assert.ok(Math.abs(re * re + im * im - density) < 1e-12);
      }
    }
  });

  // Test 4: Orthogonality between distinct real spherical harmonics on the sphere
  it('satisfies orthogonality integral Y_{l1,m1} * Y_{l2,m2} dOmega = 0 for distinct states', () => {
    const pairs = [
      [[0, 0], [1, 0]],
      [[1, -1], [1, 1]],
      [[1, 0], [2, 0]],
      [[2, -2], [2, 2]],
    ];
    for (const [[l1, m1], [l2, m2]] of pairs) {
      const overlap = integrateOverSphere(
        (theta, phi) =>
          realSphericalHarmonic(l1, m1, theta, phi) *
          realSphericalHarmonic(l2, m2, theta, phi)
      );
      assert.ok(Math.abs(overlap) < 1e-3);
    }
  });

  // Test 5: Domain validation and RangeError guards
  it('rejects out-of-range (l, m) or |x| > 1 with RangeError', () => {
    assert.throws(() => associatedLegendre(1, 2, 0.5), RangeError);
    assert.throws(() => associatedLegendre(1, -1, 0.5), RangeError);
    assert.throws(() => associatedLegendre(1, 0, 1.05), RangeError);
    assert.throws(() => associatedLegendre(1, 0, -1.05), RangeError);
    assert.throws(() => sphericalHarmonicNormalization(2, 3), RangeError);
  });
});
