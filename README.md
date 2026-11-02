# Quantum-Orbital-Renderer

[![CI](https://github.com/gabrixlzdev/Quantum-Orbital-Renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrixlzdev/Quantum-Orbital-Renderer/actions/workflows/ci.yml)

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
