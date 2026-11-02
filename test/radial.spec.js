// Import native Node.js test runner primitives (zero external npm dependencies)
import { describe, it } from 'node:test';
// Import strict assertion library for floating-point and exception verification
import assert from 'node:assert/strict';

// Import radial wavefunction, probability density, and observable functions from radial.js
import {
  MAX_N,
  RYBERG_EV,
  generalizedLaguerre,
  radialWavefunction,
  radialProbabilityDensity,
  radialNodeCount,
  angularNodeCount,
  orbitalEnergyEv,
  expectedRadius,
  expectedRadiusSquared,
  orbitalLabel,
} from '../src/physics/radial.js';

/**
 * Composite midpoint numerical quadrature: integrates fn(r) from 0 to rMax using 'steps' rectangles.
 * Midpoint rule evaluates at (i + 0.5) * dr to avoid r = 0 and converges with error O(dr^2).
 */
function integrateRadial(fn, rMax, steps = 20000) {
  // Uniform rectangle width dr = rMax / steps
  const dr = rMax / steps;
  // Accumulator for Riemann midpoint sum in IEEE-754 double precision
  let sum = 0.0;
  // Sum fn(r_i) at the midpoint of each sub-interval [i*dr, (i+1)*dr]
  for (let i = 0; i < steps; i++) {
    // Midpoint coordinate r = (i + 0.5) * dr
    const r = (i + 0.5) * dr;
    // Call the passed-in function fn at radius r and add height to sum
    sum += fn(r);
  }
  // Multiply total height sum by rectangle width dr to get total area (definite integral)
  return sum * dr;
}

describe('Hydrogen Radial Wavefunction & Observables (radial.js)', () => {
  // Test 1: Closed-form analytical verification for 1s and 2p orbitals
  it('matches exact analytical formulas for R_10(r) and R_21(r)', () => {
    // Sample radii in Bohr units (a_0 = 1)
    const testRadii = [0.0, 0.5, 1.0, 2.5, 5.0];
    for (const r of testRadii) {
      // Analytical ground state (n=1, l=0): R_10(r) = 2 * exp(-r)
      const expected10 = 2.0 * Math.exp(-r);
      assert.ok(Math.abs(radialWavefunction(1, 0, r) - expected10) < 1e-12);

      // Analytical 2p state (n=2, l=1): R_21(r) = r * exp(-r / 2) / (2 * sqrt(6))
      const expected21 = (r * Math.exp(-0.5 * r)) / (2.0 * Math.sqrt(6.0));
      assert.ok(Math.abs(radialWavefunction(2, 1, r) - expected21) < 1e-12);
    }
  });

  // Test 2: Radial normalization integral_0^inf P(r) dr = 1
  it('normalizes radial probability density integral P(r) to 1 within 1e-3 for n = 1..6', () => {
    // Loop over every valid (n, l) pair from n = 1 up to MAX_N = 6
    for (let n = 1; n <= MAX_N; n++) {
      for (let l = 0; l < n; l++) {
        // Upper integration limit scaled well past orbital tail (rMax = 25 * n^2)
        const rMax = 25.0 * n * n;
        // Pass (r) => radialProbabilityDensity(n, l, r) as 'fn' into integrateRadial
        const normIntegral = integrateRadial(
          (r) => radialProbabilityDensity(n, l, r),
          rMax,
          15000
        );
        // Total probability of finding the electron between r = 0 and infinity must equal 1
        assert.ok(
          Math.abs(normIntegral - 1.0) < 1e-3,
          `Normalization failed for (n=${n}, l=${l}): got ${normIntegral}`
        );
      }
    }
  });

  // Test 3: Radial node count (both formula n - l - 1 and numerical root counting)
  it('has exact radial node count n - l - 1 for every valid (n, l) up to n = 6', () => {
    // Iterate through all 21 valid (n, l) combinations for n = 1..6
    for (let n = 1; n <= MAX_N; n++) {
      for (let l = 0; l < n; l++) {
        // 1. Check helper formula returns n - l - 1
        const expectedNodes = n - l - 1;
        assert.equal(radialNodeCount(n, l), expectedNodes);

        // 2. Numerically march along r > 0 and count how many times R_{n,l}(r) crosses zero
        const rMax = 12.0 * n * n;
        const steps = 20000;
        const dr = rMax / steps;
        let signChanges = 0;
        let prevVal = radialWavefunction(n, l, dr);

        for (let i = 2; i <= steps; i++) {
          const currVal = radialWavefunction(n, l, i * dr);
          // When prevVal and currVal have opposite signs, their product is negative (< 0)
          if (prevVal * currVal < 0) {
            signChanges++;
          }
          if (currVal !== 0) {
            prevVal = currVal;
          }
        }
        // Number of zero crossings must equal n - l - 1
        assert.equal( signChanges, expectedNodes,  `Sign change count mismatch for (n=${n}, l=${l})` );
      }
    }
  });

  // Test 4: Kramers expectation values <r> and <r^2>
  it('matches analytical expectation values <r> and <r^2> via numerical integration', () => {
    // Representative set of orbitals across shells: 1s, 2s, 2p, 3d, 4f, 6h
    const states = [ [1, 0], [2, 0], [2, 1], [3, 2], [4, 3], [6, 5]];
    for (const [n, l] of states) {
      const rMax = 25.0 * n * n;
      // Pass (r) => r * P(r) as 'fn' to compute <r> = integral_0^inf r * P(r) dr
      const numMeanR = integrateRadial( (r) => r * radialProbabilityDensity(n, l, r), rMax, 20000 );
      // Pass (r) => r^2 * P(r) as 'fn' to compute <r^2> = integral_0^inf r^2 * P(r) dr
      const numMeanR2 = integrateRadial((r) => r * r * radialProbabilityDensity(n, l, r), rMax, 20000);

      // Compare numerical integrals against closed-form expectedRadius and expectedRadiusSquared
      assert.ok(Math.abs(numMeanR - expectedRadius(n, l)) < 1e-2);
      assert.ok(Math.abs(numMeanR2 - expectedRadiusSquared(n, l)) < 1e-1);
    }
  });

  // Test 5: Eigenstate energy E_n, angular nodes, spectroscopic labels, and error guards
  it('computes correct energy, angular node count, and spectroscopic labels', () => {
    // Ground state energy E_1 = -13.6057 eV
    assert.equal(orbitalEnergyEv(1), -RYBERG_EV);
    // First excited shell E_2 = -13.6057 / 4 eV
    assert.ok(Math.abs(orbitalEnergyEv(2) - -RYBERG_EV / 4) < 1e-10);
    // Angular node count equals l
    assert.equal(angularNodeCount(3), 3);
    // Spectroscopic labels
    assert.equal(orbitalLabel(1, 0), '1s');
    assert.equal(orbitalLabel(2, 1), '2p');
    assert.equal(orbitalLabel(3, 2), '3d');
    assert.equal(orbitalLabel(4, 3), '4f');
    // Negative radius throws RangeError
    assert.throws(() => radialWavefunction(1, 0, -0.1), RangeError);
    // Negative Laguerre degree throws RangeError
    assert.throws(() => generalizedLaguerre(-1, 1, 1.0), RangeError);
  });
});