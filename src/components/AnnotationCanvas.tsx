import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspaceZoom } from '../hooks/useWorkspaceZoom'
import type {
  AnnotationBox,
  AnnotationBrush,
  AnnotationPolyline,
  AnnotationShape,
  AnnotTool,
  BlurLevel,
  StrokePoint,
} from '../shared/types'

const LEVEL_COLOR: Record<BlurLevel, string> = {
  P0: '#ff3b30',
  P1: '#ff9500',
}

const LINE_WIDTH = 14
const BOX_LINE_WIDTH = 3
const CLOSE_SNAP_FACTOR = 1.25

type Props = {
  imageUrl: string
  shapes: AnnotationShape[]
  activeLevel: BlurLevel
  activeTool: AnnotTool
  onChange: (shapes: AnnotationShape[]) => void
}

function newId() {
  return crypto.randomUUID()
}

function pointDist(a: StrokePoint, b: StrokePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function closeSnapThreshold(lineWidth: number) {
  return lineWidth * CLOSE_SNAP_FACTOR
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  line: { level: BlurLevel; points: StrokePoint[]; width: number; closed?: boolean },
  scale: number,
  options?: { dashed?: boolean; showAnchors?: boolean },
) {
  const pts = line.points
  if (pts.length === 0) return

  const color = LEVEL_COLOR[line.level]
  const lineW = line.width * scale
  const anchorR = lineW / 2

  if (pts.length >= 2) {
    ctx.strokeStyle = color
    ctx.lineWidth = lineW
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (options?.dashed) ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * scale, pts[i].y * scale)
    }
    if (line.closed) ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (options?.showAnchors !== false) {
    for (const p of pts) {
      ctx.beginPath()
      ctx.fillStyle = color
      ctx.arc(p.x * scale, p.y * scale, anchorR, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  box: AnnotationBox,
  scale: number,
  dashed = false,
) {
  const x = Math.min(box.x1, box.x2) * scale
  const y = Math.min(box.y1, box.y2) * scale
  const w = Math.abs(box.x2 - box.x1) * scale
  const h = Math.abs(box.y2 - box.y1) * scale
  if (w < 1 && h < 1) return
  ctx.strokeStyle = LEVEL_COLOR[box.level]
  ctx.lineWidth = BOX_LINE_WIDTH
  if (dashed) ctx.setLineDash([6, 4])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}

function isPolylineLike(shape: AnnotationShape): shape is AnnotationPolyline | AnnotationBrush {
  return shape.kind === 'polyline' || shape.kind === 'brush'
}

export function AnnotationCanvas({
  imageUrl,
  shapes,
  activeLevel,
  activeTool,
  onChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const polylinePointsRef = useRef<StrokePoint[]>([])
  const polylineCursorRef = useRef<StrokePoint | null>(null)
  const boxStartRef = useRef<StrokePoint | null>(null)
  const boxPreviewRef = useRef<StrokePoint | null>(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })

  const { transform, centerStage, resetView, isDefaultView } = useWorkspaceZoom(hostRef)

  const layoutStage = useCallback(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth) return null
    const w = Math.round(img.offsetWidth)
    const h = Math.round(img.offsetHeight)
    if (w < 1 || h < 1) return null
    canvas.width = w
    canvas.height = h
    setDisplaySize({ w, h })
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    return { w, h }
  }, [])

  const scaleX = naturalSize.w > 0 ? displaySize.w / naturalSize.w : 1

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const shape of shapes) {
      if (isPolylineLike(shape)) {
        drawPolyline(ctx, shape, scaleX)
      } else {
        drawBox(ctx, shape, scaleX)
      }
    }

    const draft = polylinePointsRef.current
    const cursor = polylineCursorRef.current
    if (activeTool === 'polyline' && draft.length > 0) {
      const snap = cursor && draft.length >= 2 && pointDist(draft[0], cursor) <= closeSnapThreshold(LINE_WIDTH)
      const previewPts = cursor && !snap ? [...draft, cursor] : draft
      const previewClosed = Boolean(snap && draft.length >= 2)
      drawPolyline(
        ctx,
        { level: activeLevel, points: previewPts, width: LINE_WIDTH, closed: previewClosed },
        scaleX,
        { dashed: Boolean(cursor && !previewClosed), showAnchors: true },
      )
    }

    const start = boxStartRef.current
    const preview = boxPreviewRef.current
    if (activeTool === 'box' && start && preview) {
      drawBox(
        ctx,
        {
          kind: 'box',
          id: '_preview',
          level: activeLevel,
          x1: start.x,
          y1: start.y,
          x2: preview.x,
          y2: preview.y,
        },
        scaleX,
        true,
      )
    }
  }, [shapes, scaleX, activeLevel, activeTool])

  const finishPolyline = useCallback(
    (commit: boolean, closed = false) => {
      const pts = polylinePointsRef.current
      polylinePointsRef.current = []
      polylineCursorRef.current = null
      if (commit && pts.length >= 2) {
        onChange([
          ...shapes,
          {
            kind: 'polyline',
            id: newId(),
            level: activeLevel,
            points: [...pts],
            width: LINE_WIDTH,
            closed: closed || undefined,
          },
        ])
      } else {
        redraw()
      }
    },
    [shapes, activeLevel, onChange, redraw],
  )

  useEffect(() => {
    redraw()
  }, [redraw, displaySize])

  useEffect(() => {
    if (activeTool !== 'polyline' && polylinePointsRef.current.length > 0) {
      finishPolyline(polylinePointsRef.current.length >= 2, false)
    }
    boxStartRef.current = null
    boxPreviewRef.current = null
    if (activeTool !== 'polyline') {
      polylinePointsRef.current = []
      polylineCursorRef.current = null
    }
    redraw()
  }, [activeTool, imageUrl, finishPolyline, redraw])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTool !== 'polyline') return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        finishPolyline(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTool, finishPolyline])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => {
      const size = layoutStage()
      if (size && isDefaultView) centerStage(size.w, size.h)
      redraw()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [layoutStage, centerStage, redraw, imageUrl, isDefaultView])

  useEffect(() => {
    const size = layoutStage()
    if (size) centerStage(size.w, size.h)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset view when switching images
  }, [imageUrl])

  const toImageCoords = (clientX: number, clientY: number): StrokePoint | null => {
    const img = imgRef.current
    if (!img || !naturalSize.w) return null
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * naturalSize.w
    const y = ((clientY - rect.top) / rect.height) * naturalSize.h
    if (x < 0 || y < 0 || x > naturalSize.w || y > naturalSize.h) return null
    return { x, y }
  }

  const commitBox = (end: StrokePoint) => {
    const start = boxStartRef.current
    if (!start) return
    const w = Math.abs(end.x - start.x)
    const h = Math.abs(end.y - start.y)
    if (w >= 2 || h >= 2) {
      onChange([
        ...shapes,
        {
          kind: 'box',
          id: newId(),
          level: activeLevel,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
        },
      ])
    }
    boxStartRef.current = null
    boxPreviewRef.current = null
    redraw()
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return

    if (activeTool === 'polyline') {
      const draft = polylinePointsRef.current
      if (
        draft.length >= 2 &&
        pointDist(draft[0], pt) <= closeSnapThreshold(LINE_WIDTH)
      ) {
        finishPolyline(true, true)
        return
      }
      polylinePointsRef.current.push(pt)
      polylineCursorRef.current = pt
      redraw()
      return
    }

    if (activeTool !== 'box') return

    if (!boxStartRef.current) {
      boxStartRef.current = pt
      boxPreviewRef.current = pt
      redraw()
      return
    }

    commitBox(pt)
  }

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return

    if (activeTool === 'polyline' && polylinePointsRef.current.length > 0) {
      polylineCursorRef.current = pt
      redraw()
      return
    }

    if (activeTool === 'box' && boxStartRef.current) {
      boxPreviewRef.current = pt
      redraw()
    }
  }

  const pointerLeave = () => {
    if (activeTool === 'polyline') {
      polylineCursorRef.current = null
      redraw()
    }
  }

  return (
    <div ref={hostRef} className="annotation-workspace-host">
      <div
        className="annotation-viewport"
        style={{
          transform: `translate(${transform.pan.x}px, ${transform.pan.y}px) scale(${transform.scale})`,
        }}
      >
        <div ref={stageRef} className="annotation-stage">
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={() => {
              const size = layoutStage()
              if (size) centerStage(size.w, size.h)
              redraw()
            }}
          />
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onPointerMove={pointerMove}
            onPointerLeave={pointerLeave}
            style={{
              width: displaySize.w || undefined,
              height: displaySize.h || undefined,
              cursor: 'crosshair',
            }}
          />
        </div>
      </div>
      {!isDefaultView ? (
        <button
          type="button"
          className="zoom-reset-btn"
          onClick={() => resetView(displaySize.w, displaySize.h)}
          title="重置缩放"
        >
          重置缩放 ({Math.round(transform.scale * 100)}%)
        </button>
      ) : null}
    </div>
  )
}
