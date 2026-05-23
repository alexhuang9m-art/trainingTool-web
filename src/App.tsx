import { ConfigProvider, theme } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnotationCanvas } from './components/AnnotationCanvas'
import { Sidebar } from './components/Sidebar'
import { bridgeAPI, bridgeAvailable } from './shared/bridge'
import { markLevelFromShapes, type ImageMarkLevel } from './shared/markLevel'
import type { AnnotationShape, AnnotTool, MediaListItem, WorkspaceImage } from './shared/types'
import { normalizeShapes } from './shared/types'

function basenameFromPath(abs: string): string {
  const norm = abs.replaceAll('\\', '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : abs
}

const BROWSER_ANNOT_KEY = 'training-tool-browser-annotations'

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
  const [bridgeHint, setBridgeHint] = useState<string | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [treeSelectionPath, setTreeSelectionPath] = useState<string | null>(null)
  const [browseFolderPath, setBrowseFolderPath] = useState<string | null>(null)
  const [expandImportedRoot, setExpandImportedRoot] = useState<{ path: string; nonce: number } | null>(
    null,
  )
  const [browserImages] = useState<MediaListItem[]>([])
  const [activeImage, setActiveImage] = useState<WorkspaceImage | null>(null)
  const [shapes, setShapes] = useState<AnnotationShape[]>([])
  const [activeLevel, setActiveLevel] = useState<'P0' | 'P1'>('P0')
  const [activeTool, setActiveTool] = useState<AnnotTool>('polyline')
  const [imageMarks, setImageMarks] = useState<Record<string, ImageMarkLevel>>({})
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [currentFolderImagePaths, setCurrentFolderImagePaths] = useState<string[]>([])
  const [status, setStatus] = useState('就绪')
  const browserAnnotRef = useRef(loadBrowserAnnotations())
  const browserUrlMapRef = useRef<Map<string, string>>(new Map())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void bridgeAvailable().then((ok) => {
      setBridgeReady(ok)
      if (ok) {
        setBridgeHint(null)
        void bridgeAPI.foldersGet().then(setFolders)
      } else {
        setBridgeHint(
          '未连接本地 Node bridge。请运行 npm run dev 以使用完整功能。',
        )
      }
    })
  }, [])

  const refreshImageMarks = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return
      const updates: Record<string, ImageMarkLevel> = {}
      await Promise.all(
        paths.map(async (p) => {
          if (p.startsWith('browser:')) {
            const level = markLevelFromShapes(browserAnnotRef.current[p] ?? [])
            if (level) updates[p] = level
            return
          }
          if (!bridgeReady) return
          try {
            const doc = await bridgeAPI.getAnnotations(p)
            const level = markLevelFromShapes(normalizeShapes(doc))
            if (level) updates[p] = level
          } catch {
            /* skip */
          }
        }),
      )
      setImageMarks((prev) => {
        const next = { ...prev }
        for (const p of paths) {
          if (updates[p]) next[p] = updates[p]
          else delete next[p]
        }
        return next
      })
    },
    [bridgeReady],
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

  const loadShapesForImage = useCallback(async (img: WorkspaceImage) => {
    if (img.source === 'bridge') {
      try {
        const doc = await bridgeAPI.getAnnotations(img.absolutePath)
        setShapes(normalizeShapes(doc))
      } catch {
        setShapes([])
      }
    } else {
      setShapes(browserAnnotRef.current[img.id] ?? [])
    }
  }, [])

  const scheduleSave = useCallback((img: WorkspaceImage, nextShapes: AnnotationShape[]) => {
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
          setStatus('已保存（浏览器本地）')
        }
      })()
    }, 400)
  }, [applyImageMark])

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
    if (browseFolderPath === '__browser__') {
      setCurrentFolderImagePaths(browserImages.map((m) => m.absolutePath))
      return
    }
    if (!bridgeReady) {
      setCurrentFolderImagePaths([])
      return
    }
    void bridgeAPI.mediaList(browseFolderPath).then((list) => {
      setCurrentFolderImagePaths(list.map((m) => m.absolutePath))
    })
  }, [browseFolderPath, bridgeReady, browserImages])

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

  const handleExportJson = useCallback(async () => {
    if (!browseFolderPath) return

    if (browseFolderPath === '__browser__') {
      const images = browserImages.map((m) => ({
        imagePath: m.absolutePath,
        basename: m.basename,
        shapes: browserAnnotRef.current[m.absolutePath] ?? [],
      }))
    const bundle = images.filter((img) => selectedPaths.has(img.imagePath))
    if (bundle.length === 0) return
    const blob = new Blob(
      [
        JSON.stringify(
          {
            folderPath: '__browser__',
            exportedAt: new Date().toISOString(),
            images: bundle,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `motion-blur-annotations-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setStatus(`已导出 ${bundle.length} 张`)
      return
    }

    if (!bridgeReady) return
    const data = await bridgeAPI.exportFolder(browseFolderPath)
    const parsed = data as { images?: { imagePath: string; basename: string; shapes: unknown[] }[] }
    const images = parsed.images ?? []
    const bundle = images.filter((img) => selectedPaths.has(img.imagePath))
    if (bundle.length === 0) return
    const blob = new Blob(
      [JSON.stringify({ ...parsed, images: bundle, exportedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `motion-blur-annotations-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus(`已导出 ${bundle.length} 张`)
  }, [browseFolderPath, bridgeReady, browserImages, selectedPaths])

  const exportReady = Boolean(
    browseFolderPath && (browseFolderPath === '__browser__' || bridgeReady),
  )

  const imageUrl =
    activeImage?.source === 'bridge'
      ? bridgeAPI.mediaFileUrl(activeImage.absolutePath)
      : activeImage?.source === 'browser'
        ? activeImage.objectUrl
        : null

  const selectBrowserImage = useCallback(
    (id: string) => {
      const item = browserImages.find((m) => m.absolutePath === id)
      const objectUrl = browserUrlMapRef.current.get(id)
      if (!item || !objectUrl) return
      const img: WorkspaceImage = {
        source: 'browser',
        id,
        name: item.basename,
        objectUrl,
      }
      setTreeSelectionPath(id)
      setActiveImage(img)
      void loadShapesForImage(img)
      setStatus(item.basename)
    },
    [browserImages, loadShapesForImage],
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
          browserImages={browserImages}
          treeSelectionPath={treeSelectionPath}
          expandImportedRoot={expandImportedRoot}
          bridgeReady={bridgeReady}
          bridgeHint={bridgeHint}
          imageMarks={imageMarks}
          selectedPaths={selectedPaths}
          selectionMode={selectionMode}
          browseFolderPath={browseFolderPath}
          exportReady={exportReady}
          onSelectAll={handleSelectAll}
          onEnterSelectionMode={handleEnterSelectionMode}
          onToggleImageSelect={handleToggleImageSelect}
          onClearSelection={handleClearSelection}
          onExportJson={handleExportJson}
          onTreeSelectFolder={handleTreeSelectFolder}
          onImagesDiscovered={onImagesDiscovered}
          onImportFolder={async () => {
            const res = await bridgeAPI.foldersPick()
            if (!res) return
            setFolders(res.roots)
            const kids = await bridgeAPI.listChildFolders(res.added)
            if (kids.length > 0) {
              setTreeSelectionPath(null)
              setBrowseFolderPath(null)
              setExpandImportedRoot({ path: res.added, nonce: Date.now() })
            } else {
              setExpandImportedRoot(null)
              setTreeSelectionPath(res.added)
              setBrowseFolderPath(res.added)
            }
          }}
          onRemove={async (p) => {
            const next = await bridgeAPI.foldersRemove(p)
            setFolders(next)
            setExpandImportedRoot(null)
            if (pathIsUnderAncestor(browseFolderPath, p)) setBrowseFolderPath(null)
            if (pathIsUnderAncestor(treeSelectionPath, p)) setTreeSelectionPath(null)
          }}
          onSelectImage={(path) => {
            if (path.startsWith('browser:')) selectBrowserImage(path)
            else selectBridgeImage(path)
          }}
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
                onClick={() => setActiveLevel('P0')}
              >
                P0 红
              </button>
              <button
                type="button"
                className={`tool-btn ${activeLevel === 'P1' ? 'tool-btn--active-p1' : ''}`}
                onClick={() => setActiveLevel('P1')}
              >
                P1 橙
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
                  onChange={handleShapesChange}
                />
              ) : (
                <p className="workspace-empty">
                  在左侧导入文件夹或照片，选择一张照片后使用折线或框选工具，配合 P0（红）/ P1（橙）标注运动模糊区域。折线：单击添加锚点，点击起点闭合区域。
                  标注会自动保存；本地 bridge 可将结果导出为 JSON 供 QLoRA 训练流水线使用。
                </p>
              )}
            </div>
          </div>
          <footer className="bottom-bar">
            <span className="status-text">{status}</span>
          </footer>
        </div>
      </div>
    </ConfigProvider>
  )
}
