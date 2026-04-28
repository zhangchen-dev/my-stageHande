/**
 * @file route.ts
 * @description 批量任务执行 API - 支持多任务并行执行
 * @module 批量任务执行 API
 * 
 * 路由：
 * - POST /api/test/batch   启动批量任务执行
 * - GET  /api/test/batch   获取批量任务状态
 * - PUT  /api/test/batch   终止批量任务
 * 
 * 功能：
 * - 接收多个任务 ID
 * - 并行执行测试任务
 * - 通过 SSE 实时推送每个任务的执行日志
 * - 支持并发控制和任务中止
 */

import { NextRequest } from 'next/server'
import { TaskScheduler } from '@/lib/task-scheduler'
import { LogEntry, BatchTaskStatus } from '@/types'

export const dynamic = 'force-dynamic'

let schedulerInstance: TaskScheduler | null = null

export async function POST(req: NextRequest) {
  const requestData = await req.json()
  const tasks = requestData.tasks || []
  const maxConcurrency = requestData.maxConcurrency || 3

  if (!tasks || tasks.length === 0) {
    return Response.json({ error: '请提供要执行的任务列表' }, { status: 400 })
  }

  const batchId = `batch_${Date.now()}`
  console.log(`[BatchTest] 启动批量任务，批次ID: ${batchId}，任务数: ${tasks.length}，最大并发: ${maxConcurrency}`)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      schedulerInstance = new TaskScheduler({
        maxConcurrency,
        onTaskStart: (taskId, testId) => {
          const statusUpdate = {
            type: 'task_start',
            batchId,
            taskId,
            testId,
            timestamp: new Date().toISOString(),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusUpdate)}\n\n`))
        },
        onTaskComplete: (taskId, success) => {
          const statusUpdate = {
            type: 'task_complete',
            batchId,
            taskId,
            success,
            timestamp: new Date().toISOString(),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusUpdate)}\n\n`))
        },
        onTaskLog: (testId, log: LogEntry) => {
          const logUpdate = {
            type: 'task_log',
            batchId,
            testId,
            ...log,
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(logUpdate)}\n\n`))
        },
        onTaskProgress: (taskId, progress) => {
          const progressUpdate = {
            type: 'task_progress',
            batchId,
            taskId,
            progress,
            timestamp: new Date().toISOString(),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressUpdate)}\n\n`))
        },
      })

      for (const task of tasks) {
        const testId = `test_${task.taskId}_${Date.now()}`
        schedulerInstance.addTask({
          taskId: task.taskId,
          testId,
          taskName: task.taskName,
          steps: task.steps,
          useHeadful: task.useHeadful || false,
          strategy: task.strategy || 'auto',
          stepInterval: task.stepInterval,
        })
      }

      const batchStartLog: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `🚀 批量任务启动，共 ${tasks.length} 个任务，最大并发: ${maxConcurrency}`,
        details: { batchId, taskCount: tasks.length, maxConcurrency },
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'batch_start', batchId, ...batchStartLog })}\n\n`))

      try {
        await schedulerInstance.executeAll()

        const batchLogs = schedulerInstance.getBatchLogs()
        const successCount = batchLogs.filter(l => l.status === 'success').length
        const failedCount = batchLogs.filter(l => l.status === 'error').length

        const batchCompleteLog: LogEntry = {
          timestamp: new Date().toISOString(),
          level: failedCount === 0 ? 'success' : 'warning',
          message: `✅ 批量任务完成！成功: ${successCount}, 失败: ${failedCount}`,
          details: { batchId, successCount, failedCount, total: tasks.length },
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'batch_complete', batchId, ...batchCompleteLog })}\n\n`))

      } catch (error) {
        const errorLog: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `💥 批量任务执行异常: ${(error as Error).message}`,
          details: { batchId, error: (error as Error).stack },
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'batch_error', batchId, ...errorLog })}\n\n`))
      }

      schedulerInstance = null
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

export async function GET() {
  if (!schedulerInstance) {
    return Response.json({
      hasRunningTasks: false,
      activeTasks: [],
    })
  }

  const activeTasks = schedulerInstance.getAllActiveTasks().map(task => ({
    taskId: task.taskId,
    testId: task.testId,
    taskName: task.taskName,
    status: task.status,
    progress: task.progress,
  }))

  return Response.json({
    hasRunningTasks: schedulerInstance.hasRunningTasks(),
    activeTasks,
  })
}

export async function PUT(req: NextRequest) {
  const { testIds, reason } = await req.json().catch(() => ({ testIds: [], reason: '用户终止' }))

  if (!schedulerInstance) {
    return Response.json({ success: false, error: '没有运行中的批量任务' }, { status: 400 })
  }

  if (testIds && testIds.length > 0) {
    for (const testId of testIds) {
      schedulerInstance.abortTask(testId, reason)
    }
    return Response.json({
      success: true,
      message: `已终止 ${testIds.length} 个任务`,
    })
  }

  schedulerInstance.abortAll(reason)
  return Response.json({
    success: true,
    message: '已终止所有任务',
  })
}
