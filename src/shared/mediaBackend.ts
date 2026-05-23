import { bridgeAPI } from './bridge'
import type { BrowserMediaStore } from './browserMedia'
import type { ChildFolderInfo, FoldersPickResult, MediaCountBatch, MediaListItem } from './types'

export type MediaBackend = {
  isBridge: boolean
  getRoots: () => Promise<string[]>
  pickFolder: () => Promise<FoldersPickResult | null>
  removeRoot: (folderPath: string) => Promise<string[]>
  listChildFolders: (dirPath: string) => Promise<ChildFolderInfo[]>
  mediaListDirect: (folderPath: string) => Promise<MediaListItem[]>
  mediaList: (folderPath: string) => Promise<MediaListItem[]>
  mediaCountBatch: (folderPaths: string[]) => Promise<MediaCountBatch>
  mediaFileUrl: (absolutePath: string) => string
}

export function createBridgeMediaBackend(): MediaBackend {
  return {
    isBridge: true,
    getRoots: () => bridgeAPI.foldersGet(),
    pickFolder: () => bridgeAPI.foldersPick(),
    removeRoot: (folderPath) => bridgeAPI.foldersRemove(folderPath),
    listChildFolders: (dirPath) => bridgeAPI.listChildFolders(dirPath),
    mediaListDirect: (folderPath) => bridgeAPI.mediaListDirect(folderPath),
    mediaList: (folderPath) => bridgeAPI.mediaList(folderPath),
    mediaCountBatch: (folderPaths) => bridgeAPI.mediaCountBatch(folderPaths),
    mediaFileUrl: (absolutePath) => bridgeAPI.mediaFileUrl(absolutePath),
  }
}

export function createBrowserMediaBackend(store: BrowserMediaStore): MediaBackend {
  return {
    isBridge: false,
    getRoots: async () => store.getRoots(),
    pickFolder: async () => {
      const res = await store.pickFolder()
      if (!res) return null
      return { roots: res.roots, added: res.added }
    },
    removeRoot: async (folderPath) => store.removeRoot(folderPath),
    listChildFolders: async (dirPath) => store.listChildFolders(dirPath),
    mediaListDirect: async (folderPath) => store.mediaListDirect(folderPath),
    mediaList: async (folderPath) => store.mediaList(folderPath),
    mediaCountBatch: async (folderPaths) => store.mediaCountBatch(folderPaths),
    mediaFileUrl: (absolutePath) => store.mediaFileUrl(absolutePath),
  }
}
