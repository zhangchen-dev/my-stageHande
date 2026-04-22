import { Page } from 'playwright'

export enum OperationType {
  CONDITION = 'CONDITION',
  CLICK = 'CLICK',
  OPEN_PAGE = 'OPEN_PAGE',
  FORM_FILL = 'FORM_FILL',
  SCROLL = 'SCROLL',
  NODE_SELECT = 'NODE_SELECT',
  SCRIPT_EXEC = 'SCRIPT_EXEC',
  HOVER = 'HOVER',
  SCREENSHOT = 'SCREENSHOT',
  AI_TASK = 'AI_TASK',
  WAIT = 'WAIT',
}

export enum ExecuteStrategy {
  AUTO = 'AUTO',
  AI = 'AI',
  SELECTOR = 'SELECTOR',
}

export interface WorkflowNode {
  id: string
  name: string
  type: OperationType
  strategy: ExecuteStrategy
  params: Record<string, any>
  nextNodeId?: string
  conditionTrueNodeId?: string
  conditionFalseNodeId?: string
}

export interface WorkflowConfig {
  startNodeId: string
  nodes: WorkflowNode[]
}

export interface WorkflowContext {
  page: Page
  stagehand: any
  variables: Map<string, any>
  logs: Array<{
    nodeId: string
    timestamp: number
    success: boolean
    msg: string
  }>
  screenshotDir?: string
  testId?: string
}

export interface ExecutionResult {
  success: boolean
  data?: any
  error?: string
  nextNodeId?: string
}
