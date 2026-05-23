import { CaretDownOutlined, CaretRightOutlined, FolderOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { theme } from 'antd'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NodeRendererProps, RowRendererProps } from 'react-arborist'
import { Tree, type NodeApi, type TreeApi } from 'react-arborist'
import { bridgeAPI } from '../shared/bridge'
import type { ChildFolderInfo } from '../shared/types'

export type FolderNode = {
  id: string
  name: string
  path: string
  children: FolderNode[]
}

const TITLE_RESERVE_RIGHT_PX = 20

function mapUpdateChildren(nodes: FolderNode[], id: string, newChildren: FolderNode[]): FolderNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, children: newChildren }
    if (n.children?.length) return { ...n, children: mapUpdateChildren(n.children, id, newChildren) }
    return n
  })
}

function collectFolderPaths(nodes: FolderNode[]): string[] {
  const out: string[] = []
  function walk(list: FolderNode[]) {
    for (const n of list) {
      out.push(n.path)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function DirectoryRow({ node, innerRef, attrs, children }: RowRendererProps<FolderNode>) {
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

function DirectoryNode({ node, style }: { node: NodeApi<FolderNode>; style: CSSProperties }) {
  const { token } = theme.useToken()
  const open = node.isOpen
  const folderIcon =
    !node.isLeaf && open ? (
      <FolderOpenOutlined style={{ color: 'var(--accent)', fontSize: 16 }} />
    ) : (
      <FolderOutlined style={{ color: 'var(--accent)', fontSize: 16 }} />
    )

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
      {!node.isLeaf ? (
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
          fontSize: token.fontSize,
          marginRight: TITLE_RESERVE_RIGHT_PX,
        }}
        title={node.data.path}
      >
        {node.data.name}
      </span>
    </div>
  )
}

type Props = {
  roots: string[]
  treeSelectionPath: string | null
  expandImportedRoot: { path: string; nonce: number } | null
  onSelectPath: (path: string | null) => void
  onRemoveRoot: (rootPath: string) => void
  bridgeReady: boolean
}

function basenameOnly(abs: string): string {
  const norm = abs.replaceAll('\\', '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : abs
}

export function FolderTree({
  roots,
  treeSelectionPath,
  expandImportedRoot,
  onSelectPath,
  onRemoveRoot,
  bridgeReady,
}: Props) {
  const { token } = theme.useToken()
  const treeRef = useRef<TreeApi<FolderNode>>(null)
  const loadedRef = useRef(new Set<string>())
  const folderCountsRef = useRef<Record<string, number>>({})
  const [treeData, setTreeData] = useState<FolderNode[]>([])
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 240, h: 400 })

  useEffect(() => {
    loadedRef.current = new Set()
    folderCountsRef.current = {}
    setFolderCounts({})
    setTreeData(
      roots.map((r) => ({
        id: r,
        name: basenameOnly(r),
        path: r,
        children: [],
      })),
    )
  }, [roots])

  useEffect(() => {
    if (!bridgeReady || treeData.length === 0) return
    const paths = collectFolderPaths(treeData)
    const missing = paths.filter((p) => !(p in folderCountsRef.current))
    if (missing.length === 0) return
    void bridgeAPI
      .mediaCountBatch(missing)
      .then((batch) => {
        for (const p of missing) folderCountsRef.current[p] = batch[p] ?? 0
        setFolderCounts({ ...folderCountsRef.current })
      })
      .catch(() => {
        for (const p of missing) folderCountsRef.current[p] = 0
        setFolderCounts({ ...folderCountsRef.current })
      })
  }, [treeData, bridgeReady])

  useEffect(() => {
    if (!expandImportedRoot || !bridgeReady) return
    const { path } = expandImportedRoot
    if (!roots.includes(path)) return

    const run = async () => {
      if (!loadedRef.current.has(path)) {
        try {
          const kids = await bridgeAPI.listChildFolders(path)
          loadedRef.current.add(path)
          const nextChildren: FolderNode[] = kids.map((k: ChildFolderInfo) => ({
            id: k.id,
            name: k.name,
            path: k.absolutePath,
            children: [],
          }))
          setTreeData((prev) => mapUpdateChildren(prev, path, nextChildren))
        } catch {
          return
        }
      }
      queueMicrotask(() => treeRef.current?.open(path))
    }
    void run()
  }, [expandImportedRoot?.path, expandImportedRoot?.nonce, bridgeReady, roots])

  useLayoutEffect(() => {
    const target = roots.length === 0 ? wrapRef.current : panelRef.current
    if (!target) return
    const measure = () => {
      setSize({ w: Math.max(160, target.clientWidth), h: Math.max(120, target.clientHeight) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(target)
    return () => ro.disconnect()
  }, [roots.length])

  const handleToggle = useCallback(
    (id: string) => {
      if (!bridgeReady) return
      queueMicrotask(() => {
        const api = treeRef.current
        if (!api?.isOpen(id)) return
        if (loadedRef.current.has(id)) return
        void bridgeAPI
          .listChildFolders(id)
          .then((kids) => {
            loadedRef.current.add(id)
            const nextChildren: FolderNode[] = kids.map((k) => ({
              id: k.id,
              name: k.name,
              path: k.absolutePath,
              children: [],
            }))
            setTreeData((prev) => mapUpdateChildren(prev, id, nextChildren))
          })
          .catch(() => {})
      })
    },
    [bridgeReady],
  )

  const DirectoryNodeWithExtras = useCallback(
    (props: NodeRendererProps<FolderNode>) => {
      const { node, style, dragHandle } = props
      const isRootRow = node.level === 0
      const count = folderCounts[node.data.path]
      const countLabel = count === undefined ? '…' : String(count)
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
            <DirectoryNode node={node} style={style} />
          </div>
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
    [folderCounts, onRemoveRoot, token.colorTextDescription],
  )

  return (
    <div
      ref={wrapRef}
      className={`directory-tree-wrap ${roots.length === 0 ? 'directory-tree-wrap--empty' : ''}`}
    >
      {roots.length === 0 ? (
        <div className="folder-tree-empty">No folders yet</div>
      ) : (
        <div ref={panelRef} className="directory-tree-panel">
          <Tree<FolderNode>
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
            onSelect={(nodes) => onSelectPath(nodes[0]?.data.path ?? null)}
            renderRow={DirectoryRow}
          >
            {DirectoryNodeWithExtras}
          </Tree>
        </div>
      )}
    </div>
  )
}
