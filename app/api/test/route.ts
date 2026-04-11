import { NextRequest } from 'next/server'
import { Stagehand } from '@browserbasehq/stagehand'
import { initDirectories, PATHS } from '@/utils/file'
import { logger } from '@/utils/logger'
import { TestStep, LogEntry } from '@/types'
import path from 'path'
import { error } from 'console'
import { message } from 'antd'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  initDirectories()
  const requestData = await req.json()
  const steps: TestStep[] = requestData.steps
  const useHeadful: boolean = requestData.useHeadful || false // 获取有头浏览器配置
  
  const testId = `test_${Date.now()}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (log: LogEntry) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      let stagehand: Stagehand | null = null
      try {
        // 1. 初始化 Stagehand（v3 正确配置：移除 enableCaching）
        stagehand = new Stagehand({
          env: 'LOCAL',
          model: {
            modelName: "Qwen/Qwen3-VL-32B-Instruct", // 例如 openai/Qwen/Qwen2-72B-Instruct
            apiKey: process.env.SILICONFLOW_API_KEY,
            baseURL: "https://api.siliconflow.cn/v1",
          },
          cacheDir: PATHS.CACHE, // 配置 cacheDir 即自动开启缓存
          verbose: 1,
          apiKey: process.env.OPENAI_API_KEY, // 添加 OpenAI API key
          localBrowserLaunchOptions: {
            headless: !useHeadful, // 根据配置设置有头/无头模式
            viewport: { width: 1920, height: 1080 },
          },
        })
        await stagehand.init()
        
        const page = stagehand.context.pages()[0] // 提取page对象到循环外部

        sendLog({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🚀 测试任务 ${testId} 启动，共 ${steps.length} 个步骤`,
        })

        // 3. 逐步骤执行测试（v3 兼容写法）
        for (const step of steps) {
          sendLog({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `执行步骤 ${step.id}: ${step.description}`,
          })

          try {
            switch (step.type) {
              case 'goto':
                if (!step.value) throw new Error('Goto step must provide URL')
                // 直接使用page.goto()而不是AI act，确保URL正确导航
                await page.goto(step.value, { waitUntil: 'networkidle' }).catch((error) => {
                  sendLog({
                    timestamp: new Date().toISOString(),
                    level: 'error',
                    message: `执行步骤 ${step.id}: ${step.description}=>${error.message}`,
                  })
                  throw error
                })
                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'success',
                  message: `✅ 导航成功: ${step.value}`,
                })
                break

              case 'click':
                await stagehand.act(`Click: ${step.description}`).catch((error) => {
                  sendLog({
                    timestamp: new Date().toISOString(),
                    level: 'error',
                    message: `执行步骤 ${step.id}: ${step.description}=>${error.message}`,
                  })
                  throw error
                })
                // 记录成功点击日志
                const clickSuccessMsg = `✅ Click successful: ${step.description}`
                logger.info(clickSuccessMsg, { testId, stepId: step.id })
                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'success',
                  message: clickSuccessMsg,
                })
                break

              case 'fill':
                if (!step.value) {
                  throw new Error('Fill step must provide input content')
                }
                await stagehand.act(`Input in ${step.description}: ${step.value}`).catch((error) => {
                  sendLog({
                    timestamp: new Date().toISOString(),
                    level: 'error',
                    message: `执行步骤 ${step.id}: ${step.description}=>${error.message}`,
                  })
                  throw error
                })
                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'success',
                  message: `✅ Input successful: ${step.description}`,
                })
                break
            }

            await new Promise(resolve => setTimeout(resolve, 800)) // 页面稳定等待
          } catch (stepError) {
            // 失败自动截图（v3 兼容写法）
            const screenshotName = `${testId}_step_${step.id}_fail.png`
            const screenshotPath = path.join(PATHS.SCREENSHOTS, screenshotName)
            await page.screenshot({ path: screenshotPath, fullPage: true })

            const errorMsg = `❌ 步骤失败: ${step.description} - ${(stepError as Error).message}`
            logger.error(errorMsg, { testId, stepId: step.id, screenshotPath })
            
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'error',
              message: errorMsg,
              screenshot: `/screenshots/${screenshotName}`,
            })
            throw stepError
          }
        }

        // 4. 全流程成功
        sendLog({
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `🎉 测试任务 ${testId} 全部通过！`,
        })
      } catch (error) {
        logger.error(`测试任务 ${testId} 异常终止`, { error: (error as Error).stack })
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