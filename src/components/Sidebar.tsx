import { FolderTree } from './FolderTree'
import type { MediaListItem } from '../shared/types'

type Props = {
  folders: string[]
  treeSelectionPath: string | null
  expandImportedRoot: { path: string; nonce: number } | null
  bridgeReady: boolean
  bridgeHint: string | null
  media: MediaListItem[]
  activeImagePath: string | null
  annotatedPaths: Set<string>
  onTreeSelectFolder: (path: string | null) => void
  onImportFolder: () => void
  onImportFiles: () => void
  onRemove: (p: string) => void
  onSelectImage: (path: string) => void
}

export function Sidebar({
  folders,
  treeSelectionPath,
  expandImportedRoot,
  bridgeReady,
  bridgeHint,
  media,
  activeImagePath,
  annotatedPaths,
  onTreeSelectFolder,
  onImportFolder,
  onImportFiles,
  onRemove,
  onSelectImage,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          type="button"
          className="import-btn"
          disabled={!bridgeReady}
          title={bridgeReady ? undefined : '请先启动本地 bridge：npm run dev:bridge'}
          onClick={() => void onImportFolder()}
        >
          <span className="import-icon">+</span> Import Folder
        </button>
        <button type="button" className="import-btn" onClick={() => void onImportFiles()}>
          <span className="import-icon">+</span> Import Photos
        </button>
      </div>

      {bridgeHint ? <p className="bridge-hint">{bridgeHint}</p> : null}

      <div className="sidebar-tree-section">
        <div className="sidebar-heading">Folders</div>
        <FolderTree
          roots={folders}
          treeSelectionPath={treeSelectionPath}
          expandImportedRoot={expandImportedRoot}
          onSelectPath={onTreeSelectFolder}
          onRemoveRoot={onRemove}
          bridgeReady={bridgeReady}
        />
      </div>

      {media.length > 0 ? (
        <div className="image-list-section">
          <div className="sidebar-heading">Photos ({media.length})</div>
          <div className="image-list">
            {media.map((m) => {
              const done = annotatedPaths.has(m.absolutePath)
              return (
                <button
                  key={m.absolutePath}
                  type="button"
                  className={`image-list-item ${activeImagePath === m.absolutePath ? 'image-list-item--active' : ''}`}
                  onClick={() => onSelectImage(m.absolutePath)}
                >
                  <span className={`image-list-dot ${done ? 'image-list-dot--done' : 'image-list-dot--empty'}`} />
                  <span title={m.basename}>{m.basename}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="sidebar-bottom">
        <div className="sidebar-heading">运动模糊等级</div>
        <div className="blur-legend">
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--p0" />
            <span>P0 — 红色笔（严重运动模糊）</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--p1" />
            <span>P1 — 橙色笔（轻度运动模糊）</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
