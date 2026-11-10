/**
 * @fileoverview Head-to-Head Benchmark: Factorized Inverse-CDF Sampler vs. Naive 3D Rejection Sampler.
 * Run via: npm run bench (node bench/sampling-bench.mjs)
 */

import { performance } from 'node:perf_hooks';
import { radialWavefunction } from '../src/physics/radial.js';
import { realSphericalHarmonic } from '../src/physics/angular.js';
import {
  mulberry32,
  computeAdaptiveRMax,
  sampleOrbitalCloud,
} from '../src/physics/sampler.js';

/**
 * Naive 3D Cartesian Box Rejection Sampler (kept strictly inside bench/ for comparison).
 * Draws uniform (x, y, z) in [-rMax, +rMax]^3 and accepts with probability |psi(r,theta,phi)|^2 / M.
 *
 * @param {object} params - Orbital parameters ({ n, l, m, count, seed }).
 * @returns {{ elapsedMs: number, trials: number, acceptanceRate: number }}
 */
function runNaive3DRejection({ n, l, m, count, seed = 1337 }) {
  const prng = mulberry32(seed);
  // Use 65% of adaptive rMax so the bounding box isn't even more astronomically empty
  const boxHalf = computeAdaptiveRMax(n, l) * 0.65;

  // Estimate peak probability density |psi|_max^2 via a coarse radial/polar scan
  let maxPsi2 = 1e-12;
  for (let ir = 1; ir <= 200; ir++) {
    const r = (ir / 200) * boxHalf;
    const rVal = radialWavefunction(n, l, r);
    const r2 = rVal * rVal;
    for (let it = 0; it <= 60; it++) {
      const theta = (it / 60) * Math.PI;
      const yVal = realSphericalHarmonic(l, m, theta, 0);
      const psi2 = r2 * yVal * yVal;
      if (psi2 > maxPsi2) {
        maxPsi2 = psi2;
      }
    }
  }
  // Safety envelope multiplier M = 1.05 * maxPsi2
  const envelopeM = maxPsi2 * 1.05;

  let accepted = 0;
  let trials = 0;
  const start = performance.now();

  while (accepted < count) {
    trials++;
    const x = (prng() * 2 - 1) * boxHalf;
    const y = (prng() * 2 - 1) * boxHalf;
    const z = (prng() * 2 - 1) * boxHalf;
    const r = Math.hypot(x, y, z);
    if (r > boxHalf || r < 1e-9) continue;

    const theta = Math.acos(z / r);
    const phi = Math.atan2(y, x);
    const psi = radialWavefunction(n, l, r) * realSphericalHarmonic(l, m, theta, phi);
    const psi2 = psi * psi;

    if (prng() * envelopeM <= psi2) {
      accepted++;
    }
  }

  const elapsedMs = performance.now() - start;
  return {
    elapsedMs,
    trials,
    acceptanceRate: (accepted / trials) * 100,
  };
}

/**
 * Runs the comparative benchmark across representative orbitals (1s, 2p_z, 3d_z^2, 4f_z^3).
 */
function main() {
  const states = [
    { label: '1s (1,0,0)', n: 1, l: 0, m: 0 },
    { label: '2p_z (2,1,0)', n: 2, l: 1, m: 0 },
    { label: '3d_z² (3,2,0)', n: 3, l: 2, m: 0 },
    { label: '4f_z³ (4,3,0)', n: 4, l: 3, m: 0 },
  ];

  const factorizedCount = 100000;
  // Use 5,000 points for 3D rejection because 100,000 points would take several seconds per state!
  const rejectionCount = 5000;

  // Warmup V8 JIT compiler
  sampleOrbitalCloud({ n: 2, l: 1, m: 0, count: 5000, useReal: true, seed: 1 });

  console.log('# Quantum-Orbital-Renderer — Sampling Benchmark (Node.js)');
  console.log('');
  console.log(
    '| Orbital | Factorized CDF (100k ms) | Factorized (samples/s) | 3D Rejection Acceptance | 3D Rejection (samples/s) | Speedup |'
  );
  console.log(
    '|:--------|-------------------------:|-----------------------:|------------------------:|-------------------------:|--------:|'
  );

  for (const st of states) {
    const t0 = performance.now();
    sampleOrbitalCloud({
      n: st.n,
      l: st.l,
      m: st.m,
      count: factorizedCount,
      useReal: true,
      seed: 42,
    });
    const factMs = performance.now() - t0;
    const factRate = Math.round((factorizedCount / factMs) * 1000);

    const rej = runNaive3DRejection({
      n: st.n,
      l: st.l,
      m: st.m,
      count: rejectionCount,
      seed: 42,
    });
    const rejRate = Math.round((rejectionCount / rej.elapsedMs) * 1000);
    const speedup = (factRate / Math.max(1, rejRate)).toFixed(1);

    console.log(
      `| ${st.label} | ${factMs.toFixed(1)} ms | ${factRate.toLocaleString()} /s | ${rej.acceptanceRate.toFixed(3)}% | ${rejRate.toLocaleString()} /s | **${speedup}x** |`
    );
  }
}

main();