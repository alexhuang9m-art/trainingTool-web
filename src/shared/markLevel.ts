import type { AnnotationShape, BlurLevel } from './types'

export type ImageMarkLevel = BlurLevel

export function markLevelFromShapes(shapes: AnnotationShape[]): ImageMarkLevel | null {
  let hasP0 = false
  let hasP1 = false
  for (const s of shapes) {
    if (s.level === 'P0') hasP0 = true
    if (s.level === 'P1') hasP1 = true
  }
  if (hasP0) return 'P0'
  if (hasP1) return 'P1'
  return null
}
