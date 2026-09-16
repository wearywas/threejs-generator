import React, { useRef, useLayoutEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { disposeObject } from '../runtime/assetDisposal'
import { canRenderOnDemand } from '../runtime/renderPolicy'

/** Owns preview redraw decisions without changing the animation clock cadence. */
export function createPreviewRenderState(renderer, controls) {
  let renderOnDemand = false
  let needsRender = true
  const invalidate = () => { needsRender = true }
  controls.addEventListener('change', invalidate)

  return {
    setAsset(asset) {
      // An empty local scene is also static. Unknown assets remain continuous.
      renderOnDemand = asset == null || canRenderOnDemand(asset)
      renderer.shadowMap.autoUpdate = !renderOnDemand
      renderer.shadowMap.needsUpdate = true
      invalidate()
    },
    invalidate,
    render(scene, camera, force = false) {
      if (renderOnDemand && !needsRender && !force) return
      needsRender = false
      renderer.render(scene, camera)
    },
    dispose() { controls.removeEventListener('change', invalidate) },
  }
}

/** Capture at thumbnail size, then restore and redraw the visible preview. */
export async function captureLocalPreviewThumbnail({ renderer, scene, camera, controls, asset, renderState }, width, height) {
  const originalWidth = renderer.domElement.width
  const originalHeight = renderer.domElement.height
  const originalPixelRatio = renderer.getPixelRatio()
  const originalCameraPosition = camera.position.clone()
  const originalTarget = controls?.target.clone() || new THREE.Vector3()

  try {
    const box = new THREE.Box3().setFromObject(asset.root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 2.5

    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    )
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderState.render(scene, camera, true)
    return renderer.domElement.toDataURL('image/png')
  } finally {
    renderer.setPixelRatio(originalPixelRatio)
    renderer.setSize(originalWidth / originalPixelRatio, originalHeight / originalPixelRatio, false)
    camera.position.copy(originalCameraPosition)
    camera.aspect = (originalWidth / originalPixelRatio) / (originalHeight / originalPixelRatio)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(originalTarget)
      controls.update()
    }
    renderState.render(scene, camera, true)
  }
}

const LocalPreviewCanvas = forwardRef(function LocalPreviewCanvas({ asset }, ref) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const clockRef = useRef(null)
  const currentAssetRef = useRef(null)
  const animationIdRef = useRef(null)
  const renderStateRef = useRef(null)

  // Expose captureThumbnail method to parent components
  useImperativeHandle(ref, () => ({
    captureThumbnail: async (width = 256, height = 256, expectedAsset) => {
      if (expectedAsset && currentAssetRef.current !== expectedAsset) return null
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !currentAssetRef.current) {
        return null
      }

      return captureLocalPreviewThumbnail({
        renderer: rendererRef.current,
        scene: sceneRef.current,
        camera: cameraRef.current,
        controls: controlsRef.current,
        asset: currentAssetRef.current,
        renderState: renderStateRef.current,
      }, width, height)
    }
  }), [])

  // Initialize ThreeJS scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    camera.position.set(5, 4, 5)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 1
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls
    const renderState = createPreviewRenderState(renderer, controls)
    renderStateRef.current = renderState

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(5, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 50
    directionalLight.shadow.camera.left = -10
    directionalLight.shadow.camera.right = 10
    directionalLight.shadow.camera.top = 10
    directionalLight.shadow.camera.bottom = -10
    scene.add(directionalLight)

    // Subtle fill light
    const fillLight = new THREE.DirectionalLight(0xffd97d, 0.3)
    fillLight.position.set(-5, 3, -5)
    scene.add(fillLight)

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x2a2a2a)
    gridHelper.position.y = -0.01
    scene.add(gridHelper)

    // Axes helper (subtle)
    const axesHelper = new THREE.AxesHelper(2)
    axesHelper.position.set(-9, 0, -9)
    scene.add(axesHelper)

    // Ground plane (for shadows)
    const groundGeometry = new THREE.PlaneGeometry(20, 20)
    const groundMaterial = new THREE.ShadowMaterial({
      opacity: 0.3
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Clock for animation
    clockRef.current = new THREE.Clock()

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)

      const delta = clockRef.current.getDelta()
      const elapsed = clockRef.current.getElapsedTime()

      // Update controls
      controls.update()

      // Update current asset animation if it has a tick or update function
      if (currentAssetRef.current?.tick) {
        currentAssetRef.current.tick(elapsed, delta)
      } else if (currentAssetRef.current?.update) {
        currentAssetRef.current.update(elapsed, delta)
      }

      renderState.render(scene, camera)
    }

    animate()

    // Handle resize
    const handleResize = () => {
      if (!container) return
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight

      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
      renderState.invalidate()
    }

    window.addEventListener('resize', handleResize)

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      renderState.dispose()
      controls.dispose()
      disposeObject(ground)
      disposeObject(gridHelper)
      disposeObject(axesHelper)
      directionalLight.shadow.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Initialize scene on mount
  useLayoutEffect(() => {
    const cleanup = initScene()
    return cleanup
  }, [initScene])

  // Handle asset changes
  useLayoutEffect(() => {
    if (!sceneRef.current) return

    // Remove previous asset
    if (currentAssetRef.current?.root) {
      sceneRef.current.remove(currentAssetRef.current.root)
    }

    // Add new asset
    if (asset?.root) {
      const scene = sceneRef.current
      const release = asset.retain?.()
      scene.add(asset.root)
      currentAssetRef.current = asset
      renderStateRef.current.setAsset(asset)

      // Auto-fit camera to asset
      fitCameraToObject(asset.root, cameraRef.current, controlsRef.current)
      return () => {
        scene.remove(asset.root)
        currentAssetRef.current = null
        renderStateRef.current.setAsset(null)
        release?.()
      }
    } else {
      currentAssetRef.current = null
      renderStateRef.current.setAsset(null)
    }
  }, [asset])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-900"
      style={{ minHeight: '400px' }}
    />
  )
})

export default LocalPreviewCanvas

// Helper to fit camera to object bounds
function fitCameraToObject(object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5

  // Minimum distance
  cameraDistance = Math.max(cameraDistance, 3)

  const direction = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize()
    .multiplyScalar(cameraDistance)

  camera.position.copy(center).add(direction)
  controls.target.copy(center)
  controls.update()
}
