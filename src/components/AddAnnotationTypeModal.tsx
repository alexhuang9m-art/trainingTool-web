import { Modal, Input } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import type { NewAnnotationGuideInput } from '../shared/annotationGuide'

const { TextArea } = Input

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (input: NewAnnotationGuideInput) => void
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function AddAnnotationTypeModal({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [p0Text, setP0Text] = useState('')
  const [p1Text, setP1Text] = useState('')
  const [illustrationP0, setIllustrationP0] = useState<string | undefined>()
  const [illustrationP1, setIllustrationP1] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setTitle('')
    setP0Text('')
    setP1Text('')
    setIllustrationP0(undefined)
    setIllustrationP1(undefined)
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const handleOk = () => {
    const t = title.trim()
    const p0 = p0Text.trim()
    if (!t) {
      setError('请填写标注标题')
      return
    }
    if (!p0) {
      setError('请填写 P0 描述')
      return
    }
    onSubmit({
      title: t,
      p0Text: p0,
      p1Text: p1Text.trim() || undefined,
      illustrationP0,
      illustrationP1,
    })
    reset()
    onClose()
  }

  const onFile = async (file: File | undefined, level: 'P0' | 'P1') => {
    if (!file?.type.startsWith('image/')) return
    try {
      const url = await readImageFile(file)
      if (level === 'P0') setIllustrationP0(url)
      else setIllustrationP1(url)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal
      title="添加标注类型"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="添加"
      cancelText="取消"
      destroyOnClose
      width={400}
      className="add-guide-modal"
    >
      <div className="add-guide-form">
        <label className="add-guide-field">
          <span className="add-guide-label">
            标注标题 <span className="add-guide-required">*</span>
          </span>
          <Input
            value={title}
            placeholder="例如：镜头脏污/lensDirt"
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="add-guide-field">
          <span className="add-guide-label">
            P0 描述 <span className="add-guide-required">*</span>
          </span>
          <TextArea
            value={p0Text}
            rows={2}
            placeholder="P0 等级说明"
            onChange={(e) => {
              setP0Text(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="add-guide-field">
          <span className="add-guide-label">P1 描述</span>
          <TextArea
            value={p1Text}
            rows={2}
            placeholder="选填"
            onChange={(e) => setP1Text(e.target.value)}
          />
        </label>
        <div className="add-guide-field">
          <span className="add-guide-label">示意图</span>
          <div className="add-guide-illustration-row">
            <label className="add-guide-file-btn">
              P0（选填）
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void onFile(e.target.files?.[0], 'P0')
                  e.target.value = ''
                }}
              />
            </label>
            <label className="add-guide-file-btn">
              P1（选填）
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void onFile(e.target.files?.[0], 'P1')
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {(illustrationP0 || illustrationP1) && (
            <p className="add-guide-file-hint">
              {illustrationP0 ? '已选 P0 图' : ''}
              {illustrationP0 && illustrationP1 ? ' · ' : ''}
              {illustrationP1 ? '已选 P1 图' : ''}
            </p>
          )}
        </div>
        {error ? <p className="add-guide-error">{error}</p> : null}
      </div>
    </Modal>
  )
}
