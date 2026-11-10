// Import native Node.js test runner primitives (zero external npm dependencies)
import { describe, it } from 'node:test';
// Import strict assertion library
import assert from 'node:assert/strict';

// Import analytical expectation value formulas from radial.js
import { expectedRadius, expectedRadiusSquared } from '../src/physics/radial.js';

// Import factorized inverse-CDF sampler and PRNG from sampler.js
import { mulberry32, sampleOrbitalCloud } from '../src/physics/sampler.js';

/**
 * Computes sample mean and standard error of the mean SE = sqrt(variance / N)
 * for a sequence evaluated by valueFn(i) over N samples.
 */
function computeSampleStats(count, valueFn) {
  let sum = 0.0;
  for (let i = 0; i < count; i++) {
    sum += valueFn(i);
  }
  const mean = sum / count;

  let varianceSum = 0.0;
  for (let i = 0; i < count; i++) {
    const diff = valueFn(i) - mean;
    varianceSum += diff * diff;
  }
  const variance = varianceSum / count;
  const standardError = Math.sqrt(variance / count);

  return { mean, standardError };
}

describe('Factorized Inverse-CDF Orbital Sampler (sampler.js)', () => {
  // Test 1: Same seed produces identical samples; different seed produces different samples
  it('produces reproducible deterministic samples for the same seed', () => {
    const runA = sampleOrbitalCloud({ n: 2, l: 1, m: 0, count: 500, seed: 42 });
    const runB = sampleOrbitalCloud({ n: 2, l: 1, m: 0, count: 500, seed: 42 });
    const runC = sampleOrbitalCloud({ n: 2, l: 1, m: 0, count: 500, seed: 99 });

    assert.deepEqual(runA.positions, runB.positions);
    assert.deepEqual(runA.radii, runB.radii);
    assert.deepEqual(runA.phases, runB.phases);
    assert.notDeepEqual(runA.positions, runC.positions);
  });

  // Test 2: Expectation values <r> and <r^2> with 200,000 seeded samples within 5 standard errors
  it('agrees with analytical <r> and <r^2> within 5 standard errors for 200,000 samples', () => {
    const count = 200000;
    const orbitals = [
      { n: 1, l: 0, m: 0, isReal: true },
      { n: 2, l: 1, m: 1, isReal: true },
      { n: 3, l: 2, m: -1, isReal: false },
      { n: 4, l: 3, m: 2, isReal: true },
    ];

    for (const state of orbitals) {
      const { radii } = sampleOrbitalCloud({
        ...state,
        count,
        seed: 1337,
      });

      const rStats = computeSampleStats(count, (i) => radii[i]);
      const r2Stats = computeSampleStats(count, (i) => radii[i] * radii[i]);

      const exactR = expectedRadius(state.n, state.l);
      const exactR2 = expectedRadiusSquared(state.n, state.l);

      assert.ok(
        Math.abs(rStats.mean - exactR) <= 5.0 * rStats.standardError,
        `<r> mismatch for (n=${state.n}, l=${state.l}): sampled=${rStats.mean}, exact=${exactR}, SE=${rStats.standardError}`
      );
      assert.ok(
        Math.abs(r2Stats.mean - exactR2) <= 5.0 * r2Stats.standardError,
        `<r^2> mismatch for (n=${state.n}, l=${state.l}): sampled=${r2Stats.mean}, exact=${exactR2}, SE=${r2Stats.standardError}`
      );
    }
  });

  // Test 3: TypedArray types, finite values (no NaN/Infinity), and x^2 + y^2 + z^2 == r^2
  it('returns valid Float32Array buffers with no NaN or Infinity in real and complex modes', () => {
    const count = 2000;
    for (const isReal of [true, false]) {
      const { positions, radii, phases, r995, rMax } = sampleOrbitalCloud({
        n: 3,
        l: 2,
        m: -2,
        count,
        isReal,
        seed: 7,
      });

      assert.ok(positions instanceof Float32Array);
      assert.ok(radii instanceof Float32Array);
      assert.ok(phases instanceof Float32Array);
      assert.equal(positions.length, count * 3);
      assert.equal(radii.length, count);
      assert.equal(phases.length, count);
      assert.ok(r995 > 0 && r995 < rMax);

      for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const r = radii[i];
        const phase = phases[i];

        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
        assert.ok(Number.isFinite(r) && r >= 0);
        assert.ok(Number.isFinite(phase));

        // Verify Cartesian distance sqrt(x^2 + y^2 + z^2) matches stored radius r
        const dist = Math.hypot(x, y, z);
        assert.ok(Math.abs(dist - r) < 1e-3);

        if (isReal) {
          assert.ok(phase === 1.0 || phase === -1.0);
        } else {
          assert.ok(phase >= -Math.PI && phase <= Math.PI);
        }
      }
    }
  });

  // Test 4: Rejects invalid quantum numbers or invalid sample counts
  it('rejects invalid (n, l, m) or non-positive count with RangeError', () => {
    assert.throws(() => sampleOrbitalCloud({ n: 0, l: 0, m: 0 }), RangeError);
    assert.throws(() => sampleOrbitalCloud({ n: 2, l: 2, m: 0 }), RangeError);
    assert.throws(() => sampleOrbitalCloud({ n: 2, l: 1, m: 2 }), RangeError);
    assert.throws(() => sampleOrbitalCloud({ n: 1, l: 0, m: 0, count: 0 }), RangeError);

    const rng = mulberry32(1);
    const val = rng();
    assert.ok(val >= 0.0 && val < 1.0);
  });
});
