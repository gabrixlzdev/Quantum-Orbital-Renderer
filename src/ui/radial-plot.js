/**
 * @fileoverview 2D Radial Probability Density P(r) = r^2 |R_{n,l}(r)|^2 Plotter.
 * Overlays the exact analytical Schrödinger curve against the normalized Monte Carlo
 * sample histogram on <canvas id="radial-plot">, with a marker at <r>.
 */

// Import radial probability density P(r) and expectation value <r> from our physics core
import { radialProbabilityDensity, expectedRadius } from '../physics/radial.js';

/**
 * Computes the normalized probability density histogram of sampled radii and the
 * exact theoretical P(r) = r^2 R_{n,l}(r)^2 curve over [0, rMax].
 *
 * Pure mathematical function (zero DOM dependencies) for unit testability in Node.js.
 *
 * @param {object} params - Calculation parameters.
 * @param {number} params.n - Principal quantum number.
 * @param {number} params.l - Azimuthal quantum number.
 * @param {Float32Array} params.radii - Sampled radial distances in Bohr radii (a0).
 * @param {number} params.count - Number of active samples in radii to bin.
 * @param {number} params.rMax - Outer radial domain boundary in a0.
 * @param {number} [params.numBins=48] - Number of histogram bins across [0, rMax].
 * @param {number} [params.curveSteps=160] - Number of evaluation points for theoretical P(r).
 * @returns {{
 *   binDensity: Float64Array,
 *   curveR: Float64Array,
 *   curveP: Float64Array,
 *   maxP: number,
 *   meanR: number
 * }} Normalized histogram densities, theoretical curve coordinates, peak density, and <r>.
 */
export function computeRadialHistogramAndCurve({
  n,
  l,
  radii,
  count,
  rMax,
  numBins = 48,
  curveSteps = 160,
}) {
  // Ensure a strictly positive plot domain in Bohr radii
  const safeRMax = rMax > 0 ? rMax : 15;
  // Width of each radial histogram bin: dr = rMax / numBins
  const binWidth = safeRMax / numBins;
  // Allocate Float64Array for normalized probability density per bin
  const binDensity = new Float64Array(numBins);

  // Tally how many Monte Carlo samples fall into each radial bin [b * dr, (b + 1) * dr)
  const validCount = Math.min(count || 0, radii ? radii.length : 0);
  if (validCount > 0) {
    for (let i = 0; i < validCount; i++) {
      const r = radii[i];
      if (r >= 0 && r < safeRMax) {
        const binIndex = Math.min(numBins - 1, Math.floor(r / binWidth));
        binDensity[binIndex] += 1;
      }
    }
    // Normalize bin counts into a probability density: height = count_i / (N * dr)
    // so that sum_i (height_i * dr) = 1, matching the continuous integral int P(r) dr = 1!
    const normFactor = 1 / (validCount * binWidth);
    for (let b = 0; b < numBins; b++) {
      binDensity[b] *= normFactor;
    }
  }

  // Evaluate the exact analytical radial probability density P(r) = r^2 |R_{n,l}(r)|^2
  const curveR = new Float64Array(curveSteps);
  const curveP = new Float64Array(curveSteps);
  let maxP = 1e-6;

  for (let i = 0; i < curveSteps; i++) {
    const r = (i / (curveSteps - 1)) * safeRMax;
    const p = radialProbabilityDensity(n, l, r);
    curveR[i] = r;
    curveP[i] = p;
    if (p > maxP) {
      maxP = p;
    }
  }

  // Also include histogram peaks in maxP so bars never clip the top of the canvas
  for (let b = 0; b < numBins; b++) {
    if (binDensity[b] > maxP) {
      maxP = binDensity[b];
    }
  }

  // Compute exact analytical expectation value <r> = 0.5 * (3n^2 - l(l+1))
  const meanR = expectedRadius(n, l);

  return { binDensity, curveR, curveP, maxP, meanR };
}

/**
 * Renders the 2D radial distribution P(r) and Monte Carlo sample histogram onto a Canvas.
 *
 * @param {HTMLCanvasElement} canvas - The <canvas id="radial-plot"> element.
 * @param {object} params - Orbital and sample parameters ({ n, l, radii, count, rMax }).
 */
export function drawRadialPlot(canvas, params) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 18;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const safeRMax = params.rMax > 0 ? params.rMax : 15;
  const { binDensity, curveR, curveP, maxP, meanR } = computeRadialHistogramAndCurve({
    ...params,
    rMax: safeRMax,
  });

  // Clear canvas with deep dark background
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  // 1. Draw the Monte Carlo empirical histogram bars (translucent royal blue)
  const numBins = binDensity.length;
  const barW = plotW / numBins;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.42)';
  for (let b = 0; b < numBins; b++) {
    const normH = (binDensity[b] / maxP) * plotH;
    const x = padLeft + b * barW;
    const y = padTop + plotH - normH;
    ctx.fillRect(x, y, Math.max(1, barW - 1), normH);
  }

  // 2. Draw vertical dashed line at analytical expectation value <r> (amber gold)
  if (meanR > 0 && meanR < safeRMax) {
    const meanX = padLeft + (meanR / safeRMax) * plotW;
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(meanX, padTop);
    ctx.lineTo(meanX, padTop + plotH);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw exact theoretical radial probability curve P(r) = r^2 R_{n,l}(r)^2 (electric cyan)
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < curveR.length; i++) {
    const x = padLeft + (curveR[i] / safeRMax) * plotW;
    const y = padTop + plotH - (curveP[i] / maxP) * plotH;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // 4. Draw baseline axis and compact legend labels
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + plotH);
  ctx.lineTo(padLeft + plotW, padTop + plotH);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('P(r) = r²|Rₙₗ(r)|² vs. MC Samples', padLeft, 12);
  ctx.fillText('0', padLeft, height - 4);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`<r>=${meanR.toFixed(1)}a₀`, padLeft + plotW * 0.36, height - 4);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${safeRMax.toFixed(0)}a₀`, padLeft + plotW - 28, height - 4);
}