import type { AnnotationGuideType } from './annotationGuide'
import type { ExportedImageRecord } from './markLevel'
import type { AnnotationShape } from './types'

export type ExportedAnnotationTypeLevel = {
  level: 'P0' | 'P1'
  description: string
}

/** Annotation category definitions included in folder export JSON. */
export type ExportedAnnotationType = {
  id: string
  title: string
  englishName: string
  shortcut?: string
  isCustom?: boolean
  levels: ExportedAnnotationTypeLevel[]
}

export const EXPORT_MARK_LEGEND: Record<string, string> = {
  P0: '照片级最高优先级（红色）。同一张图任意标注类型下只要存在 P0，mark 即为 P0。',
  P1: '次级（橙色）。仅当该图没有任何 P0 标注时，mark 为 P1。',
  clear: '无标注（shapes 为空）。',
}

export type AnnotationExportBundle = {
  version: 1
  folderPath: string
  exportedAt: string
  markLegend: Record<string, string>
  annotationTypes: ExportedAnnotationType[]
  images: ExportedImageRecord[]
}

export function guideTypeToExportType(guide: AnnotationGuideType): ExportedAnnotationType {
  return {
    id: guide.id,
    title: guide.title,
    englishName: guide.englishName,
    shortcut: guide.shortcut || undefined,
    isCustom: guide.isCustom || undefined,
    levels: guide.levels.map((l) => ({ level: l.level, description: l.text })),
  }
}

function categoryEnglishNamesInShapes(shapes: AnnotationShape[]): string[] {
  const names: string[] = []
  for (const s of shapes) {
    if (s.kind === 'polyline' && s.categoryEnglishName) names.push(s.categoryEnglishName)
  }
  return names
}

/**
 * Built-in + custom guide types, plus any categoryEnglishName seen in shapes but missing from guides.
 */
export function buildAnnotationTypesCatalog(
  guideTypes: AnnotationGuideType[],
  images: ExportedImageRecord[],
): ExportedAnnotationType[] {
  const catalog = guideTypes.map(guideTypeToExportType)
  const known = new Set(catalog.map((t) => t.englishName))

  for (const img of images) {
    for (const name of categoryEnglishNamesInShapes(img.shapes)) {
      if (known.has(name)) continue
      known.add(name)
      catalog.push({
        id: `referenced:${name}`,
        title: name,
        englishName: name,
        levels: [],
      })
    }
  }

  return catalog
}

export function buildAnnotationExportBundle(
  folderPath: string,
  images: ExportedImageRecord[],
  guideTypes: AnnotationGuideType[],
  exportedAt = new Date().toISOString(),
): AnnotationExportBundle {
  return {
    version: 1,
    folderPath,
    exportedAt,
    markLegend: EXPORT_MARK_LEGEND,
    annotationTypes: buildAnnotationTypesCatalog(guideTypes, images),
    images,
  }
}
