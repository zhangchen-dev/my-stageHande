export interface ExecutionLog {
  id: string
  taskId: string
  taskName: string
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

export interface LogEntry {
  timestamp: string
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
  screenshot?: string
  stepId?: string
  details?: Record<string, unknown>
}
