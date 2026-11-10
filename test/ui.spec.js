/**
 * @fileoverview Unit tests for UI pure helpers: 2D radial histogram normalization
 * (src/ui/radial-plot.js), orbital symmetry labels (src/ui/controls.js), and
 * URL hash state parsing/serialization (src/main.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleOrbitalCloud } from '../src/physics/sampler.js';
import { computeRadialHistogramAndCurve } from '../src/ui/radial-plot.js';
import { formatDetailedOrbitalTitle } from '../src/ui/controls.js';
import { parseHashState, serializeHashState } from '../src/main.js';

describe('UI Pure Helpers & Radial Histogram Normalization (Step 7)', () => {
  it('normalizes the Monte Carlo radial histogram so the Riemann sum int P_hist(r) dr = 1', () => {
    // Sample 40,000 points from the 2p_0 orbital (n = 2, l = 1, m = 0)
    const { radii, rMax } = sampleOrbitalCloud({
      n: 2,
      l: 1,
      m: 0,
      count: 40000,
      useReal: true,
      seed: 42,
    });

    const numBins = 50;
    const { binDensity, curveR, curveP, maxP, meanR } = computeRadialHistogramAndCurve({
      n: 2,
      l: 1,
      radii,
      count: radii.length,
      rMax,
      numBins,
      curveSteps: 120,
    });

    // The Riemann integral of the normalized histogram (sum of binDensity[b] * binWidth) must equal 1.0!
    const binWidth = rMax / numBins;
    let riemannSum = 0;
    for (let b = 0; b < numBins; b++) {
      riemannSum += binDensity[b] * binWidth;
    }

    assert.ok(Math.abs(riemannSum - 1.0) < 1e-3, `Expected histogram integral ~1, got ${riemannSum}`);
    assert.strictEqual(curveR.length, 120);
    assert.strictEqual(curveP.length, 120);
    assert.ok(maxP > 0);
    // For n = 2, l = 1, exact <r> = 0.5 * (3*4 - 2) = 5.0 a0
    assert.strictEqual(meanR, 5);
  });

  it('formats Cartesian real and complex orbital labels accurately', () => {
    assert.strictEqual(formatDetailedOrbitalTitle(1, 0, 0, true), '1s (spherical)');
    assert.strictEqual(formatDetailedOrbitalTitle(2, 1, 0, true), '2p_z');
    assert.strictEqual(formatDetailedOrbitalTitle(2, 1, 1, true), '2p_x');
    assert.strictEqual(formatDetailedOrbitalTitle(2, 1, -1, true), '2p_y');
    assert.strictEqual(formatDetailedOrbitalTitle(3, 2, 0, true), '3d_z²');
    assert.strictEqual(formatDetailedOrbitalTitle(3, 2, 2, true), '3d_x²-y²');
    assert.strictEqual(formatDetailedOrbitalTitle(3, 2, -1, false), '3d (m = -1, complex)');
  });

  it('parses and serializes URL hash state while clamping invalid quantum numbers', () => {
    const parsed = parseHashState('#n=4&l=3&m=-2&real=0&points=200000');
    assert.strictEqual(parsed.n, 4);
    assert.strictEqual(parsed.l, 3);
    assert.strictEqual(parsed.m, -2);
    assert.strictEqual(parsed.useReal, false);
    assert.strictEqual(parsed.pointCount, 200000);

    // Round-trip serialization
    const serialized = serializeHashState(parsed);
    assert.strictEqual(serialized, '#n=4&l=3&m=-2&real=0&points=200000');

    // Invalid quantum numbers in hash (e.g. l=5 when n=2, m=9) must be clamped to valid physical bounds
    const clamped = parseHashState('#n=2&l=5&m=9');
    assert.strictEqual(clamped.n, 2);
    assert.ok(clamped.l < clamped.n);
    assert.ok(Math.abs(clamped.m) <= clamped.l);
  });
});
