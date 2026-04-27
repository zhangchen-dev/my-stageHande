/**
 * @file route.ts
 * @description 测试执行 API - 执行自动化测试任务并返回实时日志流
 * @module 测试执行 API
 * 
 * 路由：
 * - POST /api/test          启动测试执行（SSE 流式响应）
 * - GET  /api/test          查询是否有正在运行的任务
 * - PUT  /api/test          终止正在运行的测试任务
 * 
 * 功能：
 * - 初始化 Stagehand 浏览器实例
 * - 按顺序执行测试步骤（支持多种策略：selector/ai/auto）
 * - 通过 Server-Sent Events (SSE) 实时推送执行日志
 * - 支持任务中止和浏览器资源清理
 */

import { NextRequest } from 'next/server'
import { Stagehand } from '@browserbasehq/stagehand'
import { initDirectories, PATHS } from '@/utils/file'
import { logger } from '@/utils/logger'
import { TestStep, LogEntry, ExecutionStrategy, StepExecutionRecord } from '@/types'
import { executeTest } from '@/lib/executor'
import { registerTask, unregisterTask, abortTask, isTaskAborted, getAbortReason, hasRunningTasks } from '@/lib/task-manager'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  initDirectories()
  const requestData = await req.json()
  const steps: TestStep[] = requestData.steps
  const useHeadful: boolean = requestData.useHeadful || false
  const defaultStrategy: ExecutionStrategy = requestData.strategy || 'auto'
  const customScreenshotDir = requestData.screenshotOutputDir || undefined
  const testId: string = requestData.testId || `test_${Date.now()}`
  
  if (customScreenshotDir) {
    try {
      const fs = await import('fs')
      fs.mkdirSync(customScreenshotDir, { recursive: true })
      console.log(`[Test] 截图将保存到自定义目录: ${customScreenshotDir}`)
    } catch (e) {
      console.warn(`[Test] 无法创建截图目录 ${customScreenshotDir}, 使用默认目录`)
    }
  }
  const startTime = Date.now()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (log: LogEntry) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      let stagehand: Stagehand | null = null
      
      try {
        const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || ''
        const baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1'

        if (!apiKey) {
          throw new Error('未配置 API Key！请在 .env.local 中设置 SILICONFLOW_API_KEY 或 OPENAI_API_KEY')
        }

        console.log(`[Stagehand] 初始化配置: baseURL=${baseURL}, apiKey=${apiKey.substring(0, 10)}...`)

        stagehand = new Stagehand({
          env: 'LOCAL',
          model: {
            modelName: "gpt-4o",
            apiKey: apiKey,
            baseURL: baseURL,
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
        
        const page = stagehand.context.pages()[0]
        console.log('%c [ page ]-87', 'font-size:13px; background:pink; color:#bf2c9f;', page)

        sendLog({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🚀 测试任务 ${testId} 启动，共 ${steps.length} 个步骤`,
          details: { strategy: defaultStrategy, headless: !useHeadful },
        })

        const result = await executeTest(
          stagehand,
          page,
          steps,
          testId,
          defaultStrategy,
          (message: string) => {
            if (isTaskAborted(testId)) return
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'info',
              message,
            })
          },
          customScreenshotDir,
          testId
        )

        if (isTaskAborted(testId)) {
          sendLog({
            timestamp: new Date().toISOString(),
            level: 'warning',
            message: `⚹️ 任务已被终止: ${getAbortReason(testId)}`,
            details: { testId, aborted: true },
          })
        } else {
          for (const record of result.records) {
            sendLog({
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
                aiConfidence: record.aiConfidence,
                selectorUsed: record.selectorUsed,
              },
            })
          }

          const passedSteps = result.records.filter(r => r.status === 'success').length
          const failedSteps = result.records.filter(r => r.status === 'failed').length
          const totalDuration = Date.now() - startTime

          sendLog({
            timestamp: new Date().toISOString(),
            level: result.success ? 'success' : 'error',
            message: result.success
              ? `✅ 测试完成！通过: ${passedSteps}, 失败: ${failedSteps}, 耗时: ${(totalDuration / 1000).toFixed(1)}s`
              : `❌ 测试失败！通过: ${passedSteps}, 失败: ${failedSteps}, 耗时: ${(totalDuration / 1000).toFixed(1)}s`,
            details: {
              totalSteps: steps.length,
              passedSteps,
              failedSteps,
              totalDuration,
              success: result.success,
              error: result.error,
            },
          })
        }

        controller.close()

      } catch (error) {
        logger.error('测试执行失败', error as Error)
        
        sendLog({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `💥 测试异常终止: ${(error as Error).message}`,
          details: { error: (error as Error).stack },
        })
        
        controller.close()
      } finally {
        unregisterTask(testId)
        if (stagehand) {
          try {
            await stagehand.close()
            logger.info('Stagehand 已关闭')
          } catch (closeError) {
            logger.error('关闭 Stagehand 失败', closeError as Error)
          }
        }
      }
    }
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
  return Response.json({ 
    hasRunningTasks: hasRunningTasks(),
  })
}

export async function PUT(req: NextRequest) {
  const { testId, reason } = await req.json().catch(() => ({ testId: '', reason: '用户终止' }))
  
  if (!testId) {
    return Response.json({ success: false, error: '缺少 testId 参数' }, { status: 400 })
  }
  
  const success = abortTask(testId, reason)
  
  return Response.json({ 
    success, 
    message: success ? `终止信号已发送给任务 ${testId}` : `未找到运行中的任务 ${testId}` 
  })
}
