import { useEffect, useState } from 'react'
import { FolderTree } from './FolderTree'
import type { BrowserMediaStore } from '../shared/browserMedia'
import type { MediaBackend } from '../shared/mediaBackend'
import type { ImageMarkLevel } from '../shared/markLevel'

type Props = {
  folders: string[]
  treeSelectionPath: string | null
  expandImportedRoot: { path: string; nonce: number } | null
  imageMarks: Record<string, ImageMarkLevel>
  selectedPaths: Set<string>
  selectionMode: boolean
  browseFolderPath: string | null
  folderImagePaths: string[]
  exportReady: boolean
  browserStore: BrowserMediaStore | null
  media: MediaBackend
  onTreeSelectFolder: (path: string) => void
  onSelectImage: (path: string) => void
  onImportFolder: () => void
  onRemove: (p: string) => void
  onImagesDiscovered: (paths: string[]) => void
  onToggleImageSelect: (path: string) => void
  onSelectAll: () => void
  onEnterSelectionMode: () => void
  onClearSelection: () => void
  onExportJson: () => void
}

export function Sidebar({
  folders,
  treeSelectionPath,
  expandImportedRoot,
  imageMarks,
  selectedPaths,
  selectionMode,
  browseFolderPath,
  folderImagePaths,
  exportReady,
  browserStore,
  media,
  onTreeSelectFolder,
  onSelectImage,
  onImportFolder,
  onRemove,
  onImagesDiscovered,
  onToggleImageSelect,
  onSelectAll,
  onEnterSelectionMode,
  onClearSelection,
  onExportJson,
}: Props) {
  const [exportHintVisible, setExportHintVisible] = useState(false)

  useEffect(() => {
    if (!exportHintVisible) return
    const timer = window.setTimeout(() => setExportHintVisible(false), 2000)
    return () => window.clearTimeout(timer)
  }, [exportHintVisible])

  const handleExportClick = () => {
    if (!exportReady) return
    if (selectedPaths.size === 0) {
      setExportHintVisible(true)
      return
    }
    void onExportJson()
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          type="button"
          className="import-btn import-btn--primary"
          onClick={() => void onImportFolder()}
        >
          <span className="import-icon">+</span> Import Folder
        </button>
      </div>

      <div className="sidebar-tree-section">
        <div className="sidebar-heading">文件夹</div>
        <FolderTree
          roots={folders}
          browserStore={browserStore}
          treeSelectionPath={treeSelectionPath}
          expandImportedRoot={expandImportedRoot}
          imageMarks={imageMarks}
          selectionMode={selectionMode}
          selectedPaths={selectedPaths}
          onSelectFolder={onTreeSelectFolder}
          onSelectImage={onSelectImage}
          onToggleImageSelect={onToggleImageSelect}
          onRemoveRoot={onRemove}
          onImagesDiscovered={onImagesDiscovered}
          media={media}
          folderImagePaths={folderImagePaths}
        />
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-select-actions">
          <button
            type="button"
            className="sidebar-action-btn"
            disabled={!browseFolderPath}
            onClick={onSelectAll}
          >
            全选
          </button>
          <button
            type="button"
            className={`sidebar-action-btn ${selectionMode ? 'sidebar-action-btn--active' : ''}`}
            disabled={!browseFolderPath}
            onClick={onEnterSelectionMode}
          >
            选择
          </button>
          <button
            type="button"
            className="sidebar-action-btn"
            disabled={!selectionMode && selectedPaths.size === 0}
            onClick={onClearSelection}
          >
            取消
          </button>
        </div>
        <div className="sidebar-export-wrap">
          {exportHintVisible ? (
            <p className="sidebar-export-hint" role="status">
              请先选择文件，再导出标注文件
            </p>
          ) : null}
          <button
            type="button"
            className={`sidebar-export-btn ${exportReady && selectedPaths.size === 0 ? 'sidebar-export-btn--inactive' : ''}`}
            disabled={!exportReady}
            onClick={handleExportClick}
          >
            导出标注 JSON
          </button>
        </div>
        <div className="sidebar-bottom-bar-spacer" aria-hidden />
      </div>
    </aside>
  )
}
