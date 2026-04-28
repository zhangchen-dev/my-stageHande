/**
 * @file batch-task.ts
 * @description 批量任务执行相关类型定义
 * @module 批量任务类型
 * 
 * 职责：
 * - 定义批量任务执行的状态类型
 * - 定义批量任务请求和响应类型
 * - 定义批量执行日志类型
 */

import { LogEntry, ExecutionStrategy } from './index'

export type BatchTaskStatusType = 'pending' | 'running' | 'success' | 'failed' | 'aborted'

export interface BatchTaskStatus {
  taskId: string
  testId: string
  taskName: string
  status: BatchTaskStatusType
  progress: number
  startTime: string
  endTime?: string
  error?: string
}

export interface BatchExecuteRequest {
  taskIds: string[]
  maxConcurrency?: number
  useHeadful?: boolean
  strategy?: ExecutionStrategy
}

export interface BatchExecuteResponse {
  batchId: string
  tasks: BatchTaskStatus[]
}

export interface BatchTaskProgress {
  batchId: string
  tasks: BatchTaskStatus[]
  completedCount: number
  totalCount: number
  status: 'running' | 'completed' | 'partial' | 'failed'
}

export interface BatchExecutionLog {
  id: string
  batchId: string
  taskId: string
  taskName: string
  testId: string
  startTime: string
  endTime?: string
  duration?: number
  status: 'running' | 'success' | 'error' | 'aborted'
  logs: LogEntry[]
  stepsCount: number
  successSteps: number
  failedSteps: number
  createdAt: string
}

export interface BatchExecutionSummary {
  batchId: string
  startTime: string
  endTime?: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  abortedTasks: number
  taskLogs: BatchExecutionLog[]
}

export interface TaskLogInfo {
  taskName: string
  status: BatchTaskStatusType
  logs: LogEntry[]
}

export interface RunningTaskInfo {
  taskId: string
  testId: string
  taskName: string
  status: BatchTaskStatusType
  progress: number
  startTime: string
  abortController?: AbortController
}
