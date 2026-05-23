import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

const MIN_SCALE = 1
const MAX_SCALE = 12

export type ViewTransform = {
  scale: number
  pan: { x: number; y: number }
}

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

function touchDistance(touches: TouchList) {
  if (touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function touchCenter(touches: TouchList) {
  if (touches.length < 2) return { x: 0, y: 0 }
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

export function useWorkspaceZoom(containerRef: RefObject<HTMLElement | null>) {
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, pan: { x: 0, y: 0 } })
  const pinchRef = useRef({ distance: 0, active: false })

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const host = containerRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top

    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor)
      if (nextScale === prev.scale) return prev
      const wx = (px - prev.pan.x) / prev.scale
      const wy = (py - prev.pan.y) / prev.scale
      return {
        scale: nextScale,
        pan: { x: px - wx * nextScale, y: py - wy * nextScale },
      }
    })
  }, [containerRef])

  const centerStage = useCallback((stageWidth: number, stageHeight: number) => {
    const host = containerRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    setTransform({
      scale: 1,
      pan: {
        x: Math.max(0, (rect.width - stageWidth) / 2),
        y: Math.max(0, (rect.height - stageHeight) / 2),
      },
    })
  }, [containerRef])

  const resetView = useCallback(
    (stageWidth: number, stageHeight: number) => {
      centerStage(stageWidth, stageHeight)
    },
    [centerStage],
  )

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    const blockGesture = (e: Event) => e.preventDefault()

    const onWheel = (e: WheelEvent) => {
      // 阻止浏览器页面缩放（触控板双指捏合会带 ctrlKey）
      e.preventDefault()
      e.stopPropagation()
      const factor = Math.exp(-e.deltaY * 0.01)
      zoomAt(e.clientX, e.clientY, factor)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { distance: touchDistance(e.touches), active: true }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current.active) return
      e.preventDefault()
      const dist = touchDistance(e.touches)
      const prev = pinchRef.current.distance
      if (prev < 1) {
        pinchRef.current.distance = dist
        return
      }
      const factor = dist / prev
      const center = touchCenter(e.touches)
      zoomAt(center.x, center.y, factor)
      pinchRef.current.distance = dist
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = { distance: 0, active: false }
      }
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('touchstart', onTouchStart, { passive: true })
    host.addEventListener('touchmove', onTouchMove, { passive: false })
    host.addEventListener('touchend', onTouchEnd)
    host.addEventListener('touchcancel', onTouchEnd)
    host.addEventListener('gesturestart', blockGesture, { passive: false })
    host.addEventListener('gesturechange', blockGesture, { passive: false })
    host.addEventListener('gestureend', blockGesture, { passive: false })

    return () => {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('touchcancel', onTouchEnd)
      host.removeEventListener('gesturestart', blockGesture)
      host.removeEventListener('gesturechange', blockGesture)
      host.removeEventListener('gestureend', blockGesture)
    }
  }, [containerRef, zoomAt])

  const isDefaultView = transform.scale === 1

  return { transform, zoomAt, centerStage, resetView, isDefaultView }
}
