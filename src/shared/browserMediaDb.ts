import type { ChildFolderInfo, MediaListItem } from './types'

const DB_NAME = 'training-tool-browser-media'
const DB_VERSION = 1

export type FolderBucket = {
  subfolders: ChildFolderInfo[]
  images: MediaListItem[]
}

type RootRecord = { label: string }
type MetaRecord = { buckets: Record<string, FolderBucket> }
type FileRecord = { rootPath: string; blob: Blob; basename: string; type: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('roots')) db.createObjectStore('roots')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      const files = db.createObjectStore('files')
      files.createIndex('byRoot', 'rootPath', { unique: false })
    }
  })
}

function get<T>(storeName: string, key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
      }),
  )
}

function getAllKeys(storeName: string): Promise<string[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
        const req = store.getAllKeys()
        req.onsuccess = () => resolve((req.result as string[]) ?? [])
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function listCachedRoots(): Promise<string[]> {
  return getAllKeys('roots')
}

export async function loadRootMeta(rootPath: string): Promise<MetaRecord | undefined> {
  return get<MetaRecord>('meta', rootPath)
}

export async function loadRootLabel(rootPath: string): Promise<string | undefined> {
  const rec = await get<RootRecord>('roots', rootPath)
  return rec?.label
}

export async function loadFileRecord(imagePath: string): Promise<FileRecord | undefined> {
  return get<FileRecord>('files', imagePath)
}

export async function listFilePathsForRoot(rootPath: string): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly')
    const store = transaction.objectStore('files')
    const index = store.index('byRoot')
    const req = index.getAllKeys(IDBKeyRange.only(rootPath))
    req.onsuccess = () => resolve((req.result as string[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function persistRootCache(
  rootPath: string,
  label: string,
  buckets: Record<string, FolderBucket>,
  files: Map<string, File>,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['roots', 'meta', 'files'], 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)

    transaction.objectStore('roots').put({ label } satisfies RootRecord, rootPath)
    transaction.objectStore('meta').put({ buckets } satisfies MetaRecord, rootPath)

    const fileStore = transaction.objectStore('files')
    const prefix = `${rootPath}/`
    for (const [imagePath, file] of files) {
      if (imagePath !== rootPath && !imagePath.startsWith(prefix)) continue
      const record: FileRecord = {
        rootPath,
        blob: file,
        basename: file.name,
        type: file.type || 'application/octet-stream',
      }
      fileStore.put(record, imagePath)
    }
  })
}

export async function deleteRootCache(rootPath: string): Promise<void> {
  const paths = await listFilePathsForRoot(rootPath)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['roots', 'meta', 'files'], 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)

    transaction.objectStore('roots').delete(rootPath)
    transaction.objectStore('meta').delete(rootPath)
    const fileStore = transaction.objectStore('files')
    for (const p of paths) fileStore.delete(p)
  })
}

export function bucketsForRoot(
  rootPath: string,
  buckets: Map<string, FolderBucket>,
): Record<string, FolderBucket> {
  const out: Record<string, FolderBucket> = {}
  const prefix = `${rootPath}/`
  for (const [k, v] of buckets) {
    if (k === rootPath || k.startsWith(prefix)) out[k] = v
  }
  return out
}

export function filesForRoot(rootPath: string, files: Map<string, File>): Map<string, File> {
  const out = new Map<string, File>()
  const prefix = `${rootPath}/`
  for (const [k, v] of files) {
    if (k.startsWith(prefix)) out.set(k, v)
  }
  return out
}
