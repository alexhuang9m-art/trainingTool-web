# Training Tool Web

用于 QLoRA / 视觉模型微调的照片标注工具：在图片上标注 **P0（红色）** 与 **P1（橙色）** 运动模糊区域。

## 架构

| 部分 | 说明 |
|------|------|
| **前端** (`src/`) | Vite + React，左右分栏；左侧栏 UI 迁移自 [Widmax](https://github.com) 的文件夹树设计 |
| **本地 Bridge** (`server/`) | Node.js + Express，负责系统文件夹选择、读盘、保存/导出标注 JSON |
| **Vercel** | 托管静态前端；与本地相同的 UI，通过浏览器「Import Folder」选目录标注（标注存于 localStorage） |
| **GitHub** | 代码仓库 |

```
┌─────────────┬──────────────────────────────────┐
│  Sidebar    │  标注工作区                        │
│  Import     │  P0 红笔 / P1 橙笔                 │
│  Folder树   │  Canvas 叠加在照片上                │
│  照片列表   │                                   │
└─────────────┴──────────────────────────────────┘
         ▲
         │ 开发时 /api → localhost:3921
         ▼
   Node bridge (osascript 选文件夹等)
```

## 本地开发

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>
- Bridge：<http://127.0.0.1:3921>

仅启动前端：`npm run dev:web`  
仅启动 bridge：`npm run dev:bridge`

## 标注数据格式

单张图（`PUT /api/annotations` 或浏览器 localStorage）：

```json
{
  "imagePath": "/path/to/photo.jpg",
  "version": 1,
  "strokes": [
    {
      "id": "uuid",
      "level": "P0",
      "width": 14,
      "points": [{ "x": 120, "y": 340 }, { "x": 125, "y": 350 }]
    }
  ]
}
```

坐标为**原图像素坐标**，便于后续生成 mask 或 COCO 风格导出。

文件夹导出（侧边栏「导出标注 JSON」）包含：

- **`annotationTypes`**：所有内置与自定义标注类型的说明（`title`、`englishName`、各等级 `P0`/`P1` 的 `description`）；折线上的 `categoryEnglishName` 与该字段对应
- **`markLegend`**：`mark` 字段含义（`P0` / `P1` / `clear`）
- **`images`**：每张图的 `mark`、`shapes`（折线含 `categoryEnglishName`）

```json
{
  "version": 1,
  "folderPath": "/path/to/folder",
  "exportedAt": "2026-05-23T12:00:00.000Z",
  "markLegend": {
    "P0": "…",
    "P1": "…",
    "clear": "…"
  },
  "annotationTypes": [
    {
      "id": "motion-blur",
      "title": "运动模糊/motionblur",
      "englishName": "motionblur",
      "shortcut": "Q",
      "levels": [
        { "level": "P1", "description": "有肉眼可见的运动模糊…" },
        { "level": "P0", "description": "非常严重的运动模糊…" }
      ]
    }
  ],
  "images": [
    {
      "imagePath": "/path/to/photo.jpg",
      "basename": "photo.jpg",
      "mark": "P0",
      "shapes": []
    }
  ]
}
```

Bridge 模式：`POST /api/annotations/export` 返回 `images`；前端导出时会合并当前会话中的 `annotationTypes`（含 localStorage 里的自定义类型）。

## 部署到 Vercel

1. 将本仓库推送到 **GitHub**
2. 在 [vercel.com](https://vercel.com) 导入该仓库
3. Framework Preset 选 **Vite**，Build Command `npm run build`，Output `dist`
4. 部署完成后，分享 URL 即可使用（与本地相同的界面；在浏览器中选择文件夹导入）

**本地增强**：运行 bridge 可将标注持久化到磁盘，并使用系统文件夹选择器：

```bash
npm run dev
```

生产静态站会自动检测 bridge；若本机同时运行 `npm run start:bridge` 并设置 `VITE_BRIDGE_URL`，也可在部署页连接本地 bridge。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `BRIDGE_PORT` | `3921` | Bridge 端口 |
| `BRIDGE_HOST` | `127.0.0.1` | 绑定地址 |
| `TRAINING_TOOL_DATA` | `server/.data` | 文件夹列表与标注存储目录 |
| `VITE_BRIDGE_URL` | _(空，走 Vite 代理 `/api`)_ | 生产环境指向本机 bridge 的完整 URL |

## GitHub 初始化示例

```bash
git init
git add .
git commit -m "Initial motion blur annotation tool"
git remote add origin git@github.com:YOUR_USER/trainingTool-web.git
git push -u origin main
```

## 快捷键

- 工具栏切换 **P0 / P1** 画笔
- **撤销** / **清除** 当前笔画

## 后续可扩展

- 将 stroke 栅格化为 PNG mask 导出
- 与 Label Studio / CVAT 格式互转
- WebSocket 协作标注
