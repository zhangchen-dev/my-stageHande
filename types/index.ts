// ==================== 操作类型 ====================

export type TestStepType = 'goto' | 'click' | 'fill' | 'hover' | 'screenshot' | 'wait' | 'scroll' | 'clear' | 'js' | 'followGuide'

// ==================== 元素选择器配置 ====================

/**
 * 元素选择器配置
 * 支持多种定位方式，按优先级排序
 */
export interface ElementSelector {
  /** 元素 ID */
  id?: string
  /** 元素 class 名称 */
  className?: string
  /** 元素文本内容（精确匹配） */
  text?: string
  /** 元素文本内容（包含匹配） */
  containsText?: string
  /** CSS 选择器 */
  css?: string
  /** XPath 选择器 */
  xpath?: string
  /** 元素名称属性 */
  name?: string
  /** 数据测试 ID */
  testId?: string
  /** 类名前缀匹配（如 DemoMap_startBtn 匹配所有以该前缀开头的 class） */
  classPrefix?: string
}

/**
 * 执行策略
 * 定义元素定位的执行策略
 */
export type ExecutionStrategy = 
  | 'selector'   // 使用精确选择器（id、class、xpath 等）
  | 'ai'         // AI 识别
  | 'screenshot' // 截图匹配
  | 'auto'       // 自动选择最优策略

// ==================== 指引气泡信息 ====================

/**
 * 引导指引气泡检测信息
 */
export interface GuideBubbleInfo {
  /** 是否检测到指引气泡 */
  exists: boolean
  /** 气泡文本内容 */
  text?: string
  /** 气泡指向的目标元素选择器 */
  targetSelector?: string
  /** 目标元素位置（用于点击） */
  targetPosition?: { x: number; y: number }
  /** 当前步骤编号 */
  currentStep?: number
  /** 总步骤数 */
  totalSteps?: number
}

// ==================== 测试步骤 ====================

export interface TestStep {
  id: string
  type: TestStepType
  description: string // 操作描述（AI 识别的核心依据）
  value?: string      // URL / 输入内容
  selector?: ElementSelector // 元素选择器（精确匹配优先）
  strategy?: ExecutionStrategy // 执行策略
  /** followGuide 特有：最大等待气泡出现的时间(ms) */
  maxWaitTime?: number
  /** followGuide 特有：是否在无气泡时尝试唤起引导 */
  tryActivateGuide?: boolean
  /**
   * followGuide 循环模式：设为 true 时自动循环检测并点击指引气泡
   * 直到页面没有气泡或达到 maxLoopIterations 次数为止
   * 适合步骤不确定但操作模式相同的引导流程
   */
  loop?: boolean
  /** followGuide 循环模式：最大循环次数（默认50，防止死循环） */
  maxLoopIterations?: number
}

// ==================== 测试任务 ====================

export type TaskStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed'

export interface TestTask {
  id: string
  name: string
  description?: string
  steps: TestStep[]
  status: TaskStatus
  createdAt: string
  updatedAt: string
  tags?: string[] // 标签分类
}

// ==================== 执行记录 ====================

export interface StepExecutionRecord {
  stepId: string
  stepType: TestStepType
  description: string
  strategy: ExecutionStrategy
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  startTime?: string
  endTime?: string
  duration?: number // 耗时（毫秒）
  error?: string
  screenshot?: string // 执行过程中的截图
  aiConfidence?: number // AI 识别置信度
  selectorUsed?: ElementSelector // 实际使用的选择器
  maskClosed?: boolean // 是否关闭了 mask 遮罩层
  maskScreenshot?: string // 关闭 mask 时的截图
  frameName?: string // 元素所在的 iframe 名称
  guideBubbleInfo?: GuideBubbleInfo // 检测到的引导气泡信息（followGuide 步骤专用）
}

/**
 * 单次执行记录
 */
export interface ExecutionRecord {
  id: string
  stepId: string
  timestamp: string
  status: 'success' | 'failed' | 'skipped'
  message: string
  screenshot?: string
  selectorUsed?: ElementSelector
  aiConfidence?: number
}

// ==================== 测试结果 ====================

export type ResultStatus = 'success' | 'failed' | 'partial' | 'running'

export interface TestResult {
  id: string
  taskId: string
  taskName: string
  status: ResultStatus
  executedAt: string
  duration: number // 总耗时（毫秒）
  totalSteps: number
  passedSteps: number
  failedSteps: number
  skippedSteps: number
  executionRecords: ExecutionRecord[]
  screenshots: string[] // 所有截图路径
  errorMessage?: string
  metadata?: {
    browser: string
    viewport: string
    headless: boolean
  }
}

// ==================== 日志条目 ====================

export interface LogEntry {
  timestamp: string
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
  screenshot?: string
  stepId?: string
  details?: Record<string, unknown>
}

// ==================== API 请求/响应类型 ====================

export interface ExecuteTaskRequest {
  taskId: string
  useHeadful?: boolean
  steps?: TestStep[] // 可选，如果提供则覆盖任务中的步骤
}

export interface TaskListResponse {
  tasks: TestTask[]
  total: number
}

export interface ExecuteTaskResponse {
  resultId: string
  streamUrl?: string // SSE 流地址
}
