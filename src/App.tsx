import { ConfigProvider, theme } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnotationCanvas } from './components/AnnotationCanvas'
import { Sidebar } from './components/Sidebar'
import { bridgeAPI, bridgeAvailable } from './shared/bridge'
import type { AnnotationStroke, MediaListItem, WorkspaceImage } from './shared/types'

const BROWSER_ANNOT_KEY = 'training-tool-browser-annotations'

function pathIsUnderAncestor(candidate: string | null, ancestor: string): boolean {
  if (!candidate) return false
  if (candidate === ancestor) return true
  const a = ancestor.replaceAll('\\', '/').replace(/\/?$/, '/')
  const c = candidate.replaceAll('\\', '/')
  return c.startsWith(a)
}

function loadBrowserAnnotations(): Record<string, AnnotationStroke[]> {
  try {
    const raw = localStorage.getItem(BROWSER_ANNOT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, AnnotationStroke[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveBrowserAnnotations(map: Record<string, AnnotationStroke[]>) {
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
  const [media, setMedia] = useState<MediaListItem[]>([])
  const [activeImage, setActiveImage] = useState<WorkspaceImage | null>(null)
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([])
  const [activeLevel, setActiveLevel] = useState<'P0' | 'P1'>('P0')
  const [annotatedPaths, setAnnotatedPaths] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('就绪')
  const fileInputRef = useRef<HTMLInputElement>(null)
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
          '未连接本地 Node bridge。部署在 Vercel 时可用「Import Photos」；本地完整功能请运行 npm run dev。',
        )
      }
    })
  }, [])

  const refreshAnnotatedSet = useCallback(async (items: MediaListItem[]) => {
    if (!bridgeReady) return
    const next = new Set<string>()
    await Promise.all(
      items.map(async (m) => {
        try {
          const doc = await bridgeAPI.getAnnotations(m.absolutePath)
          if (doc.strokes?.length) next.add(m.absolutePath)
        } catch {
          /* skip */
        }
      }),
    )
    setAnnotatedPaths(next)
  }, [bridgeReady])

  const loadMedia = useCallback(
    (folderPath: string) => {
      if (!bridgeReady) return
      void bridgeAPI.mediaList(folderPath).then((list) => {
        setMedia(list)
        void refreshAnnotatedSet(list)
      })
    },
    [bridgeReady, refreshAnnotatedSet],
  )

  useEffect(() => {
    if (browseFolderPath) loadMedia(browseFolderPath)
    else setMedia([])
  }, [browseFolderPath, loadMedia])

  const loadStrokesForImage = useCallback(
    async (img: WorkspaceImage) => {
      if (img.source === 'bridge') {
        try {
          const doc = await bridgeAPI.getAnnotations(img.absolutePath)
          setStrokes(doc.strokes ?? [])
        } catch {
          setStrokes([])
        }
      } else {
        setStrokes(browserAnnotRef.current[img.id] ?? [])
      }
    },
    [],
  )

  const scheduleSave = useCallback(
    (img: WorkspaceImage, nextStrokes: AnnotationStroke[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void (async () => {
          if (img.source === 'bridge') {
            try {
              await bridgeAPI.saveAnnotations({
                imagePath: img.absolutePath,
                strokes: nextStrokes,
                version: 1,
              })
              setStatus('已保存')
              if (nextStrokes.length) {
                setAnnotatedPaths((s) => new Set(s).add(img.absolutePath))
              } else {
                setAnnotatedPaths((s) => {
                  const n = new Set(s)
                  n.delete(img.absolutePath)
                  return n
                })
              }
            } catch {
              setStatus('保存失败')
            }
          } else {
            browserAnnotRef.current[img.id] = nextStrokes
            saveBrowserAnnotations(browserAnnotRef.current)
            setStatus('已保存（浏览器本地）')
          }
        })()
      }, 400)
    },
    [],
  )

  const handleStrokesChange = useCallback(
    (next: AnnotationStroke[]) => {
      setStrokes(next)
      if (activeImage) scheduleSave(activeImage, next)
    },
    [activeImage, scheduleSave],
  )

  const selectBridgeImage = useCallback(
    (absolutePath: string) => {
      const item = media.find((m) => m.absolutePath === absolutePath)
      if (!item) return
      const img: WorkspaceImage = {
        source: 'bridge',
        absolutePath: item.absolutePath,
        name: item.basename,
      }
      setActiveImage(img)
      void loadStrokesForImage(img)
      setStatus(item.basename)
    },
    [media, loadStrokesForImage],
  )

  const handleTreeSelectFolder = useCallback((path: string | null) => {
    if (path) {
      setTreeSelectionPath(path)
      setBrowseFolderPath(path)
    }
  }, [])

  const imageUrl =
    activeImage?.source === 'bridge'
      ? bridgeAPI.mediaFileUrl(activeImage.absolutePath)
      : activeImage?.source === 'browser'
        ? activeImage.objectUrl
        : null

  const handleImportFiles = () => fileInputRef.current?.click()

  const selectBrowserImage = useCallback(
    (id: string) => {
      const item = media.find((m) => m.absolutePath === id)
      const objectUrl = browserUrlMapRef.current.get(id)
      if (!item || !objectUrl) return
      const img: WorkspaceImage = {
        source: 'browser',
        id,
        name: item.basename,
        objectUrl,
      }
      setActiveImage(img)
      void loadStrokesForImage(img)
      setStatus(item.basename)
    },
    [media, loadStrokesForImage],
  )

  const onFilesPicked = (files: FileList | null) => {
    if (!files?.length) return
    const list: MediaListItem[] = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      const id = `browser:${f.name}:${f.size}:${f.lastModified}`
      browserUrlMapRef.current.set(id, URL.createObjectURL(f))
      list.push({ absolutePath: id, basename: f.name, kind: 'image' })
    }
    if (list.length === 0) return
    setMedia(list)
    setBrowseFolderPath(null)
    setTreeSelectionPath(null)
    const first = list[0]
    const firstUrl = browserUrlMapRef.current.get(first.absolutePath)!
    const img: WorkspaceImage = {
      source: 'browser',
      id: first.absolutePath,
      name: first.basename,
      objectUrl: firstUrl,
    }
    setActiveImage(img)
    void loadStrokesForImage(img)
    setStatus(`已导入 ${list.length} 张照片（浏览器模式）`)
    const annotated = new Set<string>()
    for (const m of list) {
      if ((browserAnnotRef.current[m.absolutePath]?.length ?? 0) > 0) {
        annotated.add(m.absolutePath)
      }
    }
    setAnnotatedPaths(annotated)
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgContainer: '#252526', colorBorder: '#3c3c3c' },
      }}
    >
      <div className="app-shell">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onFilesPicked(e.target.files)
            e.target.value = ''
          }}
        />
        <Sidebar
          folders={folders}
          treeSelectionPath={treeSelectionPath}
          expandImportedRoot={expandImportedRoot}
          bridgeReady={bridgeReady}
          bridgeHint={bridgeHint}
          media={media}
          activeImagePath={
            activeImage
              ? activeImage.source === 'bridge'
                ? activeImage.absolutePath
                : activeImage.id
              : null
          }
          annotatedPaths={annotatedPaths}
          onTreeSelectFolder={handleTreeSelectFolder}
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
          onImportFiles={handleImportFiles}
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
                className={`tool-btn ${activeLevel === 'P0' ? 'tool-btn--active-p0' : ''}`}
                onClick={() => setActiveLevel('P0')}
              >
                P0 红笔
              </button>
              <button
                type="button"
                className={`tool-btn ${activeLevel === 'P1' ? 'tool-btn--active-p1' : ''}`}
                onClick={() => setActiveLevel('P1')}
              >
                P1 橙笔
              </button>
              <button
                type="button"
                className="tool-btn tool-btn--ghost"
                disabled={strokes.length === 0}
                onClick={() => {
                  const last = strokes[strokes.length - 1]
                  if (!last) return
                  handleStrokesChange(strokes.slice(0, -1))
                }}
              >
                撤销
              </button>
              <button
                type="button"
                className="tool-btn tool-btn--ghost"
                disabled={strokes.length === 0}
                onClick={() => handleStrokesChange([])}
              >
                清除
              </button>
            </div>
            <div className="workspace-canvas-wrap">
              {imageUrl && activeImage ? (
                <AnnotationCanvas
                  imageUrl={imageUrl}
                  strokes={strokes}
                  activeLevel={activeLevel}
                  onChange={handleStrokesChange}
                />
              ) : (
                <p className="workspace-empty">
                  在左侧导入文件夹或照片，选择一张照片后使用 P0（红）/ P1（橙）画笔标注运动模糊区域。
                  标注会自动保存；本地 bridge 可将结果导出为 JSON 供 QLoRA 训练流水线使用。
                </p>
              )}
            </div>
          </div>
          <footer className="bottom-bar">
            <div>
              <button
                type="button"
                className="pill-btn"
                disabled={!bridgeReady || !browseFolderPath}
                onClick={() => {
                  if (!browseFolderPath) return
                  void bridgeAPI.exportFolder(browseFolderPath).then((data) => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: 'application/json',
                    })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `motion-blur-annotations-${Date.now()}.json`
                    a.click()
                    URL.revokeObjectURL(a.href)
                    setStatus('已导出 JSON')
                  })
                }}
              >
                导出标注 JSON
              </button>
              <button
                type="button"
                className="pill-btn"
                disabled={strokes.length === 0}
                onClick={() => {
                  if (!activeImage) return
                  const payload = {
                    image: activeImage.source === 'bridge' ? activeImage.absolutePath : activeImage.name,
                    strokes,
                    version: 1,
                  }
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `annotation-${Date.now()}.json`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >
                导出当前图
              </button>
            </div>
            <span className="status-text">{status}</span>
          </footer>
        </div>
      </div>
    </ConfigProvider>
  )
}
