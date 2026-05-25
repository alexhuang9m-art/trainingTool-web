import { ConfigProvider, theme } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnnotationCanvas } from './components/AnnotationCanvas'
import { AnnotationGuideSidebar } from './components/AnnotationGuideSidebar'
import { Sidebar } from './components/Sidebar'
import { bridgeAPI, bridgeAvailable } from './shared/bridge'
import { BrowserMediaStore, isBrowserFsPath } from './shared/browserMedia'
import {
  createBridgeMediaBackend,
  createBrowserMediaBackend,
  type MediaBackend,
} from './shared/mediaBackend'
import {
  DEFAULT_ANNOTATION_CATEGORY_ID,
  getAnnotationGuideType,
  getAnnotationGuideTypeByShortcut,
  loadAllGuideTypes,
  type AnnotationGuideType,
} from './shared/annotationGuide'
import { buildAnnotationExportBundle } from './shared/exportBundle'
import { markLevelFromShapes, toExportedImage, type ImageMarkLevel } from './shared/markLevel'
import type { AnnotationShape, AnnotTool, WorkspaceImage } from './shared/types'
import { normalizeShapes } from './shared/types'

function basenameFromPath(abs: string): string {
  const norm = abs.replaceAll('\\', '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : abs
}

const BROWSER_ANNOT_KEY = 'training-tool-browser-annotations'
const ACTIVE_CATEGORY_KEY = 'training-tool-active-category'

function pathIsUnderAncestor(candidate: string | null, ancestor: string): boolean {
  if (!candidate) return false
  if (candidate === ancestor) return true
  const a = ancestor.replaceAll('\\', '/').replace(/\/?$/, '/')
  const c = candidate.replaceAll('\\', '/')
  return c.startsWith(a)
}

function loadBrowserAnnotations(): Record<string, AnnotationShape[]> {
  try {
    const raw = localStorage.getItem(BROWSER_ANNOT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, AnnotationShape[]> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v as AnnotationShape[]
      else if (v && typeof v === 'object') out[k] = normalizeShapes(v as Parameters<typeof normalizeShapes>[0])
    }
    return out
  } catch {
    return {}
  }
}

function saveBrowserAnnotations(map: Record<string, AnnotationShape[]>) {
  localStorage.setItem(BROWSER_ANNOT_KEY, JSON.stringify(map))
}

export default function App() {
  const [bridgeReady, setBridgeReady] = useState(false)
  const [folders, setFolders] = useState<string[]>([])
  const [treeSelectionPath, setTreeSelectionPath] = useState<string | null>(null)
  const [browseFolderPath, setBrowseFolderPath] = useState<string | null>(null)
  const [expandImportedRoot, setExpandImportedRoot] = useState<{ path: string; nonce: number } | null>(
    null,
  )
  const [activeImage, setActiveImage] = useState<WorkspaceImage | null>(null)
  const [shapes, setShapes] = useState<AnnotationShape[]>([])
  const [activeLevel, setActiveLevel] = useState<'P0' | 'P1'>('P0')
  const [activeTool, setActiveTool] = useState<AnnotTool>('polyline')
  const [imageMarks, setImageMarks] = useState<Record<string, ImageMarkLevel>>({})
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [currentFolderImagePaths, setCurrentFolderImagePaths] = useState<string[]>([])
  const [status, setStatus] = useState('就绪')
  const [guideIllustrationsOpen, setGuideIllustrationsOpen] = useState(() => {
    try {
      return localStorage.getItem('training-tool-guide-illustrations-open') !== '0'
    } catch {
      return true
    }
  })
  const [guideTypes, setGuideTypes] = useState<AnnotationGuideType[]>(() => loadAllGuideTypes())
  const [activeCategoryId, setActiveCategoryId] = useState(() => {
    const types = loadAllGuideTypes()
    try {
      const saved = localStorage.getItem(ACTIVE_CATEGORY_KEY)
      return getAnnotationGuideType(saved ?? '', types)?.id ?? DEFAULT_ANNOTATION_CATEGORY_ID
    } catch {
      return DEFAULT_ANNOTATION_CATEGORY_ID
    }
  })
  const browserStoreRef = useRef(new BrowserMediaStore())
  const browserAnnotRef = useRef(loadBrowserAnnotations())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const categoryEnglishName = useMemo(
    () => getAnnotationGuideType(activeCategoryId, guideTypes)?.englishName ?? 'motionblur',
    [activeCategoryId, guideTypes],
  )

  const handleSelectCategory = useCallback(
    (id: string) => {
      setActiveCategoryId(id)
      try {
        localStorage.setItem(ACTIVE_CATEGORY_KEY, id)
      } catch {
        /* ignore */
      }
      const guide = getAnnotationGuideType(id, guideTypes)
      setStatus(guide ? `当前标注类型：${guide.title}` : '就绪')
    },
    [guideTypes],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault()
        setActiveLevel('P0')
        return
      }
      if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
        e.preventDefault()
        setActiveLevel('P1')
        return
      }
      const guide = getAnnotationGuideTypeByShortcut(e.key)
      if (!guide) return
      e.preventDefault()
      handleSelectCategory(guide.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSelectCategory])

  const media: MediaBackend = useMemo(
    () =>
      bridgeReady
        ? createBridgeMediaBackend()
        : createBrowserMediaBackend(browserStoreRef.current),
    [bridgeReady],
  )

  useEffect(() => {
    void bridgeAvailable().then(async (ok) => {
      setBridgeReady(ok)
      if (ok) {
        setFolders(await bridgeAPI.foldersGet())
        return
      }
      await browserStoreRef.current.hydrate()
      const roots = browserStoreRef.current.getRoots()
      setFolders(roots)
      const paths: string[] = []
      for (const r of roots) {
        for (const m of browserStoreRef.current.mediaList(r)) paths.push(m.absolutePath)
      }
      if (paths.length) {
        const marks: Record<string, ImageMarkLevel> = {}
        for (const p of paths) {
          const level = markLevelFromShapes(browserAnnotRef.current[p] ?? [])
          if (level) marks[p] = level
        }
        setImageMarks(marks)
      }
    })
  }, [])

  const refreshImageMarks = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return
      const updates: Record<string, ImageMarkLevel | null> = {}
      await Promise.all(
        paths.map(async (p) => {
          if (!media.isBridge || isBrowserFsPath(p)) {
            updates[p] = markLevelFromShapes(browserAnnotRef.current[p] ?? [])
            return
          }
          try {
            const doc = await bridgeAPI.getAnnotations(p)
            updates[p] = markLevelFromShapes(normalizeShapes(doc))
          } catch {
            /* keep previous mark on fetch failure */
          }
        }),
      )
      setImageMarks((prev) => {
        const next = { ...prev }
        for (const p of paths) {
          if (!(p in updates)) continue
          const level = updates[p]
          if (level) next[p] = level
          else delete next[p]
        }
        return next
      })
    },
    [media.isBridge],
  )

  const onImagesDiscovered = useCallback(
    (paths: string[]) => {
      void refreshImageMarks(paths)
    },
    [refreshImageMarks],
  )

  const applyImageMark = useCallback((imagePath: string, nextShapes: AnnotationShape[]) => {
    const level = markLevelFromShapes(nextShapes)
    setImageMarks((prev) => {
      const next = { ...prev }
      if (level) next[imagePath] = level
      else delete next[imagePath]
      return next
    })
  }, [])

  const loadShapesForImage = useCallback(
    async (img: WorkspaceImage) => {
      const path = img.source === 'bridge' ? img.absolutePath : img.id
      if (img.source === 'bridge') {
        try {
          const doc = await bridgeAPI.getAnnotations(img.absolutePath)
          const loaded = normalizeShapes(doc)
          setShapes(loaded)
          applyImageMark(path, loaded)
        } catch {
          setShapes([])
          applyImageMark(path, [])
        }
      } else {
        const loaded = browserAnnotRef.current[img.id] ?? []
        setShapes(loaded)
        applyImageMark(path, loaded)
      }
    },
    [applyImageMark],
  )

  const scheduleSave = useCallback(
    (img: WorkspaceImage, nextShapes: AnnotationShape[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void (async () => {
          if (img.source === 'bridge') {
            try {
              await bridgeAPI.saveAnnotations({
                imagePath: img.absolutePath,
                shapes: nextShapes,
                version: 1,
              })
              setStatus('已保存')
              applyImageMark(img.absolutePath, nextShapes)
            } catch {
              setStatus('保存失败')
            }
          } else {
            browserAnnotRef.current[img.id] = nextShapes
            saveBrowserAnnotations(browserAnnotRef.current)
            applyImageMark(img.id, nextShapes)
            setStatus(media.isBridge ? '已保存（浏览器本地）' : '已保存')
          }
        })()
      }, 400)
    },
    [applyImageMark, media.isBridge],
  )

  const handleShapesChange = useCallback(
    (next: AnnotationShape[]) => {
      setShapes(next)
      if (activeImage) {
        const path = activeImage.source === 'bridge' ? activeImage.absolutePath : activeImage.id
        applyImageMark(path, next)
        scheduleSave(activeImage, next)
      }
    },
    [activeImage, applyImageMark, scheduleSave],
  )

  const selectBridgeImage = useCallback(
    (absolutePath: string) => {
      const img: WorkspaceImage = {
        source: 'bridge',
        absolutePath,
        name: basenameFromPath(absolutePath),
      }
      setTreeSelectionPath(absolutePath)
      setActiveImage(img)
      void loadShapesForImage(img)
      setStatus(img.name)
    },
    [loadShapesForImage],
  )

  const selectLocalImage = useCallback(
    (virtualPath: string) => {
      const url = media.mediaFileUrl(virtualPath)
      if (!url) {
        setStatus('请重新导入该文件夹')
        return
      }
      const img: WorkspaceImage = {
        source: 'browser',
        id: virtualPath,
        name: basenameFromPath(virtualPath),
        objectUrl: url,
      }
      setTreeSelectionPath(virtualPath)
      setActiveImage(img)
      void loadShapesForImage(img)
      setStatus(img.name)
    },
    [loadShapesForImage, media],
  )

  const handleTreeSelectFolder = useCallback((path: string) => {
    setTreeSelectionPath(path)
    setBrowseFolderPath(path)
  }, [])

  useEffect(() => {
    setSelectedPaths(new Set())
    setSelectionMode(false)
    if (!browseFolderPath) {
      setCurrentFolderImagePaths([])
      return
    }
    void media.mediaList(browseFolderPath).then((list) => {
      setCurrentFolderImagePaths(list.map((m) => m.absolutePath))
    })
  }, [browseFolderPath, media])

  const handleSelectAll = useCallback(() => {
    setSelectionMode(true)
    setSelectedPaths(new Set(currentFolderImagePaths))
    setStatus(`已全选 ${currentFolderImagePaths.length} 张照片`)
  }, [currentFolderImagePaths])

  const handleEnterSelectionMode = useCallback(() => {
    setSelectionMode(true)
    setStatus('点击照片进行多选')
  }, [])

  const handleToggleImageSelect = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedPaths(new Set())
    setStatus('已取消选择')
  }, [])

  const downloadJson = useCallback((payload: unknown, count: number) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `motion-blur-annotations-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus(`已导出 ${count} 张`)
  }, [])

  const handleExportJson = useCallback(async () => {
    if (!browseFolderPath) return

    if (media.isBridge) {
      const data = await bridgeAPI.exportFolder(browseFolderPath)
      const parsed = data as { images?: ReturnType<typeof toExportedImage>[]; folderPath?: string }
      const images = (parsed.images ?? []).filter((img) => selectedPaths.has(img.imagePath))
      if (images.length === 0) return
      downloadJson(
        buildAnnotationExportBundle(parsed.folderPath ?? browseFolderPath, images, guideTypes),
        images.length,
      )
      return
    }

    const list = await media.mediaList(browseFolderPath)
    const images = list
      .filter((m) => selectedPaths.has(m.absolutePath))
      .map((m) =>
        toExportedImage(m.absolutePath, m.basename, browserAnnotRef.current[m.absolutePath] ?? []),
      )
    if (images.length === 0) return
    downloadJson(buildAnnotationExportBundle(browseFolderPath, images, guideTypes), images.length)
  }, [browseFolderPath, media, selectedPaths, downloadJson, guideTypes])

  const exportReady = Boolean(browseFolderPath)

  const imageUrl =
    activeImage?.source === 'bridge'
      ? bridgeAPI.mediaFileUrl(activeImage.absolutePath)
      : activeImage?.source === 'browser'
        ? activeImage.objectUrl
        : null

  const handleSelectImage = useCallback(
    (path: string) => {
      if (media.isBridge && !isBrowserFsPath(path)) selectBridgeImage(path)
      else selectLocalImage(path)
    },
    [media.isBridge, selectBridgeImage, selectLocalImage],
  )

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgContainer: '#252526', colorBorder: '#3c3c3c' },
      }}
    >
      <div className="app-shell">
        <Sidebar
          folders={folders}
          treeSelectionPath={treeSelectionPath}
          expandImportedRoot={expandImportedRoot}
          imageMarks={imageMarks}
          selectedPaths={selectedPaths}
          selectionMode={selectionMode}
          browseFolderPath={browseFolderPath}
          folderImagePaths={currentFolderImagePaths}
          exportReady={exportReady}
          browserStore={bridgeReady ? null : browserStoreRef.current}
          media={media}
          onSelectAll={handleSelectAll}
          onEnterSelectionMode={handleEnterSelectionMode}
          onToggleImageSelect={handleToggleImageSelect}
          onClearSelection={handleClearSelection}
          onExportJson={handleExportJson}
          onTreeSelectFolder={handleTreeSelectFolder}
          onImagesDiscovered={onImagesDiscovered}
          onImportFolder={async () => {
            const res = await media.pickFolder()
            if (!res) return
            setFolders(res.roots)
            const kids = await media.listChildFolders(res.added)
            if (kids.length > 0) {
              setTreeSelectionPath(null)
              setBrowseFolderPath(null)
              setExpandImportedRoot({ path: res.added, nonce: Date.now() })
            } else {
              setExpandImportedRoot(null)
              setTreeSelectionPath(res.added)
              setBrowseFolderPath(res.added)
            }
            setStatus('已导入文件夹')
          }}
          onRemove={async (p) => {
            const next = await media.removeRoot(p)
            setFolders(next)
            setExpandImportedRoot(null)
            if (pathIsUnderAncestor(browseFolderPath, p)) setBrowseFolderPath(null)
            if (pathIsUnderAncestor(treeSelectionPath, p)) setTreeSelectionPath(null)
            if (activeImage) {
              const activePath =
                activeImage.source === 'bridge' ? activeImage.absolutePath : activeImage.id
              if (pathIsUnderAncestor(activePath, p)) setActiveImage(null)
            }
          }}
          onSelectImage={handleSelectImage}
        />
        <div className="main-column">
          <div className="workspace">
            <div className="workspace-toolbar">
              <button
                type="button"
                className={`tool-btn ${activeTool === 'polyline' ? 'tool-btn--active-tool' : ''}`}
                onClick={() => setActiveTool('polyline')}
              >
                折线
              </button>
              <button
                type="button"
                className={`tool-btn ${activeTool === 'box' ? 'tool-btn--active-tool' : ''}`}
                onClick={() => setActiveTool('box')}
              >
                框选
              </button>
              <span className="toolbar-sep" />
              <button
                type="button"
                className={`tool-btn ${activeLevel === 'P0' ? 'tool-btn--active-p0' : ''}`}
                aria-keyshortcuts="1"
                onClick={() => setActiveLevel('P0')}
              >
                1 · P0 红
              </button>
              <button
                type="button"
                className={`tool-btn ${activeLevel === 'P1' ? 'tool-btn--active-p1' : ''}`}
                aria-keyshortcuts="2"
                onClick={() => setActiveLevel('P1')}
              >
                2 · P1 橙
              </button>
              <span className="toolbar-sep" />
              <button
                type="button"
                className="tool-btn tool-btn--ghost"
                disabled={shapes.length === 0}
                onClick={() => handleShapesChange(shapes.slice(0, -1))}
              >
                撤销
              </button>
              <button
                type="button"
                className="tool-btn tool-btn--ghost"
                disabled={shapes.length === 0}
                onClick={() => handleShapesChange([])}
              >
                清除
              </button>
            </div>
            <div className="workspace-canvas-wrap" data-workspace-viewport>
              {imageUrl && activeImage ? (
                <AnnotationCanvas
                  imageUrl={imageUrl}
                  shapes={shapes}
                  activeLevel={activeLevel}
                  activeTool={activeTool}
                  categoryEnglishName={categoryEnglishName}
                  onChange={handleShapesChange}
                />
              ) : (
                <p className="workspace-empty">
                  点击左侧 Import Folder 导入文件夹，选择照片后用折线或框选工具标注 P0（红）/ P1（橙）运动模糊区域。折线：单击添加锚点，点击起点闭合。标注会自动保存，选中文件后可导出 JSON。
                </p>
              )}
            </div>
          </div>
        </div>
        <AnnotationGuideSidebar
          guideTypes={guideTypes}
          illustrationsOpen={guideIllustrationsOpen}
          activeCategoryId={activeCategoryId}
          onSelectCategory={handleSelectCategory}
          onGuideTypesChange={setGuideTypes}
        />
        <footer className="bottom-bar">
          <span className="status-text">{status}</span>
          <button
            type="button"
            className="bottom-bar-guide-toggle"
            onClick={() => {
              setGuideIllustrationsOpen((open) => {
                const next = !open
                try {
                  localStorage.setItem('training-tool-guide-illustrations-open', next ? '1' : '0')
                } catch {
                  /* ignore */
                }
                return next
              })
            }}
          >
            {guideIllustrationsOpen ? '收起示意图' : '展开示意图'}
          </button>
        </footer>
      </div>
    </ConfigProvider>
  )
}
