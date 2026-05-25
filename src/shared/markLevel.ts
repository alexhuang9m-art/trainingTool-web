import type { AnnotationShape, BlurLevel } from './types'

export type ImageMarkLevel = BlurLevel

/** Label used in folder export JSON (`mark` field). */
export type ExportMark = BlurLevel | 'clear'

function blurLevelFromShape(shape: AnnotationShape): BlurLevel | null {
  const raw = shape.level
  if (raw === 'P0' || raw === 'P1') return raw
  return null
}

/**
 * Sidebar dot / selection ring color for a photo.
 * Any P0 shape wins over P1, across all annotation types on the image.
 */
export function markLevelFromShapes(shapes: AnnotationShape[]): ImageMarkLevel | null {
  let hasP0 = false
  let hasP1 = false
  for (const shape of shapes) {
    const level = blurLevelFromShape(shape)
    if (level === 'P0') hasP0 = true
    else if (level === 'P1') hasP1 = true
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
