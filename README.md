# Quantum-Orbital-Renderer

Interactive 3D viewer of hydrogen-atom orbitals ($\psi_{n,l,m}$) in vanilla JavaScript and Three.js, featuring physically verified factorized inverse-CDF sampling in a Web Worker.

## Overview

This project visualizes the electronic probability density $|\psi_{n,l,m}(r, \theta, \phi)|^2$ of the non-relativistic, spinless hydrogen atom ($Z = 1$) in atomic units ($a_0 = 1$) as a real-time 3D point cloud.

- **Radial Wavefunction $R_{n,l}(r)$:** Generalized Laguerre polynomials via stable recurrence relations.
- **Angular Wavefunction $Y_l^m(\theta, \phi)$:** Associated Legendre functions in both complex and real orbital forms.
- **High-Performance Sampling:** Factorized inverse Cumulative Distribution Function (CDF) sampling offloaded to a Web Worker with zero-copy `Float32Array` buffer transfers.

## Status

Work in progress — full implementation, unit test suite (`node --test`), and benchmarks are being developed on a feature branch.

## License

[MIT](LICENSE)
