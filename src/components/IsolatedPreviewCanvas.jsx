import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createIsolatedViewSession, getPreviewCamera } from './isolatedPreview'

let nextViewId = 0

/** Host controls only; all generated objects, rendering and animation stay remote. */
const IsolatedPreviewCanvas = forwardRef(function IsolatedPreviewCanvas({ asset, batch, continuityKey, onReady }, ref) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const [error, setError] = useState(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const gridSize = batch?.gridSize
  const spacing = batch?.spacing
  const rotationJitter = batch?.rotationJitter
  const scaleJitter = batch?.scaleJitter

  useImperativeHandle(ref, () => ({
    async setOptimization(enabled) {
      const session = viewRef.current?.session
      if (!session) throw new Error('Preview is not ready.')
      return session.setOptimization(enabled)
    },
    async exportGLB() {
      const session = viewRef.current?.session
      if (!session) throw new Error('Preview is not ready.')
      return session.exportGLB()
    },
    async captureThumbnail(width = 256, height = 256, expectedAsset) {
      if (expectedAsset && expectedAsset !== asset) return null
      const release = asset.retain?.()
      try {
        await viewRef.current?.session?.ready
        return await asset.captureThumbnail(width, height)
      }
      finally { release?.() }
    },
  }), [asset])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame = null

    // A view owns one bitmap presentation surface; no generated code runs here.
    const canvas = document.createElement('canvas')
    canvas.className = 'block w-full h-full'
    container.appendChild(canvas)
    let view
    try {
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('This browser does not support isolated previews (OffscreenCanvas is required). You can still save or export the source.')
      }
      const measure = () => ({
        width: Math.max(1, Math.round(container.clientWidth)),
        height: Math.max(1, Math.round(container.clientHeight)),
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      const size = measure()
      const camera = new PerspectiveCamera(60, size.width / size.height, 0.1, 1000)
      let controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray() })
      view = { canvas, camera, controls, measure, cameraState, size, session: null, initialized: false }
      view.resetControls = () => {
        // A different asset gets a fresh interaction state, not the previous
        // asset's residual pan/rotation damping or active pointer gesture.
        controls.dispose()
        controls = new OrbitControls(camera, canvas)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        view.controls = controls
      }
      viewRef.current = view
      let lastSent = 0
      const animateControls = now => {
        controls.update()
        // Damping stays smooth locally; remote updates are changed-only and bounded.
        if (view.session && now - lastSent >= 33) { lastSent = now; view.session.setCamera(cameraState()) }
        frame = requestAnimationFrame(animateControls)
      }
      frame = requestAnimationFrame(animateControls)
      const handleResize = () => {
        const nextSize = measure()
        if (Object.keys(nextSize).every(key => nextSize[key] === view.size[key])) return
        view.size = nextSize
        camera.aspect = nextSize.width / nextSize.height
        const nextFit = getPreviewCamera(view.bounds, camera.aspect, view.batch)
        // Keep the user's orbit, pan and relative zoom while adapting the frame.
        if (view.initialized) camera.position.sub(controls.target).multiplyScalar(nextFit.distance / view.fittedDistance).add(controls.target)
        view.fittedDistance = nextFit.distance
        const currentDistance = camera.position.distanceTo(controls.target)
        controls.minDistance = Math.min(controls.minDistance, currentDistance)
        controls.maxDistance = Math.max(50, nextFit.distance * 5, currentDistance)
        camera.updateProjectionMatrix()
        view.session?.resize(nextSize)
        view.session?.setCamera(cameraState())
      }
      const observer = new ResizeObserver(handleResize)
      observer.observe(container)
      window.addEventListener('resize', handleResize)
      view.cleanup = () => {
        observer.disconnect()
        window.removeEventListener('resize', handleResize)
        controls.dispose()
      }
    } catch (error) {
      setError(error?.message || String(error))
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      view?.session?.close()
      view?.cleanup?.()
      viewRef.current = null
      canvas.remove()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !asset) return
    const { camera, canvas } = view
    const batchOptions = gridSize == null ? undefined : { gridSize, spacing, rotationJitter, scaleJitter }
    const batchKey = JSON.stringify(batchOptions)
    const identity = continuityKey ?? asset
    const preserveCamera = view.initialized && identity === view.identity && batchKey === view.batchKey
    if (view.initialized && !preserveCamera) view.resetControls()
    const { controls } = view
    view.bounds = asset.runtimeSignals?.bounds
    view.batch = batchOptions
    view.size = view.measure()
    camera.aspect = view.size.width / view.size.height
    const fit = getPreviewCamera(view.bounds, camera.aspect, batchOptions)
    view.fittedDistance = fit.distance
    if (!preserveCamera) {
      camera.position.fromArray(fit.position)
      controls.target.fromArray(fit.target)
    }
    controls.enabled = true
    const currentDistance = camera.position.distanceTo(controls.target)
    controls.minDistance = Math.min(1, fit.distance / 10, preserveCamera ? currentDistance : Infinity)
    controls.maxDistance = Math.max(50, fit.distance * 5, preserveCamera ? currentDistance : 0)
    controls.update()
    camera.updateProjectionMatrix()
    Object.assign(view, { initialized: true, identity, batchKey })
    canvas.setAttribute('aria-label', gridSize ? 'Batch asset preview' : 'Asset preview')
    setError(null)
    let active = true
    onReadyRef.current?.(null)
    const session = createIsolatedViewSession(asset, `${batchOptions ? 'batch' : 'preview'}-${++nextViewId}`,
      canvas, { ...view.size, camera: view.cameraState(), ...(batchOptions ? { batch: batchOptions } : {}) }, error => {
        if (!active) return
        setError(error?.message || String(error || 'Preview failed'))
        onReadyRef.current?.(null)
        controls.enabled = false
      })
    view.session = session
    session.ready.then(() => {
      if (active && session.isReady()) onReadyRef.current?.(batchKey)
    })
    session.setCamera(view.cameraState())
    return () => {
      active = false
      onReadyRef.current?.(null)
      if (view.session === session) view.session = null
      // Keep the presentation surface and its last bitmap until the new worker
      // supplies a frame. Detaching a runtime must never clear the host canvas.
      session.close()
    }
  }, [asset, continuityKey, gridSize, spacing, rotationJitter, scaleJitter])

  return (
    <div className="relative w-full h-full bg-gray-900" style={{ minHeight: '400px' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div role="alert" className="absolute inset-x-4 top-4 p-3 rounded bg-red-950/90 text-red-200 text-sm">
          Preview unavailable: {error}
        </div>
      )}
    </div>
  )
})

export default IsolatedPreviewCanvas
