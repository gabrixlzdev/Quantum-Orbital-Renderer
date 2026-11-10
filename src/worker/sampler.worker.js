import { validateQuantumNumbers } from '../physics/quantum-numbers.js';
import { radialWavefunction } from '../physics/radial.js';
import { associatedLegendre } from '../physics/angular.js';
import {
  RADIAL_CDF_GRID_SIZE,
  POLAR_CDF_GRID_SIZE,
  mulberry32,
  buildRadialCDF,
  buildPolarCosThetaCDF,
  invertCDF,
  sampleAzimuthalPhi,
} from '../physics/sampler.js';

// Default progressive streaming chunk size (first 20,000 points appear immediately, Task T9)
export const DEFAULT_CHUNK_SIZE = 20000;

// Precomputed 2 * pi constant for phase wrapping
const TWO_PI = 2.0 * Math.PI;

/**
 * Executes a factorized orbital sampling request and emits progressive Float32Array chunks
 * via 'emitFn(message, transferList)'. Exported so it can be unit-tested in Node.js.
 */
export function processSamplingRequest(request, emitFn) {
  const {
    requestId = 0,
    n = 1,
    l = 0,
    m = 0,
    count = 100000,
    isReal = true,
    seed = 1337,
    chunkSize = DEFAULT_CHUNK_SIZE,
  } = request;

  // Record high-resolution start timestamp to measure total sampling duration in ms
  const startTime = performance.now();

  try {
    // Validate quantum numbers (n, l, m) before building CDF tables
    validateQuantumNumbers(n, l, m);
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`Sample count must be a positive integer, received: ${count}`);
    }

    // Initialize deterministic PRNG for reproducible progressive chunks
    const prng = mulberry32(seed);
    const absM = Math.abs(m);

    // Build 1D radial and polar CDF tables once for the entire orbital request
    const { cdf: radialCDF, rMax, dr } = buildRadialCDF(n, l, RADIAL_CDF_GRID_SIZE);
    const { cdf: polarCDF, dx } = buildPolarCosThetaCDF(l, m, POLAR_CDF_GRID_SIZE);

    // Radius containing 99.5% of the electron probability (used to fit the 3D camera distance)
    const r995 = invertCDF(radialCDF, 0.995, 0.0, dr);

    // Determine effective chunk size and total number of chunks to stream
    const stepSize = Math.max(1, Math.min(count, chunkSize));
    const totalChunks = Math.ceil(count / stepSize);
    let generated = 0;

    // Stream points chunk by chunk so the first 20,000 points render in ~15 ms
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const currentBatchCount = Math.min(stepSize, count - generated);

      // Allocate fresh Float32Array buffers for this chunk (ownership will transfer to main thread)
      const positions = new Float32Array(currentBatchCount * 3);
      const radii = new Float32Array(currentBatchCount);
      const phases = new Float32Array(currentBatchCount);

      for (let i = 0; i < currentBatchCount; i++) {
        // 1. Sample radius r from inverted radial CDF
        const r = invertCDF(radialCDF, prng(), 0.0, dr);

        // 2. Sample polar cosine x = cos(theta) from inverted Legendre CDF
        const cosTheta = Math.max(-1.0, Math.min(1.0, invertCDF(polarCDF, prng(), -1.0, dx)));
        const sinTheta = Math.sqrt(Math.max(0.0, (1.0 - cosTheta) * (1.0 + cosTheta)));

        // 3. Sample azimuthal angle phi in [0, 2*pi)
        const phi = sampleAzimuthalPhi(m, isReal, prng);

        // 4. Convert spherical (r, theta, phi) to Cartesian (x, y, z)
        const rSinTheta = r * sinTheta;
        const idx3 = i * 3;
        positions[idx3] = rSinTheta * Math.cos(phi);
        positions[idx3 + 1] = rSinTheta * Math.sin(phi);
        positions[idx3 + 2] = r * cosTheta;

        radii[i] = r;

        // 5. Evaluate wavefunction sign (real mode) or phase angle (complex mode)
        const rVal = radialWavefunction(n, l, r);
        const pVal = associatedLegendre(l, absM, cosTheta);
        const rpProduct = rVal * pVal;

        if (isReal) {
          let trigSign = 1.0;
          if (m > 0) {
            trigSign = Math.cos(m * phi);
          } else if (m < 0) {
            trigSign = Math.sin(absM * phi);
          }
          phases[i] = rpProduct * trigSign >= 0.0 ? 1.0 : -1.0;
        } else {
          const negMParity = m < 0 && absM % 2 === 1 ? -1.0 : 1.0;
          let rawPhase = m * phi + (rpProduct * negMParity < 0.0 ? Math.PI : 0.0);
          rawPhase = ((rawPhase + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
          phases[i] = rawPhase;
        }
      }

      generated += currentBatchCount;
      const done = generated >= count;
      const elapsedMs = performance.now() - startTime;

      // Emit chunk with zero-copy Transferable ArrayBuffers
      emitFn(
        {
          type: 'chunk',
          requestId,
          chunkIndex,
          totalChunks,
          chunkCount: currentBatchCount,
          generated,
          total: count,
          progress: generated / count,
          done,
          elapsedMs,
          rMax,
          r995,
          positions,
          radii,
          phases,
        },
        [positions.buffer, radii.buffer, phases.buffer]
      );
    }
  } catch (err) {
    // Emit structured error message back to main thread if invalid parameters were sent
    emitFn(
      {
        type: 'error',
        requestId,
        message: err instanceof Error ? err.message : String(err),
      },
      []
    );
  }
}

// Attach message listener automatically when running inside a browser Web Worker context
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event) => {
    processSamplingRequest(event.data, (msg, transfer) => {
      self.postMessage(msg, transfer);
    });
  };
}