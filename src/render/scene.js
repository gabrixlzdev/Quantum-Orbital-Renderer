/**
 * @fileoverview Three.js 3D Point-Cloud Scene Manager for Hydrogen Orbitals.
 * Uses pre-allocated BufferGeometry, AdditiveBlending, and progressive draw ranges
 * for zero-GC 60 FPS rendering of up to 500,000 quantum probability points.
 */

// Import the color mapper to compute RGB vertex buffers from wavefunction phase/radius
import { buildOrbitalColors, COLOR_MODES } from './colors.js';

/**
 * Computes the ideal camera distance along the Z-axis so a sphere of radius rMax
 * fits comfortably inside the vertical field-of-view frustum.
 *
 * Pure geometric formula: d = (rMax * margin) / tan(fov / 2)
 *
 * @param {number} rMax - Outer bounding radius of the orbital cloud (in Bohr radii a0).
 * @param {number} [fovDeg=50] - Camera vertical field of view in degrees.
 * @param {number} [margin=1.15] - Padding multiplier so outer lobes aren't clipped.
 * @returns {number} Camera distance along Z in Bohr radii (a0).
 */
export function computeCameraDistanceForRadius(rMax, fovDeg = 50, margin = 1.15) {
  // Guard against non-positive rMax by falling back to a minimum radius of 5 a0
  const safeR = rMax > 0 ? rMax : 5;
  // Convert the half-FOV angle from degrees to radians: (fov / 2) * (pi / 180)
  const halfFovRad = (fovDeg * 0.5 * Math.PI) / 180;
  // Compute distance from trigonometry: tan(theta) = opposite / adjacent => adjacent = opposite / tan(theta)
  return (safeR * margin) / Math.tan(halfFovRad);
}

/**
 * Creates and manages the interactive Three.js 3D orbital point-cloud scene.
 *
 * @param {HTMLCanvasElement} canvas - Target <canvas id="orbital-canvas"> element.
 * @param {object} [options={}] - Scene configuration options.
 * @param {number} [options.maxPoints=500000] - Maximum point capacity pre-allocated on GPU.
 * @param {number} [options.initialPointSize=0.18] - Initial world-space point size in a0.
 * @returns {Promise<object>} Scene controller API.
 */
export async function createOrbitalScene(canvas, options = {}) {
  // Dynamically import 'three' and 'OrbitControls' via the HTML importmap
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/OrbitControls.js');

  // Extract maximum GPU buffer capacity (default 500,000 points)
  const maxPoints = options.maxPoints || 500000;
  // Extract initial world-space point size
  let pointSize = options.initialPointSize || 0.18;
  // Store active color mode ('phase', 'radius', or 'single')
  let colorMode = 'phase';
  // Track whether current orbital is in real or complex harmonic mode
  let currentIsReal = true;

  // Check if the user's OS has 'prefers-reduced-motion: reduce' enabled for accessibility
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Create the Three.js scene container and set a deep space dark background
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060814);

  // Initialize the perspective camera with 50-degree vertical FOV and wide clipping planes
  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    2000
  );
  // Position the camera initially at (0, 0, 30) in Bohr radii
  camera.position.set(0, 0, 30);

  // Create the WebGLRenderer attached to our <canvas> element
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Cap devicePixelRatio at 2.0 to prevent 4K/Retina fill-rate bottlenecks with additive blending
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  // Enable local clipping planes so the user can slice the orbital along a nodal plane
  renderer.localClippingEnabled = true;

  // Attach OrbitControls so the user can rotate, pan, and zoom smoothly with mouse or touch
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  // Disable auto-rotation by default if the user prefers reduced motion
  controls.autoRotate = !prefersReducedMotion;
  controls.autoRotateSpeed = 1.0;

  // Create a subtle 3D coordinate axes helper (X=red, Y=green, Z=blue) scaled to 8 a0
  const axesHelper = new THREE.AxesHelper(8);
  axesHelper.material.transparent = true;
  axesHelper.material.opacity = 0.25;
  scene.add(axesHelper);

  // Pre-allocate contiguous Float32Arrays for 500,000 3D positions and RGB colors (6 MB each)
  const positionBuffer = new Float32Array(maxPoints * 3);
  const colorBuffer = new Float32Array(maxPoints * 3);
  // Also keep CPU copies of phases and radii so color mode switches are instant without re-sampling!
  const phasesBuffer = new Float32Array(maxPoints);
  const radiiBuffer = new Float32Array(maxPoints);

  // Create the GPU BufferGeometry and attach dynamic BufferAttributes
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positionBuffer, 3);
  const colorAttr = new THREE.BufferAttribute(colorBuffer, 3);
  // Hint to WebGL that these buffers will be updated frequently during streaming (GL_DYNAMIC_DRAW)
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('color', colorAttr);
  // Start with 0 visible points until the first worker chunk arrives
  geometry.setDrawRange(0, 0);

  // Define an optional clipping plane (y = 0 cross-section) to reveal internal radial nodes
  const slicePlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let sliceEnabled = false;

  // Create the PointsMaterial using vertex colors and AdditiveBlending for glowing volumetric density
  const material = new THREE.PointsMaterial({
    size: pointSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    clippingPlanes: [],
  });

  // Construct the THREE.Points mesh and add it to the scene
  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  // Track how many points have currently been streamed into the buffer
  let activePointCount = 0;
  // Track the current outer radius rMax and 99.5% radius r995 for radius color mapping and camera framing
  let currentRMax = 15;
  let currentR995 = 10;

  /**
   * Resets the point cloud draw range to 0 when starting a new orbital generation.
   *
   * @param {number} [rMax=15] - Estimated outer radius of the new orbital.
   * @param {boolean} [isReal=true] - Whether the orbital uses real spherical harmonics.
   */
  function clearCloud(rMax = 15, isReal = true) {
    activePointCount = 0;
    currentRMax = rMax > 0 ? rMax : 15;
    currentR995 = currentRMax * 0.7;
    currentIsReal = Boolean(isReal);
    geometry.setDrawRange(0, 0);
  }

  /**
   * Appends a streamed chunk of points from the Web Worker into the pre-allocated GPU buffers.
   *
   * @param {object} chunk - Worker chunk containing positions, phases, radii, rMax, and r995.
   * @param {boolean} [isReal=currentIsReal] - Whether real spherical harmonics are active.
   */
  function appendChunk(chunk, isReal = currentIsReal) {
    currentIsReal = Boolean(isReal);
    const chunkPoints = chunk.chunkCount ?? chunk.chunkPoints ?? 0;
    // Clamp so we never overflow the pre-allocated maxPoints buffer
    const availableSpace = Math.max(0, maxPoints - activePointCount);
    const countToCopy = Math.min(chunkPoints, availableSpace);
    if (countToCopy <= 0) return;

    if (chunk.rMax > 0) {
      currentRMax = chunk.rMax;
    }
    if (chunk.r995 > 0) {
      currentR995 = chunk.r995;
    }

    // Compute offsets in the 3D (x,y,z) and 1D (scalar) arrays
    const offset3 = activePointCount * 3;
    const offset1 = activePointCount;

    // Copy chunk positions into the master GPU position buffer
    positionBuffer.set(chunk.positions.subarray(0, countToCopy * 3), offset3);
    // Cache phases and radii so we can re-color instantaneously on UI toggle
    phasesBuffer.set(chunk.phases.subarray(0, countToCopy), offset1);
    radiiBuffer.set(chunk.radii.subarray(0, countToCopy), offset1);

    // Compute RGB colors directly into a subarray view of colorBuffer (zero heap allocation!)
    const colorSubarray = colorBuffer.subarray(offset3, offset3 + countToCopy * 3);
    buildOrbitalColors({
      radii: chunk.radii.subarray(0, countToCopy),
      phases: chunk.phases.subarray(0, countToCopy),
      r995: currentR995,
      isReal: currentIsReal,
      colorMode,
      outColors: colorSubarray,
    });

    // Advance the active point count and expand the GPU draw range
    activePointCount += countToCopy;
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, activePointCount);
  }

  /**
   * Re-colors all currently active points in-place when the user changes the color mode.
   *
   * @param {string} newMode - One of 'phase', 'radius', or 'single'.
   */
  function setColorMode(newMode) {
    if (COLOR_MODES.includes(newMode)) {
      colorMode = newMode;
    }
    if (activePointCount <= 0) return;

    buildOrbitalColors({
      radii: radiiBuffer.subarray(0, activePointCount),
      phases: phasesBuffer.subarray(0, activePointCount),
      r995: currentR995,
      isReal: currentIsReal,
      colorMode,
      outColors: colorBuffer.subarray(0, activePointCount * 3),
    });
    colorAttr.needsUpdate = true;
  }

  /**
   * Smoothly frames the camera around an orbital of bounding radius rMax.
   *
   * @param {number} rMax - Outer bounding radius in Bohr radii (a0).
   */
  function fitCameraToRadius(rMax) {
    currentRMax = rMax > 0 ? rMax : currentRMax;
    const dist = computeCameraDistanceForRadius(currentRMax, camera.fov);
    // Place camera slightly elevated along X/Y so 3D lobes and nodal planes are immediately visible
    camera.position.set(dist * 0.45, dist * 0.35, dist * 0.82);
    controls.target.set(0, 0, 0);
    controls.update();
    // Scale axes helper proportionally to the orbital size
    const axesScale = Math.max(1, currentRMax * 0.65 / 8);
    axesHelper.scale.set(axesScale, axesScale, axesScale);
  }

  /**
   * Updates the world-space size of each rendered point.
   *
   * @param {number} newSize - Point size in Bohr radii.
   */
  function setPointSize(newSize) {
    pointSize = Number(newSize) || 0.18;
    material.size = pointSize;
    material.needsUpdate = true;
  }

  /**
   * Toggles automatic camera rotation around the orbital.
   *
   * @param {boolean} enabled - Whether auto-rotation is active.
   */
  function setAutoRotate(enabled) {
    controls.autoRotate = Boolean(enabled);
  }

  /**
   * Toggles the cross-sectional clipping plane (z <= 0) to expose internal radial nodes.
   *
   * @param {boolean} enabled - Whether cross-section slicing is active.
   */
  function setSlicePlane(enabled) {
    sliceEnabled = Boolean(enabled);
    material.clippingPlanes = sliceEnabled ? [slicePlane] : [];
    material.needsUpdate = true;
  }

  /**
   * Resizes the WebGL viewport and updates the camera aspect ratio when the window resizes.
   */
  function handleResize() {
    const width = canvas.clientWidth;
    const height = Math.max(1, canvas.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  window.addEventListener('resize', handleResize);

  // Rolling FPS measurement state
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 60;
  let onFpsUpdate = null;
  let animationFrameId = null;

  /**
   * Main 60 FPS requestAnimationFrame render loop.
   *
   * @param {number} now - High-resolution timestamp from requestAnimationFrame.
   */
  function animate(now) {
    animationFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);

    frameCount++;
    const elapsed = now - lastFpsTime;
    if (elapsed >= 500) {
      currentFps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastFpsTime = now;
      if (typeof onFpsUpdate === 'function') {
        onFpsUpdate(currentFps);
      }
    }
  }

  // Start the animation loop immediately
  animationFrameId = requestAnimationFrame(animate);

  // Return the public scene controller interface
  return {
    clearCloud,
    appendChunk,
    setColorMode,
    fitCameraToRadius,
    setPointSize,
    setAutoRotate,
    setSlicePlane,
    handleResize,
    getActivePointCount: () => activePointCount,
    getCurrentFps: () => currentFps,
    setFpsCallback: (cb) => {
      onFpsUpdate = cb;
    },
    dispose: () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}