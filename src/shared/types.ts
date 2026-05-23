export type BlurLevel = 'P0' | 'P1'

export type StrokePoint = { x: number; y: number }

/** @deprecated Legacy freehand; rendered as connected segments */
export type AnnotationBrush = {
  kind: 'brush'
  id: string
  level: BlurLevel
  points: StrokePoint[]
  width: number
}

export type AnnotationPolyline = {
  kind: 'polyline'
  id: string
  level: BlurLevel
  points: StrokePoint[]
  width: number
  /** When true, last point connects back to the first */
  closed?: boolean
}

export type AnnotationBox = {
  kind: 'box'
  id: string
  level: BlurLevel
  x1: number
  y1: number
  x2: number
  y2: number
}

export type AnnotationShape = AnnotationPolyline | AnnotationBox | AnnotationBrush

/** @deprecated Use AnnotationShape */
export type AnnotationStroke = AnnotationBrush | AnnotationPolyline

export type ImageAnnotation = {
  imagePath: string
  shapes: AnnotationShape[]
  version: 1
  updatedAt?: string
  strokes?: (AnnotationBrush | AnnotationPolyline)[]
}

export type MediaListItem = {
  absolutePath: string
  basename: string
  kind: 'image'
}

export type ChildFolderInfo = {
  id: string
  name: string
  absolutePath: string
}

export type FoldersPickResult = {
  roots: string[]
  added: string
}

export type MediaCountBatch = Record<string, number>

export type LocalImageItem = {
  id: string
  name: string
  objectUrl: string
  file?: File
}

export type WorkspaceImage =
  | { source: 'bridge'; absolutePath: string; name: string }
  | { source: 'browser'; id: string; name: string; objectUrl: string }

export type AnnotTool = 'polyline' | 'box'

export function normalizeShapes(doc: {
  shapes?: AnnotationShape[]
  strokes?: (AnnotationBrush | AnnotationPolyline)[]
}): AnnotationShape[] {
  if (doc.shapes?.length) return doc.shapes
  if (doc.strokes?.length) {
    return doc.strokes as AnnotationShape[]
  }
  return []
}
