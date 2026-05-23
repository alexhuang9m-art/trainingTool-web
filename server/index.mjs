import cors from 'cors'
import express from 'express'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.BRIDGE_PORT ?? 3921)
const HOST = process.env.BRIDGE_HOST ?? '127.0.0.1'

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

function foldersStorePath() {
  const base = process.env.TRAINING_TOOL_DATA ?? path.join(__dirname, '.data')
  return path.join(base, 'folders.json')
}

function annotationsDir() {
  const base = process.env.TRAINING_TOOL_DATA ?? path.join(__dirname, '.data')
  return path.join(base, 'annotations')
}

async function readFolders() {
  try {
    const raw = await fs.readFile(foldersStorePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

async function writeFolders(list) {
  const file = foldersStorePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8')
}

function normalize(p) {
  return path.normalize(p)
}

function isPathUnderRoots(candidate, roots) {
  const c = normalize(candidate)
  for (const root of roots) {
    const r = normalize(root)
    if (c === r) return true
    const prefix = r.endsWith(path.sep) ? r : r + path.sep
    if (c.startsWith(prefix)) return true
  }
  return false
}

async function listChildFolders(dirPath) {
  const normalized = normalize(dirPath)
  if (!existsSync(normalized)) return []
  let entries
  try {
    entries = await fs.readdir(normalized, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return dirs.map((d) => {
    const absolutePath = normalize(path.join(normalized, d.name))
    return { id: absolutePath, name: d.name, absolutePath }
  })
}

async function forEachImageUnder(rootDir, onFile) {
  const normalized = normalize(rootDir)
  if (!existsSync(normalized)) return

  const visited = new Set()

  async function walk(dir) {
    let real
    try {
      real = await fs.realpath(dir)
    } catch {
      return
    }
    if (visited.has(real)) return
    visited.add(real)

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase()
        if (!IMAGE_EXTENSIONS.has(ext)) continue
        onFile(normalize(full), ent.name)
      }
    }
  }

  await walk(normalized)
}

async function countImagesInFolder(rootDir) {
  let n = 0
  await forEachImageUnder(rootDir, () => {
    n += 1
  })
  return n
}

async function scanImages(rootDir) {
  const items = []
  await forEachImageUnder(rootDir, (absolutePath, basename) => {
    items.push({ absolutePath, basename, kind: 'image' })
  })
  items.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base' }))
  return items
}

async function scanImagesDirect(dirPath) {
  const normalized = normalize(dirPath)
  if (!existsSync(normalized)) return []
  let entries
  try {
    entries = await fs.readdir(normalized, { withFileTypes: true })
  } catch {
    return []
  }
  const items = []
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const ext = path.extname(ent.name).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) continue
    const absolutePath = normalize(path.join(normalized, ent.name))
    items.push({ absolutePath, basename: ent.name, kind: 'image' })
  }
  items.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base' }))
  return items
}

function annotationFileFor(imagePath) {
  const key = Buffer.from(imagePath).toString('base64url')
  return path.join(annotationsDir(), `${key}.json`)
}

async function pickFolderNative() {
  const platform = process.platform
  if (platform === 'darwin') {
    const script = 'POSIX path of (choose folder with prompt "选择照片文件夹")'
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    const chosen = stdout.trim()
    return chosen || null
  }
  if (platform === 'win32') {
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      $d = New-Object System.Windows.Forms.FolderBrowserDialog
      $d.Description = "选择照片文件夹"
      if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }
    `
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps], {
      windowsHide: true,
    })
    const chosen = stdout.trim()
    return chosen || null
  }
  return null
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT })
})

app.get('/api/folders', async (_req, res) => {
  res.json(await readFolders())
})

app.post('/api/folders/pick', async (_req, res) => {
  const chosen = await pickFolderNative()
  if (!chosen) {
    res.json(null)
    return
  }
  const normalized = normalize(chosen)
  const list = await readFolders()
  if (!list.includes(normalized)) {
    list.push(normalized)
    await writeFolders(list)
  }
  res.json({ roots: await readFolders(), added: normalized })
})

app.post('/api/folders/remove', async (req, res) => {
  const folderPath = typeof req.body?.path === 'string' ? req.body.path : ''
  const list = (await readFolders()).filter((p) => p !== folderPath)
  await writeFolders(list)
  res.json(list)
})

app.get('/api/fs/children', async (req, res) => {
  const dirPath = typeof req.query.path === 'string' ? req.query.path : ''
  const roots = await readFolders()
  if (!isPathUnderRoots(dirPath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  res.json(await listChildFolders(dirPath))
})

app.get('/api/media/count', async (req, res) => {
  const paths = String(req.query.paths ?? '')
    .split('|')
    .filter(Boolean)
    .slice(0, 160)
  const roots = await readFolders()
  const out = {}
  await Promise.all(
    paths.map(async (p) => {
      if (!isPathUnderRoots(p, roots)) {
        out[p] = 0
        return
      }
      out[p] = await countImagesInFolder(p)
    }),
  )
  res.json(out)
})

app.get('/api/media/list', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  const roots = await readFolders()
  if (!isPathUnderRoots(folderPath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  res.json(await scanImages(folderPath))
})

app.get('/api/media/list-direct', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  const roots = await readFolders()
  if (!isPathUnderRoots(folderPath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  res.json(await scanImagesDirect(folderPath))
})

app.get('/api/media/file', async (req, res) => {
  const abs = typeof req.query.path === 'string' ? req.query.path : ''
  const roots = await readFolders()
  if (!abs || !isPathUnderRoots(abs, roots) || !existsSync(abs)) {
    res.status(404).end()
    return
  }
  res.sendFile(abs)
})

app.get('/api/annotations', async (req, res) => {
  const imagePath = typeof req.query.path === 'string' ? req.query.path : ''
  const roots = await readFolders()
  if (!imagePath || !isPathUnderRoots(imagePath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  const file = annotationFileFor(imagePath)
  try {
    const raw = await fs.readFile(file, 'utf8')
    res.type('json').send(raw)
  } catch {
    res.json({ imagePath, shapes: [], version: 1 })
  }
})

app.put('/api/annotations', async (req, res) => {
  const payload = req.body
  const imagePath = typeof payload?.imagePath === 'string' ? payload.imagePath : ''
  const roots = await readFolders()
  if (!imagePath || !isPathUnderRoots(imagePath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  await fs.mkdir(annotationsDir(), { recursive: true })
  const file = annotationFileFor(imagePath)
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8')
  res.json({ ok: true })
})

app.post('/api/annotations/export', async (req, res) => {
  const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath : ''
  const roots = await readFolders()
  if (!folderPath || !isPathUnderRoots(folderPath, roots)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  const images = await scanImages(folderPath)
  const bundle = []
  for (const img of images) {
    const file = annotationFileFor(img.absolutePath)
    let shapes = []
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.shapes)) shapes = parsed.shapes
      else if (Array.isArray(parsed.strokes)) {
        shapes = parsed.strokes.map((s) => ({
          ...s,
          kind: s.kind === 'polyline' ? 'polyline' : 'brush',
        }))
      }
    } catch {
      /* empty */
    }
    bundle.push({
      imagePath: img.absolutePath,
      basename: img.basename,
      shapes,
    })
  }
  res.json({ folderPath, exportedAt: new Date().toISOString(), images: bundle })
})

const server = http.createServer(app)
server.listen(PORT, HOST, () => {
  console.log(`[bridge] http://${HOST}:${PORT}`)
})
