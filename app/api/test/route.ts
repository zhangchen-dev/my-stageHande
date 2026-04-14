import { NextRequest } from 'next/server'
import { Stagehand } from '@browserbasehq/stagehand'
import { initDirectories, PATHS } from '@/utils/file'
import { logger } from '@/utils/logger'
import { TestStep, TestTask, LogEntry, ElementSelector, ExecutionStrategy } from '@/types'
import path from 'path'
import fs from 'fs'
import { executeStep, toExecutionRecord } from '@/lib/executor'
import { StepExecutionRecord } from '@/types'

export const dynamic = 'force-dynamic'

// 支持的策略列表
const STRATEGIES: ExecutionStrategy[] = ['selector', 'ai', 'screenshot', 'auto']

export async function POST(req: NextRequest) {
  initDirectories()
  const requestData = await req.json()
  const steps: TestStep[] = requestData.steps
  const useHeadful: boolean = requestData.useHeadful || false
  const defaultStrategy: ExecutionStrategy = requestData.strategy || 'auto'
  
  // 获取自定义截图输出目录（默认保存到项目 public/screenshots）
  const customScreenshotDir = requestData.screenshotOutputDir || undefined
  
  // 如果指定了自定义目录，确保它存在
  if (customScreenshotDir) {
    try {
      fs.mkdirSync(customScreenshotDir, { recursive: true })
      console.log(`[Test] 截图将保存到自定义目录: ${customScreenshotDir}`)
    } catch (e) {
      console.warn(`[Test] 无法创建截图目录 ${customScreenshotDir}, 使用默认目录`)
    }
  }
  
  const testId = `test_${Date.now()}`
  const startTime = Date.now()
  const executionRecords: StepExecutionRecord[] = []

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (log: LogEntry) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      let stagehand: Stagehand | null = null
      let page: any = null
      
      try {
        // 1. 初始化 Stagehand
        // 使用用户配置的 API Key 和 Base URL
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
        
        page = stagehand.context.pages()[0]

        sendLog({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🚀 测试任务 ${testId} 启动，共 ${steps.length} 个步骤`,
          details: { strategy: defaultStrategy, headless: !useHeadful },
        })

        // 2. 执行测试步骤
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          const strategy = step.strategy || defaultStrategy
          
          sendLog({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[步骤 ${i + 1}/${steps.length}] ${step.type}: ${step.description}`,
            stepId: step.id,
            details: { strategy, selector: step.selector },
          })

          try {
            // 使用执行引擎执行步骤
            const stepRecord = await executeStep(stagehand, page, step, testId, strategy, customScreenshotDir)
            
            // 处理循环模式返回的多条记录（如 followGuide loop）
            const loopRecords = (stepRecord as unknown as Record<string, unknown>)._loopRecords as StepExecutionRecord[] | undefined
            if (loopRecords && loopRecords.length > 0) {
              // 循环模式：将每轮迭代作为独立记录
              executionRecords.push(...loopRecords)
              
              for (const iterRecord of loopRecords) {
                sendLog({
                  timestamp: iterRecord.endTime || new Date().toISOString(),
                  level: iterRecord.status === 'success' ? 'success' : iterRecord.status === 'skipped' ? 'info' : 'error',
                  message: iterRecord.status === 'success'
                    ? `🔄 ${iterRecord.description}`
                    : iterRecord.status === 'skipped'
                      ? `⏹️ ${iterRecord.description}`
                      : `❌ ${iterRecord.description} - ${iterRecord.error}`,
                  stepId: iterRecord.stepId,
                  screenshot: iterRecord.screenshot,
                  details: { duration: iterRecord.duration },
                })
              }
              
              // 发送循环汇总
              sendLog({
                timestamp: stepRecord.endTime || new Date().toISOString(),
                level: (stepRecord as unknown as Record<string, unknown>)._loopTotalIterations as number > 0 ? 'success' : 'info',
                message: `🔄 循环完成！共 ${(stepRecord as unknown as Record<string, unknown>)._loopTotalIterations} 轮，成功 ${loopRecords.filter(r => r.status === 'success').length}/${loopRecords.length} 轮`,
                stepId: step.id,
                screenshot: stepRecord.screenshot,
                details: {
                  totalIterations: (stepRecord as unknown as Record<string, unknown>)._loopTotalIterations,
                  successCount: loopRecords.filter(r => r.status === 'success').length,
                  duration: stepRecord.duration,
                  strategy: stepRecord.strategy,
                },
              })
            } else {
              // 非循环模式：正常记录
              executionRecords.push(stepRecord)
              
              // 发送执行记录
              sendLog({
                timestamp: stepRecord.endTime || new Date().toISOString(),
                level: stepRecord.status === 'success' ? 'success' : 'error',
                message: stepRecord.status === 'success' 
                  ? `✅ ${stepRecord.description} (策略: ${stepRecord.strategy})`
                  : `❌ ${stepRecord.description} - ${stepRecord.error}`,
                stepId: step.id,
                screenshot: stepRecord.screenshot,
                details: {
                  strategy: stepRecord.strategy,
                  duration: stepRecord.duration,
                  aiConfidence: stepRecord.aiConfidence,
                  selectorUsed: stepRecord.selectorUsed,
                },
              })
            }

            // 如果步骤失败，可以选择继续或停止
            if (stepRecord.status === 'failed') {
              const continueOnError = requestData.continueOnError
              if (!continueOnError) {
                throw new Error(stepRecord.error || '步骤执行失败')
              }
            }

            // 步骤间短暂缓冲
            await new Promise(resolve => setTimeout(resolve, 300))
          } catch (stepError) {
            const errorRecord: StepExecutionRecord = {
              stepId: step.id,
              stepType: step.type,
              description: step.description,
              strategy,
              status: 'failed',
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              error: (stepError as Error).message,
            }
            executionRecords.push(errorRecord)
            
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'error',
              message: `❌ 步骤失败: ${step.description} - ${(stepError as Error).message}`,
              stepId: step.id,
            })
            
            throw stepError
          }
        }

        // 3. 计算执行结果统计
        const passedSteps = executionRecords.filter(r => r.status === 'success').length
        const failedSteps = executionRecords.filter(r => r.status === 'failed').length
        const totalDuration = Date.now() - startTime

        sendLog({
          timestamp: new Date().toISOString(),
          level: failedSteps > 0 ? 'warning' : 'success',
          message: `🎉 测试完成！通过: ${passedSteps}/${steps.length}，耗时: ${(totalDuration / 1000).toFixed(1)}s`,
          details: {
            totalSteps: steps.length,
            passedSteps,
            failedSteps,
            duration: totalDuration,
            executionRecords: executionRecords.map(toExecutionRecord),
          },
        })

      } catch (error) {
        const totalDuration = Date.now() - startTime
        logger.error(`测试任务 ${testId} 异常终止`, { error: (error as Error).stack })
        
        sendLog({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `💥 测试异常终止: ${(error as Error).message}`,
          details: {
            duration: totalDuration,
            executionRecords: executionRecords.map(toExecutionRecord),
          },
        })
      } finally {
        if (stagehand) await stagehand.close()
        controller.close()
      }
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

// GET 请求 - 获取支持的策略列表
export async function GET() {
  return Response.json({
    strategies: STRATEGIES.map(s => ({
      value: s,
      label: {
        selector: '精确选择器（id/class/xpath）',
        ai: 'AI 智能识别',
        screenshot: '截图匹配',
        auto: '自动选择（推荐）',
      }[s],
      description: {
        selector: '使用 id、class、xpath 等精确选择器定位元素，速度快但需要准确的选择器',
        ai: '使用 AI 模型识别页面元素，适合复杂或动态页面',
        screenshot: '基于截图对比定位元素，适合视觉回归测试',
        auto: '自动选择最优策略，优先选择器其次 AI',
      }[s],
    })),
  })
}
