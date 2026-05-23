import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnnotationStroke, BlurLevel, StrokePoint } from '../shared/types'

const LEVEL_COLOR: Record<BlurLevel, string> = {
  P0: '#ff3b30',
  P1: '#ff9500',
}

const STROKE_WIDTH = 14

type Props = {
  imageUrl: string
  strokes: AnnotationStroke[]
  activeLevel: BlurLevel
  onChange: (strokes: AnnotationStroke[]) => void
}

function newId() {
  return crypto.randomUUID()
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  scale: number,
) {
  if (stroke.points.length < 2) return
  ctx.strokeStyle = LEVEL_COLOR[stroke.level]
  ctx.lineWidth = stroke.width * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const [first, ...rest] = stroke.points
  ctx.moveTo(first.x * scale, first.y * scale)
  for (const p of rest) ctx.lineTo(p.x * scale, p.y * scale)
  ctx.stroke()
}

export function AnnotationCanvas({ imageUrl, strokes, activeLevel, onChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })

  const syncCanvasSize = useCallback(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth) return
    const rect = img.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w < 1 || h < 1) return
    canvas.width = w
    canvas.height = h
    setDisplaySize({ w, h })
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  const scaleX = naturalSize.w > 0 ? displaySize.w / naturalSize.w : 1

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scale = scaleX
    for (const s of strokes) drawStroke(ctx, s, scale)
    const cur = currentPointsRef.current
    if (cur.length >= 2) {
      drawStroke(
        ctx,
        { id: '_preview', level: activeLevel, points: cur, width: STROKE_WIDTH },
        scale,
      )
    }
  }, [strokes, scaleX, activeLevel])

  useEffect(() => {
    redraw()
  }, [redraw, displaySize])

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const ro = new ResizeObserver(() => {
      syncCanvasSize()
      redraw()
    })
    ro.observe(img)
    return () => ro.disconnect()
  }, [syncCanvasSize, redraw, imageUrl])

  const toImageCoords = (clientX: number, clientY: number): StrokePoint | null => {
    const img = imgRef.current
    if (!img || !naturalSize.w) return null
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * naturalSize.w
    const y = ((clientY - rect.top) / rect.height) * naturalSize.h
    if (x < 0 || y < 0 || x > naturalSize.w || y > naturalSize.h) return null
    return { x, y }
  }

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    currentPointsRef.current = [pt]
    redraw()
  }

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return
    const pts = currentPointsRef.current
    const last = pts[pts.length - 1]
    const dx = pt.x - last.x
    const dy = pt.y - last.y
    if (dx * dx + dy * dy < 4) return
    pts.push(pt)
    redraw()
  }

  const finishStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const pts = currentPointsRef.current
    currentPointsRef.current = []
    if (pts.length >= 2) {
      onChange([
        ...strokes,
        { id: newId(), level: activeLevel, points: [...pts], width: STROKE_WIDTH },
      ])
    }
    redraw()
  }

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    finishStroke()
  }

  return (
    <div className="annotation-stage">
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        onLoad={() => {
          syncCanvasSize()
          redraw()
        }}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        style={{ width: displaySize.w || undefined, height: displaySize.h || undefined }}
      />
    </div>
  )
}
