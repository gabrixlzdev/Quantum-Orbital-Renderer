# Quantum-Orbital-Renderer

Interactive 3D viewer of hydrogen-atom orbitals ($\psi_{n,l,m}$) in vanilla JavaScript and Three.js, featuring physically verified factorized inverse-CDF sampling in a Web Worker.

## Overview

This project visualizes the electronic probability density $|\psi_{n,l,m}(r, \theta, \phi)|^2$ of the non-relativistic, spinless hydrogen atom ($Z = 1$) in atomic units ($a_0 = 1$) as a real-time 3D point cloud.

- **Radial Wavefunction $R_{n,l}(r)$:** Generalized Laguerre polynomials via stable recurrence relations.
- **Angular Wavefunction $Y_l^m(\theta, \phi)$:** Associated Legendre functions in both complex and real orbital forms.
- **High-Performance Sampling:** Factorized inverse Cumulative Distribution Function (CDF) sampling offloaded to a Web Worker with zero-copy `Float32Array` buffer transfers.

## Project Structure

```text
Quantum-Orbital-Renderer/
├── index.html          # Browser entry point (native ES module importmap & HUD layout)
├── src/
│   ├── physics/        # Pure ES modules (radial, angular, factorized inverse-CDF sampler)
│   ├── worker/         # Web Worker for non-blocking Float32Array point generation
│   ├── render/         # Three.js scene, additive blending point cloud & color maps
│   ├── ui/             # Quantum number controls, observables HUD & 2D radial plot
│   └── main.js         # Application orchestrator
├── vendor/             # Pinned Three.js and OrbitControls ES modules (zero CDN dependency)
├── test/               # Automated physics verification suite (node --test)
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
