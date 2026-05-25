import { useCallback, useEffect, useState } from 'react'
import {
  createCustomGuideType,
  illustrationKey,
  GUIDE_ILLUSTRATIONS_KEY,
  type AnnotationGuideType,
  type NewAnnotationGuideInput,
} from '../shared/annotationGuide'
import { AddAnnotationTypeModal } from './AddAnnotationTypeModal'

type GuideLevel = 'P0' | 'P1'

function loadIllustrations(): Record<string, string> {
  try {
    const raw = localStorage.getItem(GUIDE_ILLUSTRATIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveIllustrations(map: Record<string, string>) {
  localStorage.setItem(GUIDE_ILLUSTRATIONS_KEY, JSON.stringify(map))
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function LevelHead({ level, text }: { level: GuideLevel; text: string | null }) {
  const hasDefinition = Boolean(text)
  return (
    <div className={`guide-level-col-head ${hasDefinition ? '' : 'guide-level-col-head--empty'}`}>
      <span className={`guide-level-badge guide-level-badge--${level.toLowerCase()}`}>{level}</span>
      <p className="guide-level-text">{text ?? '—'}</p>
    </div>
  )
}

function LevelIllustration({
  guideId,
  guideTitle,
  level,
  hasDefinition,
  imageUrl,
  onImageChange,
}: {
  guideId: string
  guideTitle: string
  level: GuideLevel
  hasDefinition: boolean
  imageUrl: string | undefined
  onImageChange: (key: string, dataUrl: string | null) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const key = illustrationKey(guideId, level)

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (!hasDefinition) return
      const file = e.dataTransfer.files[0]
      if (!file?.type.startsWith('image/')) return
      try {
        const dataUrl = await readImageFile(file)
        onImageChange(key, dataUrl)
      } catch {
        /* ignore */
      }
    },
    [hasDefinition, key, onImageChange],
  )

  return (
    <div
      className={`guide-illustration ${dragOver ? 'guide-illustration--drag-over' : ''} ${!hasDefinition ? 'guide-illustration--disabled' : ''}`}
      onDragOver={(e) => {
        if (!hasDefinition) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={`${guideTitle} ${level} 示意图`}
            className="guide-illustration-img"
          />
          <button
            type="button"
            className="guide-illustration-reset"
            title="恢复默认示意图"
            onClick={() => onImageChange(key, null)}
          >
            ×
          </button>
        </>
      ) : (
        <div className="guide-illustration-placeholder">
          <span className="guide-illustration-placeholder-title">示意图</span>
          {hasDefinition ? (
            <span className="guide-illustration-placeholder-hint">拖入照片</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function GuideCard({
  guide,
  activeCategoryId,
  illustrations,
  illustrationsOpen,
  onSelectCategory,
  onImageChange,
}: {
  guide: AnnotationGuideType
  activeCategoryId: string
  illustrations: Record<string, string>
  illustrationsOpen: boolean
  onSelectCategory: (id: string) => void
  onImageChange: (key: string, dataUrl: string | null) => void
}) {
  const p0 = guide.levels.find((l) => l.level === 'P0')?.text ?? null
  const p1 = guide.levels.find((l) => l.level === 'P1')?.text ?? null
  const isActive = activeCategoryId === guide.id

  return (
    <article className={`guide-card ${isActive ? 'guide-card--active-category' : ''}`}>
      <div className="guide-card-title-row">
        <h3 className="guide-card-title">{guide.title}</h3>
        {guide.shortcut ? (
          <button
            type="button"
            className={`guide-category-select-btn ${isActive ? 'guide-category-select-btn--active' : ''}`}
            aria-label={`${guide.title}（${guide.shortcut}）`}
            aria-pressed={isActive}
            onClick={() => onSelectCategory(guide.id)}
          >
            {guide.shortcut}
          </button>
        ) : (
          <button
            type="button"
            className={`guide-category-select-btn guide-category-select-btn--custom ${isActive ? 'guide-category-select-btn--active' : ''}`}
            aria-label={guide.title}
            aria-pressed={isActive}
            onClick={() => onSelectCategory(guide.id)}
          />
        )}
      </div>
      <div
        className={`guide-level-grid ${illustrationsOpen ? '' : 'guide-level-grid--text-only'}`}
      >
        <LevelHead level="P0" text={p0} />
        <LevelHead level="P1" text={p1} />
        {illustrationsOpen ? (
          <>
            <LevelIllustration
              guideId={guide.id}
              guideTitle={guide.title}
              level="P0"
              hasDefinition={Boolean(p0)}
              imageUrl={illustrations[illustrationKey(guide.id, 'P0')]}
              onImageChange={onImageChange}
            />
            <LevelIllustration
              guideId={guide.id}
              guideTitle={guide.title}
              level="P1"
              hasDefinition={Boolean(p1)}
              imageUrl={illustrations[illustrationKey(guide.id, 'P1')]}
              onImageChange={onImageChange}
            />
          </>
        ) : null}
      </div>
    </article>
  )
}

type SidebarProps = {
  guideTypes: AnnotationGuideType[]
  illustrationsOpen: boolean
  activeCategoryId: string
  onSelectCategory: (id: string) => void
  onGuideTypesChange: (types: AnnotationGuideType[]) => void
}

export function AnnotationGuideSidebar({
  guideTypes,
  illustrationsOpen,
  activeCategoryId,
  onSelectCategory,
  onGuideTypesChange,
}: SidebarProps) {
  const [illustrations, setIllustrations] = useState<Record<string, string>>(() => loadIllustrations())
  const [addModalOpen, setAddModalOpen] = useState(false)

  useEffect(() => {
    saveIllustrations(illustrations)
  }, [illustrations])

  const handleImageChange = useCallback((key: string, dataUrl: string | null) => {
    setIllustrations((prev) => {
      const next = { ...prev }
      if (dataUrl) next[key] = dataUrl
      else delete next[key]
      return next
    })
  }, [])

  const handleAddGuide = useCallback(
    (input: NewAnnotationGuideInput) => {
      const created = createCustomGuideType(input)
      const nextTypes = [...guideTypes, created]
      onGuideTypesChange(nextTypes)
      if (input.illustrationP0) {
        handleImageChange(illustrationKey(created.id, 'P0'), input.illustrationP0)
      }
      if (input.illustrationP1) {
        handleImageChange(illustrationKey(created.id, 'P1'), input.illustrationP1)
      }
      onSelectCategory(created.id)
    },
    [guideTypes, onGuideTypesChange, onSelectCategory, handleImageChange],
  )

  return (
    <aside
      className={`guide-sidebar ${illustrationsOpen ? '' : 'guide-sidebar--illustrations-collapsed'}`}
    >
      <div className="guide-sidebar-header">
        <h2 className="guide-sidebar-title">标注类型示意</h2>
      </div>
      <div className="guide-sidebar-scroll">
        {guideTypes.map((guide) => (
          <GuideCard
            key={guide.id}
            guide={guide}
            activeCategoryId={activeCategoryId}
            illustrations={illustrations}
            illustrationsOpen={illustrationsOpen}
            onSelectCategory={onSelectCategory}
            onImageChange={handleImageChange}
          />
        ))}
        <button
          type="button"
          className="guide-card guide-card--add"
          onClick={() => setAddModalOpen(true)}
        >
          <span className="guide-card-add-icon">+</span>
          <span className="guide-card-add-label">添加标注类型</span>
        </button>
      </div>
      <AddAnnotationTypeModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddGuide}
      />
    </aside>
  )
}
