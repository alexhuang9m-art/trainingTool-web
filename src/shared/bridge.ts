import type {
  AnnotationShape,
  FoldersPickResult,
  ImageAnnotation,
  MediaCountBatch,
  MediaListItem,
  ChildFolderInfo,
} from './types'

const bridgeBase = () => import.meta.env.VITE_BRIDGE_URL ?? ''

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = bridgeBase()
  const url = base ? `${base.replace(/\/$/, '')}${path}` : path
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export async function bridgeAvailable(): Promise<boolean> {
  try {
    await bridgeFetch<{ ok: boolean }>('/api/health')
    return true
  } catch {
    return false
  }
}

export const bridgeAPI = {
  foldersGet: () => bridgeFetch<string[]>('/api/folders'),
  foldersPick: () =>
    bridgeFetch<FoldersPickResult | null>('/api/folders/pick', { method: 'POST' }),
  foldersRemove: (folderPath: string) =>
    bridgeFetch<string[]>('/api/folders/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    }),
  listChildFolders: (dirPath: string) =>
    bridgeFetch<ChildFolderInfo[]>(`/api/fs/children?path=${encodeURIComponent(dirPath)}`),
  mediaCountBatch: (folderPaths: string[]) =>
    bridgeFetch<MediaCountBatch>(
      `/api/media/count?paths=${folderPaths.map(encodeURIComponent).join('|')}`,
    ),
  mediaList: (folderPath: string) =>
    bridgeFetch<MediaListItem[]>(`/api/media/list?path=${encodeURIComponent(folderPath)}`),
  mediaListDirect: (folderPath: string) =>
    bridgeFetch<MediaListItem[]>(`/api/media/list-direct?path=${encodeURIComponent(folderPath)}`),
  mediaFileUrl: (absolutePath: string) => {
    const base = bridgeBase()
    const q = `/api/media/file?path=${encodeURIComponent(absolutePath)}`
    return base ? `${base.replace(/\/$/, '')}${q}` : q
  },
  getAnnotations: (imagePath: string) =>
    bridgeFetch<ImageAnnotation>(`/api/annotations?path=${encodeURIComponent(imagePath)}`),
  saveAnnotations: (payload: {
    imagePath: string
    shapes: AnnotationShape[]
    version: 1
  }) =>
    bridgeFetch<{ ok: boolean }>('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }),
    }),
  exportFolder: (folderPath: string) =>
    bridgeFetch<unknown>('/api/annotations/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    }),
}
