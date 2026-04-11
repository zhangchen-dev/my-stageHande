export type TestStepType = 'goto' | 'click' | 'fill'

export interface TestStep {
  id: string
  type: TestStepType
  description: string // AI 识别的核心依据（越精准越好）
  value?: string      // URL / 输入内容
  selector?: string   // 可选：传统 CSS/XPath 兜底（稳定元素优先用）
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'success' | 'error'
  message: string
  screenshot?: string // 失败截图的 public 路径
}