export type AnnotationGuideLevel = {
  level: 'P0' | 'P1'
  text: string
}

export type AnnotationGuideType = {
  id: string
  title: string
  englishName: string
  shortcut: string
  levels: AnnotationGuideLevel[]
  isCustom?: boolean
}

export type NewAnnotationGuideInput = {
  title: string
  p0Text: string
  p1Text?: string
  illustrationP0?: string
  illustrationP1?: string
}

type StoredCustomGuide = {
  id: string
  title: string
  englishName: string
  p0Text: string
  p1Text?: string
}

export const DEFAULT_ANNOTATION_CATEGORY_ID = 'motion-blur'
export const CUSTOM_GUIDE_TYPES_KEY = 'training-tool-custom-guide-types'
export const GUIDE_ILLUSTRATIONS_KEY = 'training-tool-guide-illustrations'

export const BUILTIN_ANNOTATION_GUIDE_TYPES: AnnotationGuideType[] = [
  {
    id: 'motion-blur',
    title: '运动模糊/motionblur',
    englishName: 'motionblur',
    shortcut: 'Q',
    levels: [
      { level: 'P1', text: '有肉眼可见的运动模糊，但是轮廓还能识别出来' },
      { level: 'P0', text: '非常严重的运动模糊，轮廓难以识别' },
    ],
  },
  {
    id: 'artifacts',
    title: '运动拖影/Artifacts',
    englishName: 'Artifacts',
    shortcut: 'W',
    levels: [{ level: 'P0', text: '所有重影或者伪像都是严重级的' }],
  },
  {
    id: 'highlight-clipping',
    title: '高光过曝/overExposed',
    englishName: 'overExposed',
    shortcut: 'E',
    levels: [
      { level: 'P0', text: '大面积高光完全过曝' },
      { level: 'P1', text: '部分高光过曝或者未完全过曝' },
    ],
  },
  {
    id: 'smear',
    title: '涂抹不清晰/unclear',
    englishName: 'unclear',
    shortcut: 'R',
    levels: [
      { level: 'P0', text: '原本有纹理和反差的地方，完全被抹平' },
      { level: 'P1', text: '原本有纹理的，被抹平' },
    ],
  },
  {
    id: 'motion-noise',
    title: '运动噪声/Noise',
    englishName: 'Noise',
    shortcut: 'T',
    levels: [
      { level: 'P0', text: '全局/运动区域有明显大颗粒噪声' },
      { level: 'P1', text: '仅运动区域小颗粒噪声' },
    ],
  },
]

/** @deprecated Use BUILTIN_ANNOTATION_GUIDE_TYPES */
export const ANNOTATION_GUIDE_TYPES = BUILTIN_ANNOTATION_GUIDE_TYPES

export function parseGuideTitle(raw: string): { title: string; englishName: string } {
  const trimmed = raw.trim()
  const slash = trimmed.indexOf('/')
  if (slash >= 0) {
    const cn = trimmed.slice(0, slash).trim()
    const en = trimmed.slice(slash + 1).trim()
    const title = cn && en ? `${cn}/${en}` : trimmed
    const englishName = en || cn || 'custom'
    return { title, englishName }
  }
  const slug = trimmed.replace(/\s+/g, '')
  return { title: trimmed, englishName: slug || 'custom' }
}

function loadStoredCustomGuides(): StoredCustomGuide[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GUIDE_TYPES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredCustomGuide[]
    return Array.isArray(parsed) ? parsed.filter((g) => g?.id && g?.title && g?.p0Text) : []
  } catch {
    return []
  }
}

function saveStoredCustomGuides(list: StoredCustomGuide[]) {
  localStorage.setItem(CUSTOM_GUIDE_TYPES_KEY, JSON.stringify(list))
}

function storedToGuideType(s: StoredCustomGuide): AnnotationGuideType {
  const levels: AnnotationGuideLevel[] = [{ level: 'P0', text: s.p0Text }]
  if (s.p1Text?.trim()) levels.push({ level: 'P1', text: s.p1Text.trim() })
  return {
    id: s.id,
    title: s.title,
    englishName: s.englishName,
    shortcut: '',
    levels,
    isCustom: true,
  }
}

export function loadCustomGuideTypes(): AnnotationGuideType[] {
  return loadStoredCustomGuides().map(storedToGuideType)
}

export function loadAllGuideTypes(): AnnotationGuideType[] {
  return [...BUILTIN_ANNOTATION_GUIDE_TYPES, ...loadCustomGuideTypes()]
}

export function getAnnotationGuideType(
  id: string,
  types: AnnotationGuideType[] = loadAllGuideTypes(),
): AnnotationGuideType | undefined {
  return types.find((t) => t.id === id)
}

export function getAnnotationGuideTypeByShortcut(key: string): AnnotationGuideType | undefined {
  const k = key.toLowerCase()
  return BUILTIN_ANNOTATION_GUIDE_TYPES.find((t) => t.shortcut.toLowerCase() === k)
}

export function createCustomGuideType(input: NewAnnotationGuideInput): AnnotationGuideType {
  const { title, englishName } = parseGuideTitle(input.title)
  const stored: StoredCustomGuide = {
    id: `custom:${crypto.randomUUID()}`,
    title,
    englishName,
    p0Text: input.p0Text.trim(),
    p1Text: input.p1Text?.trim() || undefined,
  }
  const list = loadStoredCustomGuides()
  list.push(stored)
  saveStoredCustomGuides(list)
  return storedToGuideType(stored)
}

export function illustrationKey(guideId: string, level: 'P0' | 'P1') {
  return `${guideId}:${level}`
}
