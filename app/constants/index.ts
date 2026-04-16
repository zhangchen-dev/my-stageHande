import { TestStepType, ExecutionStrategy } from '@/types'

export const STEP_TYPES: { value: TestStepType; label: string; icon: string }[] = [
  { value: 'goto', label: '访问页面', icon: '🌐' },
  { value: 'click', label: '点击元素', icon: '🖱️' },
  { value: 'fill', label: '填写表单', icon: '⌨️' },
  { value: 'hover', label: '悬停元素', icon: '👆' },
  { value: 'screenshot', label: '截图', icon: '📸' },
  { value: 'wait', label: '等待', icon: '⏱️' },
  { value: 'scroll', label: '滚动', icon: '📜' },
  { value: 'js', label: 'JS执行', icon: '💻' },
  { value: 'clear', label: '清除状态', icon: '🗑️' },
  { value: 'followGuide', label: '跟随指引', icon: '🎯' },
  { value: 'condition', label: '条件判断', icon: '🔍' },
  { value: 'conditionLoop', label: '条件循环', icon: '🔄' },
  { value: 'gotoStep', label: '节点选择', icon: '🔗' },
]

export const STRATEGIES: { value: ExecutionStrategy; label: string; desc: string }[] = [
  { value: 'selector', label: '精确选择器', desc: '使用 id/class/xpath 等精确匹配' },
  { value: 'ai', label: 'AI 识别', desc: '使用 AI 模型智能识别元素' },
  { value: 'auto', label: '自动选择', desc: '优先选择器，失败后尝试 AI（推荐）' },
]

export const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  ready: 'processing',
  running: 'processing',
  completed: 'success',
  failed: 'error',
}

export const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
}

export function getStepTypeLabel(type: TestStepType): string {
  const found = STEP_TYPES.find(t => t.value === type)
  return found ? `${found.icon} ${found.label}` : type
}
