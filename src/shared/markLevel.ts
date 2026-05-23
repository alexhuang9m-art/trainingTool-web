import type { AnnotationShape, BlurLevel } from './types'

export type ImageMarkLevel = BlurLevel

/** Label used in folder export JSON (`mark` field). */
export type ExportMark = BlurLevel | 'clear'

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

export function exportMarkFromShapes(shapes: AnnotationShape[]): ExportMark {
  return markLevelFromShapes(shapes) ?? 'clear'
}

export type ExportedImageRecord = {
  imagePath: string
  basename: string
  mark: ExportMark
  shapes: AnnotationShape[]
}

export function toExportedImage(
  imagePath: string,
  basename: string,
  shapes: AnnotationShape[],
): ExportedImageRecord {
  return {
    imagePath,
    basename,
    mark: exportMarkFromShapes(shapes),
    shapes,
  }
}
