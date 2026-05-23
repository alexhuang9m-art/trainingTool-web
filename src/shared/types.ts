export type BlurLevel = 'P0' | 'P1'

export type StrokePoint = { x: number; y: number }

export type AnnotationStroke = {
  id: string
  level: BlurLevel
  points: StrokePoint[]
  width: number
}

export type ImageAnnotation = {
  imagePath: string
  strokes: AnnotationStroke[]
  version: 1
  updatedAt?: string
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
