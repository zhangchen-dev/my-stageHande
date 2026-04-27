/**
 * @file types.ts
 * @description 工作流核心类型定义 - 用于前端工作流编辑器
 * @module 工作流类型系统
 * 
 * 主要类型：
 * - OperationType: 操作类型枚举（CONDITION, CLICK, OPEN_PAGE 等）
 * - ExecuteStrategy: 执行策略枚举（AUTO, AI, SELECTOR）
 * - WorkflowNode: 工作流节点定义
 * - WorkflowConfig: 工作流配置（节点图结构）
 * - WorkflowContext: 工作流执行上下文
 * - ExecutionResult: 执行结果
 * 
 * 使用场景：
 * - 前端工作流编辑器组件
 * - 工作流配置的存储和传输
 * - 节点配置面板
 * 
 * 注意：
 * - 这些类型用于 UI 层的工作流可视化编辑
 * - 实际执行时会转换为 TestStep[] 格式
 * - 执行引擎位于 lib/executor/ 目录，不使用此处的类型
 */

import { Page } from 'playwright'

export enum OperationType {
  START = 'START',
  END = 'END',
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
