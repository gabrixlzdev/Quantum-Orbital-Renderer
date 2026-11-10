# Quantum-Orbital-Renderer

[![CI](https://github.com/gabrixlzdev/Quantum-Orbital-Renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrixlzdev/Quantum-Orbital-Renderer/actions/workflows/ci.yml)

**🌐 Live 3D Demo:** [https://gabrixlzdev.github.io/Quantum-Orbital-Renderer/](https://gabrixlzdev.github.io/Quantum-Orbital-Renderer/)

Interactive 3D viewer of hydrogen-atom orbitals ($\psi_{n,l,m}$) in vanilla JavaScript and Three.js, featuring physically verified factorized inverse-CDF sampling in a Web Worker.

## Overview

This project visualizes the electronic probability density $|\psi_{n,l,m}(r, \theta, \phi)|^2$ of the non-relativistic, spinless hydrogen atom ($Z = 1$) in atomic units ($a_0 = 1$) as a real-time 3D point cloud.

- **Radial Wavefunction $R_{n,l}(r)$:** Generalized Laguerre polynomials $L_{n-l-1}^{2l+1}(\rho)$ via stable three-term recurrence relations ($\rho = 2r/n$).
- **Angular Wavefunction $Y_l^m(\theta, \phi)$:** Associated Legendre functions in both complex and real orbital forms.
- **High-Performance Sampling:** Factorized inverse Cumulative Distribution Function (CDF) sampling offloaded to a Web Worker with zero-copy `Float32Array` buffer transfers.

## Verified Physics Core (`src/physics/`)

- **Quantum Number Bounds & Combinatorics (`quantum-numbers.js`):** Precomputed `Float64Array` factorial table ($O(1)$ lookup) and Pauli/Schrödinger boundary validation ($n \ge 1$, $0 \le l < n$, $|m| \le l$).
- **Radial Wavefunction & Observables (`radial.js`):**
  - Radial probability density $P(r) = r^2 |R_{n,l}(r)|^2$ verified to normalize to $\int_0^\infty P(r)\,dr = 1 \pm 10^{-3}$ for $n \in [1, 6]$.
  - Radial node count $n - l - 1$, angular node count $l$, and Bohr eigenenergies $E_n = -13.6057 / n^2\text{ eV}$.
  - Analytical Kramers expectation values: $\langle r \rangle = \frac{1}{2}[3n^2 - l(l+1)]$ and $\langle r^2 \rangle = \frac{n^2}{2}[5n^2 + 1 - 3l(l+1)]$.
- **Angular Wavefunction & Spherical Harmonics (`angular.js`):**
  - Associated Legendre functions $P_l^m(\cos\theta)$ computed via stable upward recurrence in degree $l$, including the **Condon-Shortley phase convention $(-1)^m$**.
  - Supports both **real orbitals** ($m > 0 \propto \sqrt{2}\cos(m\phi)$, $m < 0 \propto \sqrt{2}\sin(|m|\phi)$, $m = 0$) and **complex orbitals** ($e^{im\phi}$).
  - Verified via 2D spherical quadrature to satisfy $\oint |Y_{l,m}(\theta, \phi)|^2 \, d\Omega = 1 \pm 10^{-3}$ for all $l \in [0, 5]$ and $m \in [-l, l]$.
- **Factorized Inverse-CDF Monte Carlo Sampler (`sampler.js`):**
  - Tabulates $4096$-point radial CDFs for $P(r) = r^2 R_{n,l}(r)^2$ (up to an adaptive $r_{\max}$ with tail mass $< 10^{-7}$) and $2048$-point polar CDFs for $|P_l^{|m|}(\cos\theta)|^2$, inverted via $O(\log_2 N)$ binary search and linear interpolation.
  - Uses deterministic `mulberry32` PRNG and preallocated `Float32Array` buffers (`positions`, `radii`, `phases`) with zero per-sample object allocations.
  - Verified with $200,000$ seeded samples per orbital to match analytical $\langle r \rangle$ and $\langle r^2 \rangle$ within $5$ standard errors.

## Non-Blocking Web Worker (`src/worker/sampler.worker.js`)

- **Progressive Streaming:** Emits batches of $20,000$ points (`DEFAULT_CHUNK_SIZE`) so the initial orbital structure renders in $\sim 15\text{ ms}$ while remaining points stream in the background.
- **Zero-Copy Memory Transfer:** Transfers `Float32Array` buffer ownership (`positions.buffer`, `radii.buffer`, `phases.buffer`) via `Transferable` objects in $O(1)$ time with zero serialization overhead.
- **Stale Request Cancellation:** Tags every chunk with `requestId` so rapid UI orbital switches ignore outdated worker batches.

## 3D WebGL Rendering Pipeline (`src/render/`)

- **Wavefunction Color Mapping (`colors.js`):**
  - **`phase` mode:** Maps real wavefunction sign ($\psi \ge 0$ vs. $\psi < 0$) to high-contrast electric cyan and coral-orange lobes, or complex phase $\varphi \in [-\pi, \pi]$ to a seamless $2\pi$-periodic cosine RGB wheel.
  - **`radius` & `single` modes:** Normalizes radial distance by the $99.5\%$ probability radius ($r_{995}$) or applies uniform monochrome glow, reusing preallocated `Float32Array` color buffers in place.
- **Zero-GC Three.js Point-Cloud Scene (`scene.js` & `vendor/`):**
  - Pinned Three.js (`v0.160.0`) and `OrbitControls` ES modules vendored in `vendor/` via `<script type="importmap">` for zero external CDN dependency.
  - Preallocates GPU `BufferGeometry` (`THREE.DynamicDrawUsage`) for up to $500,000$ points, streaming worker chunks progressively via `setDrawRange` with `THREE.AdditiveBlending`, `depthWrite: false`, trigonometric camera auto-framing (`computeCameraDistanceForRadius`), and $z \le 0$ cross-sectional nodal slicing.

## Interactive HUD, 2D Radial Plot & Orchestrator (`src/ui/` & `src/main.js`)

- **2D Radial Probability & Sample Histogram (`radial-plot.js`):** Overlays the analytical Schrödinger curve $P(r) = r^2 |R_{n,l}(r)|^2$ against the normalized empirical histogram ($\sum_b \hat{P}_b \Delta r = 1$) of streamed worker samples, with a marker at $\langle r \rangle$.
- **Reactive Quantum Controls & Telemetry (`controls.js`):** Enforces quantum selection rules ($0 \le l < n$, $|m| \le l$) dynamically, displays analytical vs. Monte Carlo observables ($E_n$, radial/angular nodes, $\langle r \rangle$), and provides instant GPU toggles (color mode, point size, auto-rotate, $z \le 0$ nodal cross-section).
- **Application Orchestrator (`main.js`):** Synchronizes URL hash state (`#n=3&l=2&m=0&real=1&points=120000`), streams progressive worker chunks into the 3D scene and 2D histogram, and runs an automated multi-scale FPS & Worker benchmark ($50\text{k} \dots 500\text{k}$ points).

## Measured Performance Benchmarks

### 1. In-Browser Web Worker & WebGL GPU Rendering (`3d_z²`, $(n,l,m)=(3,2,0)$)

Measured via the built-in **Automated FPS Benchmark** (`src/main.js` + `sampler.worker.js` + Three.js `BufferGeometry` with `AdditiveBlending`):

| Points | Worker Time (ms) | Mean FPS |
|-------:|-----------------:|---------:|
| 50,000 | 39.9 ms | 60 FPS |
| 100,000 | 58.8 ms | 60 FPS |
| 250,000 | 146.8 ms | 60 FPS |
| 500,000 | 336.9 ms | 60 FPS |

### 2. Algorithmic Sampler Comparison (`npm run bench` — Node.js)

Head-to-head comparison (`bench/sampling-bench.mjs`) between our **Factorized Inverse-CDF Sampler** ($100,000$ points) and a **Naive 3D Cartesian Box Rejection Sampler** ($5,000$ points):

| Orbital | Factorized CDF (100k ms) | Factorized (samples/s) | 3D Rejection Acceptance | 3D Rejection (samples/s) | Speedup |
|:--------|-------------------------:|-----------------------:|------------------------:|-------------------------:|--------:|
| `1s (1,0,0)` | 50.6 ms | 1,976,406 /s | 0.008% | 417 /s | **4739.6x** |
| `2p_z (2,1,0)` | 38.1 ms | 2,626,761 /s | 0.037% | 910 /s | **2886.6x** |
| `3d_z² (3,2,0)` | 43.3 ms | 2,308,456 /s | 0.059% | 2,608 /s | **885.1x** |
| `4f_z³ (4,3,0)` | 42.7 ms | 2,340,199 /s | 0.073% | 2,702 /s | **866.1x** |

## Project Structure

```text
Quantum-Orbital-Renderer/
├── .github/workflows/  # Automated GitHub Actions CI pipeline (node --test)
├── index.html          # Browser entry point (native ES module importmap & HUD layout)
├── src/
│   ├── physics/        # Pure ES modules (quantum-numbers, radial, angular, sampler)
│   ├── worker/         # Web Worker for non-blocking Float32Array point generation
│   ├── render/         # Three.js scene, additive blending point cloud & color maps
│   ├── ui/             # Quantum number controls, observables HUD & 2D radial plot
│   └── main.js         # Application orchestrator
├── vendor/             # Pinned Three.js and OrbitControls ES modules (zero CDN dependency)
├── test/               # Automated physics verification suite (*.spec.js via node --test)
└── bench/              # Node.js sampler performance benchmarks
```

## Scripts

- **Run locally in browser** (serves ES modules & Web Worker over HTTP, or use VS Code **Go Live**):
  ```bash
  python -m http.server 8080
  # Open http://localhost:8080
  ```
- **Run unit & physics verification tests** (requires Node.js $\ge 20$):
  ```bash
  npm test
  ```
- **Run sampler benchmarks**:
  ```bash
  npm run bench
  ```

## License

[MIT](LICENSE)
