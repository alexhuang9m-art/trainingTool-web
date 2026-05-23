import type { ChildFolderInfo, MediaListItem } from './types'
import {
  bucketsForRoot,
  deleteRootCache,
  filesForRoot,
  listCachedRoots,
  loadFileRecord,
  loadRootLabel,
  loadRootMeta,
  persistRootCache,
  type FolderBucket,
} from './browserMediaDb'

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.avif',
])

const BROWSER_ROOTS_KEY = 'training-tool-browser-folder-roots'

function extOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(extOf(file.name))
}

function basenameOf(path: string) {
  const norm = path.replaceAll('\\', '/').replace(/\/+$/, '')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}

function joinPath(parent: string, segment: string) {
  return `${parent.replace(/\/+$/, '')}/${segment}`
}

export function isBrowserFsPath(path: string) {
  return path.startsWith('browser-fs:')
}

async function walkDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  out: File[],
): Promise<void> {
  for await (const entry of handle.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      Object.defineProperty(file, 'webkitRelativePath', { value: rel, configurable: true })
      out.push(file)
    } else if (entry.kind === 'directory') {
      await walkDirectoryHandle(entry, rel, out)
    }
  }
}

function pickViaDirectoryInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.style.display = 'none'
    input.onchange = () => {
      resolve(input.files ? Array.from(input.files) : [])
      input.remove()
    }
    input.oncancel = () => {
      resolve([])
      input.remove()
    }
    document.body.appendChild(input)
    input.click()
  })
}

export async function pickFolderFiles(): Promise<{ files: File[]; label: string } | null> {
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const handle = await window.showDirectoryPicker()
      const files: File[] = []
      await walkDirectoryHandle(handle, handle.name, files)
      return files.length ? { files, label: handle.name } : null
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      /* fall through */
    }
  }

  const files = await pickViaDirectoryInput()
  if (!files.length) return null
  const label = files[0].webkitRelativePath?.split('/')[0] ?? 'Imported Folder'
  return { files, label }
}

function fileFromRecord(rec: { blob: Blob; basename: string; type: string }): File {
  return new File([rec.blob], rec.basename, { type: rec.type })
}

export class BrowserMediaStore {
  private roots: string[] = []
  private rootLabels = new Map<string, string>()
  private buckets = new Map<string, FolderBucket>()
  private files = new Map<string, File>()
  private urls = new Map<string, string>()
  private hydratePromise: Promise<void> | null = null
  private hydrated = false

  constructor() {
    this.loadRootsFromLocalStorage()
  }

  /** Restore folder tree and image blobs from IndexedDB (survives page refresh). */
  hydrate(): Promise<void> {
    if (this.hydrated) return Promise.resolve()
    if (!this.hydratePromise) this.hydratePromise = this.hydrateFromCache()
    return this.hydratePromise
  }

  private loadRootsFromLocalStorage() {
    try {
      const raw = localStorage.getItem(BROWSER_ROOTS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { roots?: string[]; labels?: Record<string, string> }
      if (Array.isArray(parsed.roots)) this.roots = parsed.roots.filter((r) => isBrowserFsPath(r))
      if (parsed.labels && typeof parsed.labels === 'object') {
        for (const [k, v] of Object.entries(parsed.labels)) {
          if (typeof v === 'string') this.rootLabels.set(k, v)
        }
      }
    } catch {
      /* ignore */
    }
  }

  private persistRootsToLocalStorage() {
    const labels: Record<string, string> = {}
    for (const r of this.roots) {
      const label = this.rootLabels.get(r)
      if (label) labels[r] = label
    }
    localStorage.setItem(BROWSER_ROOTS_KEY, JSON.stringify({ roots: this.roots, labels }))
  }

  private async hydrateFromCache() {
    try {
      const cachedRoots = await listCachedRoots()
      const rootSet = new Set<string>([...this.roots, ...cachedRoots].filter(isBrowserFsPath))
      this.roots = [...rootSet]

      const loadTasks: Promise<void>[] = []

      for (const rootPath of this.roots) {
        loadTasks.push(
          (async () => {
            const [label, meta] = await Promise.all([loadRootLabel(rootPath), loadRootMeta(rootPath)])
            if (label) this.rootLabels.set(rootPath, label)
            if (!meta?.buckets || Object.keys(meta.buckets).length === 0) return

            for (const [folderPath, bucket] of Object.entries(meta.buckets)) {
              this.buckets.set(folderPath, bucket)
            }

            const imagePaths: string[] = []
            const prefix = `${rootPath}/`
            for (const [folderPath, bucket] of Object.entries(meta.buckets)) {
              if (folderPath === rootPath || folderPath.startsWith(prefix)) {
                for (const img of bucket.images) imagePaths.push(img.absolutePath)
              }
            }

            await Promise.all(
              imagePaths.map(async (imagePath) => {
                if (this.files.has(imagePath)) return
                const rec = await loadFileRecord(imagePath)
                if (!rec) return
                this.files.set(imagePath, fileFromRecord(rec))
              }),
            )
          })(),
        )
      }

      await Promise.all(loadTasks)

      this.roots = this.roots.filter((r) => this.buckets.has(r))
      this.persistRootsToLocalStorage()
    } finally {
      this.hydrated = true
    }
  }

  getRoots(): string[] {
    return [...this.roots]
  }

  getRootLabel(rootPath: string): string | undefined {
    return this.rootLabels.get(rootPath)
  }

  async pickFolder(): Promise<{ roots: string[]; added: string } | null> {
    const picked = await pickFolderFiles()
    if (!picked) return null

    const rootPath = `browser-fs:${crypto.randomUUID()}`
    this.indexFolder(rootPath, picked.label, picked.files)
    if (!this.roots.includes(rootPath)) this.roots.push(rootPath)
    this.rootLabels.set(rootPath, picked.label)
    this.persistRootsToLocalStorage()
    await this.persistRootToCache(rootPath)
    return { roots: this.getRoots(), added: rootPath }
  }

  private async persistRootToCache(rootPath: string) {
    const label = this.rootLabels.get(rootPath) ?? basenameOf(rootPath)
    await persistRootCache(
      rootPath,
      label,
      bucketsForRoot(rootPath, this.buckets),
      filesForRoot(rootPath, this.files),
    )
  }

  private indexFolder(rootPath: string, rootLabel: string, files: File[]) {
    this.rootLabels.set(rootPath, rootLabel)
    const folderSet = new Map<string, Set<string>>()
    const imageMap = new Map<string, MediaListItem[]>()

    const ensure = (folderPath: string) => {
      if (!folderSet.has(folderPath)) folderSet.set(folderPath, new Set())
      if (!imageMap.has(folderPath)) imageMap.set(folderPath, [])
    }

    ensure(rootPath)

    for (const file of files) {
      if (!isImageFile(file)) continue
      const rel = (file.webkitRelativePath || file.name).replaceAll('\\', '/')
      const parts = rel.split('/').filter(Boolean)
      if (parts.length === 0) continue
      const fileName = parts[parts.length - 1]!
      const dirParts = parts.slice(0, -1)

      let parent = rootPath
      for (let i = 1; i < dirParts.length; i++) {
        const seg = dirParts[i]!
        const child = joinPath(parent, seg)
        ensure(parent)
        folderSet.get(parent)!.add(child)
        ensure(child)
        parent = child
      }

      const imagePath = joinPath(parent, fileName)
      this.files.set(imagePath, file)
      ensure(parent)
      imageMap.get(parent)!.push({
        absolutePath: imagePath,
        basename: fileName,
        kind: 'image',
      })
    }

    for (const [folderPath, subs] of folderSet) {
      const subfolders: ChildFolderInfo[] = [...subs].map((absolutePath) => ({
        id: absolutePath,
        name: basenameOf(absolutePath),
        absolutePath,
      }))
      subfolders.sort((a, b) => a.name.localeCompare(b.name))
      const images = imageMap.get(folderPath) ?? []
      images.sort((a, b) => a.basename.localeCompare(b.basename))
      this.buckets.set(folderPath, { subfolders, images })
    }
  }

  async removeRoot(rootPath: string): Promise<string[]> {
    this.roots = this.roots.filter((r) => r !== rootPath)
    this.rootLabels.delete(rootPath)
    const prefix = `${rootPath}/`
    for (const key of [...this.buckets.keys()]) {
      if (key === rootPath || key.startsWith(prefix)) this.buckets.delete(key)
    }
    for (const key of [...this.files.keys()]) {
      if (key === rootPath || key.startsWith(prefix)) {
        const url = this.urls.get(key)
        if (url) URL.revokeObjectURL(url)
        this.urls.delete(key)
        this.files.delete(key)
      }
    }
    this.persistRootsToLocalStorage()
    await deleteRootCache(rootPath)
    return this.getRoots()
  }

  private bucket(folderPath: string): FolderBucket {
    return this.buckets.get(folderPath) ?? { subfolders: [], images: [] }
  }

  listChildFolders(folderPath: string): ChildFolderInfo[] {
    return this.bucket(folderPath).subfolders
  }

  mediaListDirect(folderPath: string): MediaListItem[] {
    return this.bucket(folderPath).images
  }

  mediaList(folderPath: string): MediaListItem[] {
    const out: MediaListItem[] = []
    const walk = (dir: string) => {
      const b = this.bucket(dir)
      out.push(...b.images)
      for (const sub of b.subfolders) walk(sub.absolutePath)
    }
    walk(folderPath)
    return out
  }

  mediaCountBatch(folderPaths: string[]): Record<string, number> {
    const out: Record<string, number> = {}
    for (const p of folderPaths) out[p] = this.mediaList(p).length
    return out
  }

  mediaFileUrl(imagePath: string): string {
    let url = this.urls.get(imagePath)
    if (url) return url
    const file = this.files.get(imagePath)
    if (!file) return ''
    url = URL.createObjectURL(file)
    this.urls.set(imagePath, url)
    return url
  }

  hasFile(imagePath: string): boolean {
    return this.files.has(imagePath)
  }
}
