import {
  CaretDownOutlined,
  CaretRightOutlined,
  FileImageOutlined,
  FolderOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { theme } from 'antd'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NodeRendererProps, RowRendererProps } from 'react-arborist'
import { Tree, type NodeApi, type TreeApi } from 'react-arborist'
import type { MediaBackend } from '../shared/mediaBackend'
import { BrowserMediaStore } from '../shared/browserMedia'
import type { ImageMarkLevel } from '../shared/markLevel'
import type { ChildFolderInfo, MediaListItem } from '../shared/types'

export type TreeNode = {
  id: string
  name: string
  path: string
  kind: 'folder' | 'image'
  children: TreeNode[]
}

const TITLE_RESERVE_RIGHT_PX = 20

function mapUpdateChildren(nodes: TreeNode[], id: string, newChildren: TreeNode[]): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, children: newChildren }
    if (n.children?.length) return { ...n, children: mapUpdateChildren(n.children, id, newChildren) }
    return n
  })
}

function collectFolderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = []
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.kind === 'folder') out.push(n.path)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function basenameOnly(abs: string): string {
  const norm = abs.replaceAll('\\', '/').replace(/\/+$/, '')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}

function folderDisplayName(path: string, rawName?: string): string {
  const trimmed = rawName?.trim()
  if (trimmed && trimmed !== path && !trimmed.includes('/') && !trimmed.includes('\\')) {
    return trimmed
  }
  const base = basenameOnly(path)
  return base || trimmed || path
}

function treeNodeLabel(data: TreeNode): string {
  if (data.kind === 'image') return data.name
  return folderDisplayName(data.path, data.name)
}

function toFolderNode(path: string, rawName?: string): TreeNode {
  return {
    id: path,
    name: folderDisplayName(path, rawName),
    path,
    kind: 'folder',
    children: [],
  }
}

function toImageNode(item: MediaListItem): TreeNode {
  return {
    id: item.absolutePath,
    name: item.basename,
    path: item.absolutePath,
    kind: 'image',
    children: [],
  }
}

function DirectoryRow({ node, innerRef, attrs, children }: RowRendererProps<TreeNode>) {
  const { token } = theme.useToken()
  return (
    <div
      {...attrs}
      ref={innerRef}
      onFocus={(e) => e.stopPropagation()}
      onClick={node.handleClick}
      className="directory-tree-row"
      style={{
        ...(attrs.style as CSSProperties),
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        background: node.isSelected ? token.controlItemBgActive : undefined,
        borderRadius: token.borderRadiusSM,
        outline: node.isFocused ? `1px solid ${token.colorPrimary}` : undefined,
        outlineOffset: -1,
      }}
    >
      {children}
    </div>
  )
}

function imageMarkSlotClass(
  selectionMode: boolean,
  selected: boolean,
  mark: ImageMarkLevel | null | undefined,
): string {
  if (!selectionMode) return 'tree-mark-slot tree-mark-slot--compact'
  if (!selected) return 'tree-mark-slot tree-mark-slot--ring-idle'
  if (mark === 'P0') return 'tree-mark-slot tree-mark-slot--selected-p0'
  if (mark === 'P1') return 'tree-mark-slot tree-mark-slot--selected-p1'
  return 'tree-mark-slot tree-mark-slot--selected-accent'
}

function DirectoryNode({
  node,
  style,
  mark,
  selectionMode,
  selected,
}: {
  node: NodeApi<TreeNode>
  style: CSSProperties
  mark: ImageMarkLevel | null | undefined
  selectionMode: boolean
  selected: boolean
}) {
  const { token } = theme.useToken()
  const isImage = node.data.kind === 'image'
  const open = node.isOpen

  const folderIcon =
    !isImage && open ? (
      <FolderOpenOutlined style={{ color: 'var(--accent)', fontSize: 16 }} />
    ) : !isImage ? (
      <FolderOutlined style={{ color: 'var(--accent)', fontSize: 16 }} />
    ) : (
      <FileImageOutlined style={{ color: token.colorTextDescription, fontSize: 15 }} />
    )

  const dotClass =
    mark === 'P0'
      ? 'tree-mark-dot tree-mark-dot--p0'
      : mark === 'P1'
        ? 'tree-mark-dot tree-mark-dot--p1'
        : 'tree-mark-dot tree-mark-dot--empty'

  const slotClass = isImage ? imageMarkSlotClass(selectionMode, selected, mark) : ''

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
        height: '100%',
        paddingRight: 4,
        overflow: 'hidden',
        color: token.colorText,
      }}
    >
      {isImage ? (
        <span className={slotClass} aria-hidden>
          <span className={dotClass} />
        </span>
      ) : !node.isLeaf ? (
        <span
          className="directory-tree-switcher"
          role="button"
          tabIndex={-1}
          aria-label={open ? '收起' : '展开'}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            node.toggle()
          }}
          style={{
            width: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: token.colorIcon,
            cursor: 'pointer',
          }}
        >
          {open ? <CaretDownOutlined style={{ fontSize: 10 }} /> : <CaretRightOutlined style={{ fontSize: 10 }} />}
        </span>
      ) : (
        <span style={{ width: 18, flexShrink: 0 }} />
      )}
      <span style={{ flexShrink: 0, lineHeight: 0 }}>{folderIcon}</span>
      <span
        className="directory-tree-title"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: isImage ? token.fontSizeSM : token.fontSize,
          marginRight: isImage ? 0 : TITLE_RESERVE_RIGHT_PX,
        }}
        title={isImage ? node.data.path : treeNodeLabel(node.data)}
      >
        {treeNodeLabel(node.data)}
      </span>
    </div>
  )
}

type Props = {
  roots: string[]
  browserStore: BrowserMediaStore | null
  treeSelectionPath: string | null
  expandImportedRoot: { path: string; nonce: number } | null
  imageMarks: Record<string, ImageMarkLevel>
  selectionMode: boolean
  selectedPaths: Set<string>
  onSelectFolder: (path: string) => void
  onSelectImage: (path: string) => void
  onToggleImageSelect: (path: string) => void
  onRemoveRoot: (rootPath: string) => void
  onImagesDiscovered: (paths: string[]) => void
  media: MediaBackend
}

async function loadFolderChildren(media: MediaBackend, folderPath: string): Promise<TreeNode[]> {
  const [kids, images] = await Promise.all([
    media.listChildFolders(folderPath),
    media.mediaListDirect(folderPath),
  ])
  const subfolders: TreeNode[] = kids.map((k: ChildFolderInfo) => toFolderNode(k.absolutePath, k.name))
  const files: TreeNode[] = images.map(toImageNode)
  return [...subfolders, ...files]
}

export function FolderTree({
  roots,
  browserStore,
  treeSelectionPath,
  expandImportedRoot,
  imageMarks,
  selectionMode,
  selectedPaths,
  onSelectFolder,
  onSelectImage,
  onToggleImageSelect,
  onRemoveRoot,
  onImagesDiscovered,
  media,
}: Props) {
  const { token } = theme.useToken()
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const loadedRef = useRef(new Set<string>())
  const folderCountsRef = useRef<Record<string, number>>({})
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 240, h: 400 })

  useEffect(() => {
    loadedRef.current = new Set()
    folderCountsRef.current = {}
    setFolderCounts({})

    if (roots.length > 0) {
      setTreeData(
        roots.map((r) => toFolderNode(r, browserStore?.getRootLabel(r) ?? undefined)),
      )
      return
    }

    setTreeData([])
  }, [roots, browserStore])

  useEffect(() => {
    if (treeData.length === 0) return
    const paths = collectFolderPaths(treeData)
    const missing = paths.filter((p) => !(p in folderCountsRef.current))
    if (missing.length === 0) return
    void media
      .mediaCountBatch(missing)
      .then((batch) => {
        for (const p of missing) folderCountsRef.current[p] = batch[p] ?? 0
        setFolderCounts({ ...folderCountsRef.current })
      })
      .catch(() => {
        for (const p of missing) folderCountsRef.current[p] = 0
        setFolderCounts({ ...folderCountsRef.current })
      })
  }, [treeData, media])

  const applyLoadedChildren = useCallback(
    (folderPath: string, children: TreeNode[]) => {
      loadedRef.current.add(folderPath)
      setTreeData((prev) => mapUpdateChildren(prev, folderPath, children))
      const imagePaths = children.filter((c) => c.kind === 'image').map((c) => c.path)
      if (imagePaths.length) onImagesDiscovered(imagePaths)
    },
    [onImagesDiscovered],
  )

  useEffect(() => {
    if (!expandImportedRoot) return
    const { path } = expandImportedRoot
    if (!roots.includes(path)) return

    const run = async () => {
      if (!loadedRef.current.has(path)) {
        try {
          applyLoadedChildren(path, await loadFolderChildren(media, path))
        } catch {
          return
        }
      }
      queueMicrotask(() => treeRef.current?.open(path))
    }
    void run()
  }, [expandImportedRoot?.path, expandImportedRoot?.nonce, roots, applyLoadedChildren, media])

  useLayoutEffect(() => {
    const target = treeData.length === 0 ? wrapRef.current : panelRef.current
    if (!target) return
    const measure = () => {
      setSize({ w: Math.max(160, target.clientWidth), h: Math.max(120, target.clientHeight) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(target)
    return () => ro.disconnect()
  }, [treeData.length])

  const handleToggle = useCallback(
    (id: string) => {
      const node = treeRef.current?.get(id)
      if (node?.data.kind !== 'folder') return

      queueMicrotask(() => {
        const api = treeRef.current
        if (!api?.isOpen(id)) return
        if (loadedRef.current.has(id)) return
        void loadFolderChildren(media, id)
          .then((children) => applyLoadedChildren(id, children))
          .catch(() => {})
      })
    },
    [media, applyLoadedChildren],
  )

  const DirectoryNodeWithExtras = useCallback(
    (props: NodeRendererProps<TreeNode>) => {
      const { node, style, dragHandle } = props
      const isRootRow = node.level === 0 && node.data.kind === 'folder'
      const isImage = node.data.kind === 'image'
      const count = !isImage ? folderCounts[node.data.path] : undefined
      const countLabel = count === undefined ? (isImage ? '' : '…') : String(count)

      return (
        <div
          ref={dragHandle}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            minWidth: 0,
            gap: 4,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <DirectoryNode
              node={node}
              style={style}
              mark={isImage ? imageMarks[node.data.path] : undefined}
              selectionMode={isImage ? selectionMode : false}
              selected={isImage ? selectedPaths.has(node.data.path) : false}
            />
          </div>
          {!isImage ? (
            <span
              style={{
                flexShrink: 0,
                minWidth: 28,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                color: token.colorTextDescription,
              }}
            >
              {countLabel}
            </span>
          ) : null}
          {isRootRow ? (
            <button
              type="button"
              className="folder-tree-root-remove"
              aria-label="Remove imported folder"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveRoot(node.data.path)
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      )
    },
    [folderCounts, imageMarks, selectionMode, selectedPaths, onRemoveRoot, token.colorTextDescription],
  )

  return (
    <div
      ref={wrapRef}
      className={`directory-tree-wrap ${treeData.length === 0 ? 'directory-tree-wrap--empty' : ''}`}
    >
      {treeData.length === 0 ? (
        <div className="folder-tree-empty">No folders yet</div>
      ) : (
        <div ref={panelRef} className="directory-tree-panel">
          <Tree<TreeNode>
            ref={treeRef}
            data={treeData}
            width={size.w}
            height={size.h}
            indent={16}
            rowHeight={28}
            overscanCount={8}
            openByDefault={false}
            selection={treeSelectionPath ?? undefined}
            disableDrag
            disableDrop
            disableMultiSelection
            onToggle={handleToggle}
            onSelect={(nodes) => {
              const n = nodes[0]?.data
              if (!n) return
              if (n.kind === 'image') {
                if (selectionMode) {
                  onToggleImageSelect(n.path)
                  return
                }
                onSelectImage(n.path)
                return
              }
              onSelectFolder(n.path)
              if (!loadedRef.current.has(n.path)) {
                void loadFolderChildren(media, n.path)
                  .then((children) => {
                    applyLoadedChildren(n.path, children)
                    queueMicrotask(() => treeRef.current?.open(n.path))
                  })
                  .catch(() => {})
              } else {
                queueMicrotask(() => treeRef.current?.open(n.path))
              }
            }}
            renderRow={DirectoryRow}
          >
            {DirectoryNodeWithExtras}
          </Tree>
        </div>
      )}
    </div>
  )
}
