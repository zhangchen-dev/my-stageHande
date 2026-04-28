/**
 * @file task-scheduler.ts
 * @description 任务调度器 - 管理多任务并行执行
 * @module 任务调度
 * 
 * 职责：
 * - 管理任务队列
 * - 控制并发数（信号量机制）
 * - 任务状态追踪
 * - 日志收集和管理
 */

import { Stagehand } from '@browserbasehq/stagehand'
import { TestStep, LogEntry, ExecutionStrategy, BatchExecutionLog, BatchTaskStatusType } from '@/types'
import { executeTest } from './executor'
import { registerTask, unregisterTask, abortTask, isTaskAborted } from './task-manager'
import { PATHS } from '@/utils/file'

interface QueuedTask {
  taskId: string
  testId: string
  taskName: string
  steps: TestStep[]
  useHeadful: boolean
  strategy: ExecutionStrategy
  stepInterval?: number
  status: BatchTaskStatusType
  progress: number
  startTime: string
  logs: LogEntry[]
  stagehand?: Stagehand
  error?: string
}

interface TaskSchedulerConfig {
  maxConcurrency: number
  onTaskStart?: (taskId: string, testId: string) => void
  onTaskComplete?: (taskId: string, success: boolean) => void
  onTaskLog?: (testId: string, log: LogEntry) => void
  onTaskProgress?: (taskId: string, progress: number) => void
}

export class TaskScheduler {
  private maxConcurrency: number
  private runningCount: number = 0
  private taskQueue: QueuedTask[] = []
  private activeTasks: Map<string, QueuedTask> = new Map()
  private batchLogs: Map<string, BatchExecutionLog> = new Map()
  private onTaskStart?: (taskId: string, testId: string) => void
  private onTaskComplete?: (taskId: string, success: boolean) => void
  private onTaskLog?: (testId: string, log: LogEntry) => void
  private onTaskProgress?: (taskId: string, progress: number) => void

  constructor(config: TaskSchedulerConfig) {
    this.maxConcurrency = config.maxConcurrency || 3
    this.onTaskStart = config.onTaskStart
    this.onTaskComplete = config.onTaskComplete
    this.onTaskLog = config.onTaskLog
    this.onTaskProgress = config.onTaskProgress
  }

  /**
   * 添加任务到队列
   */
  addTask(task: {
    taskId: string
    testId: string
    taskName: string
    steps: TestStep[]
    useHeadful: boolean
    strategy: ExecutionStrategy
    stepInterval?: number
  }): void {
    const queuedTask: QueuedTask = {
      ...task,
      status: 'pending',
      progress: 0,
      startTime: new Date().toISOString(),
      logs: [],
    }

    this.taskQueue.push(queuedTask)
    this.initTaskLog(task.testId, task.taskId, task.taskName)
    console.log(`[TaskScheduler] 任务已加入队列: ${task.taskName} (队列长度: ${this.taskQueue.length})`)
  }

  /**
   * 初始化任务日志对象
   */
  initTaskLog(testId: string, taskId: string, taskName: string): void {
    const batchLog: BatchExecutionLog = {
      id: `log_${testId}`,
      batchId: `batch_${Date.now()}`,
      taskId,
      taskName,
      testId,
      startTime: new Date().toISOString(),
      status: 'running',
      logs: [],
      stepsCount: 0,
      successSteps: 0,
      failedSteps: 0,
      createdAt: new Date().toISOString(),
    }
    this.batchLogs.set(testId, batchLog)
  }

  /**
   * 记录任务日志
   */
  addTaskLog(testId: string, log: LogEntry): void {
    const batchLog = this.batchLogs.get(testId)
    if (batchLog) {
      batchLog.logs.push(log)
    }
    this.onTaskLog?.(testId, log)
  }

  /**
   * 更新任务进度
   */
  updateTaskProgress(testId: string, progress: number): void {
    const task = Array.from(this.activeTasks.values()).find(t => t.testId === testId)
    if (task) {
      task.progress = progress
      this.onTaskProgress?.(task.taskId, progress)
    }
  }

  /**
   * 执行所有队列中的任务
   */
  async executeAll(): Promise<void> {
    console.log(`[TaskScheduler] 开始执行队列，共 ${this.taskQueue.length} 个任务，最大并发: ${this.maxConcurrency}`)

    const executeNext = async (): Promise<void> => {
      if (this.taskQueue.length === 0) return

      if (this.runningCount >= this.maxConcurrency) {
        console.log(`[TaskScheduler] 已达到最大并发数 ${this.maxConcurrency}，等待任务完成`)
        return
      }

      const task = this.taskQueue.shift()
      if (!task) return

      this.runningCount++
      this.activeTasks.set(task.testId, task)

      this.executeTask(task).finally(() => {
        this.runningCount--
        this.activeTasks.delete(task.testId)
        executeNext()
      })

      if (this.runningCount < this.maxConcurrency && this.taskQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        executeNext()
      }
    }

    const initialBatch = Math.min(this.maxConcurrency, this.taskQueue.length)
    for (let i = 0; i < initialBatch; i++) {
      executeNext()
      if (i < initialBatch - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    const { taskId, testId, taskName, steps, useHeadful, strategy, stepInterval } = task

    console.log(`[TaskScheduler] 开始执行任务: ${taskName}`)
    task.status = 'running'
    this.onTaskStart?.(taskId, testId)

    let stagehand: Stagehand | null = null

    try {
      const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || ''
      const baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1'

      if (!apiKey) {
        throw new Error('未配置 API Key！请在 .env.local 中设置 SILICONFLOW_API_KEY 或 OPENAI_API_KEY')
      }

      stagehand = new Stagehand({
        env: 'LOCAL',
        model: {
          modelName: 'gpt-4o',
          apiKey,
          baseURL,
        },
        cacheDir: PATHS.CACHE,
        verbose: 1,
        domSettleTimeout: 5000,
        localBrowserLaunchOptions: {
          headless: !useHeadful,
          viewport: { width: 1920, height: 1080 },
        },
      })

      await stagehand.init()
      registerTask(testId, stagehand)
      task.stagehand = stagehand

      const page = stagehand.context.pages()[0]

      this.addTaskLog(testId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `🚀 测试任务 ${taskName} 启动，共 ${steps.length} 个步骤`,
        details: { strategy, headless: !useHeadful },
      })

      const result = await executeTest(
        stagehand,
        page,
        steps,
        testId,
        strategy,
        (message: string) => {
          if (isTaskAborted(testId)) return
          this.addTaskLog(testId, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message,
          })
        },
        undefined,
        testId,
        stepInterval
      )

      for (const record of result.records) {
        this.addTaskLog(testId, {
          timestamp: record.endTime || new Date().toISOString(),
          level: record.status === 'success' ? 'success' : record.status === 'failed' ? 'error' : 'info',
          message: record.status === 'success'
            ? `✅ ${record.description} (策略: ${record.strategy})`
            : record.status === 'failed'
              ? `❌ ${record.description} - ${record.error}`
              : `⏹️ ${record.description}`,
          stepId: record.stepId,
          screenshot: record.screenshot,
          details: {
            strategy: record.strategy,
            duration: record.duration,
          },
        })
      }

      const passedSteps = result.records.filter(r => r.status === 'success').length
      const failedSteps = result.records.filter(r => r.status === 'failed').length

      this.addTaskLog(testId, {
        timestamp: new Date().toISOString(),
        level: result.success ? 'success' : 'error',
        message: result.success
          ? `✅ 测试完成！通过: ${passedSteps}, 失败: ${failedSteps}`
          : `❌ 测试失败！通过: ${passedSteps}, 失败: ${failedSteps}`,
        details: {
          totalSteps: steps.length,
          passedSteps,
          failedSteps,
          success: result.success,
          error: result.error,
        },
      })

      task.status = result.success ? 'success' : 'failed'
      task.progress = 100
      this.updateTaskProgress(testId, 100)

    } catch (error) {
      const errorMessage = (error as Error).message
      const isAborted = errorMessage.startsWith('TASK_ABORTED:') || isTaskAborted(testId)

      task.status = isAborted ? 'aborted' : 'failed'
      task.error = errorMessage

      this.addTaskLog(testId, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: isAborted ? `⚹️ 任务已被终止: ${errorMessage}` : `💥 测试异常终止: ${errorMessage}`,
        details: { error: (error as Error).stack },
      })
    } finally {
      if (stagehand) {
        try {
          await stagehand.close()
          console.log(`[TaskScheduler] Stagehand 已关闭: ${taskName}`)
        } catch (e) {
          console.error(`[TaskScheduler] 关闭 Stagehand 失败: ${taskName}`, e)
        }
      }

      unregisterTask(testId)
      await this.saveTaskLog(testId)
      this.onTaskComplete?.(taskId, task.status === 'success')
      console.log(`[TaskScheduler] 任务执行完成: ${taskName} (${task.status})`)
    }
  }

  /**
   * 中止任务
   */
  abortTask(testId: string, reason: string = '用户终止'): boolean {
    const task = this.activeTasks.get(testId)
    if (task) {
      console.log(`[TaskScheduler] 中止任务: ${task.taskName}`)
      abortTask(testId, reason)
      task.status = 'aborted'
      return true
    }
    return false
  }

  /**
   * 中止所有任务
   */
  abortAll(reason: string = '用户终止'): void {
    console.log(`[TaskScheduler] 中止所有任务`)
    for (const [testId, task] of this.activeTasks) {
      abortTask(testId, reason)
      task.status = 'aborted'
    }
    this.taskQueue = []
  }

  /**
   * 保存任务日志到数据库
   */
  private async saveTaskLog(testId: string): Promise<void> {
    const batchLog = this.batchLogs.get(testId)
    if (!batchLog) return

    batchLog.endTime = new Date().toISOString()
    batchLog.duration = new Date(batchLog.endTime).getTime() - new Date(batchLog.startTime).getTime()
    batchLog.status = batchLog.logs.some(l => l.level === 'error') ? 'error' : 'success'
    batchLog.stepsCount = batchLog.logs.filter(l => l.stepId).length
    batchLog.successSteps = batchLog.logs.filter(l => l.level === 'success').length
    batchLog.failedSteps = batchLog.logs.filter(l => l.level === 'error').length

    try {
      await fetch('http://localhost:3000/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchLog),
      })
      console.log(`[TaskScheduler] 日志已保存: ${batchLog.taskName}`)
    } catch (e) {
      console.error(`[TaskScheduler] 保存日志失败:`, e)
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(testId: string): QueuedTask | undefined {
    return this.activeTasks.get(testId) || this.taskQueue.find(t => t.testId === testId)
  }

  /**
   * 获取所有运行中任务
   */
  getAllActiveTasks(): QueuedTask[] {
    return Array.from(this.activeTasks.values())
  }

  /**
   * 获取批次所有任务的日志
   */
  getBatchLogs(): BatchExecutionLog[] {
    return Array.from(this.batchLogs.values())
  }

  /**
   * 是否有运行中的任务
   */
  hasRunningTasks(): boolean {
    return this.runningCount > 0 || this.taskQueue.length > 0
  }
}
