import { Page } from 'playwright'
import { TestStep, ExecutionStrategy, StepExecutionRecord } from '@/types'
import { PATHS } from '@/utils/file'
import path from 'path'
import fs from 'fs'
import { executeInteraction } from './action-executor'
import { buildSelectorString } from './element-finder'

export function toExecutionRecord(record: StepExecutionRecord): StepExecutionRecord {
  const { ...rest } = record as any
  delete rest._internal
  return rest as StepExecutionRecord
}

async function waitForDomSettle(page: Page, timeout: number = 10000): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout })
  } catch {}

  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  } catch {}

  try {
    await page.waitForFunction(() => document.readyState === 'complete', { timeout })
  } catch {}
}

export async function executeStep(
  stagehand: any,
  page: Page,
  step: TestStep,
  testId: string,
  strategy: ExecutionStrategy = 'auto',
  customScreenshotDir?: string
): Promise<StepExecutionRecord> {
  const record: StepExecutionRecord = {
    stepId: step.id,
    stepType: step.type,
    description: step.description,
    strategy,
    status: 'running',
    startTime: new Date().toISOString(),
  }

  const screenshotDir = customScreenshotDir || PATHS.SCREENSHOTS
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  try {
    if (step.type !== 'goto') {
      await waitForDomSettle(page, 8000)
    }

    switch (step.type) {
      case 'goto':
        if (!step.value) throw new Error('Goto 步骤必须提供 URL')
        await page.goto(step.value, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await waitForDomSettle(page, 15000)
        record.status = 'success'
        break

      case 'clear':
        try {
          await page.context().clearCookies()
          await page.evaluate(() => {
            window.sessionStorage.clear()
            window.localStorage.clear()
          })
        } catch {}
        record.status = 'success'
        break

      case 'click':
      case 'fill':
      case 'hover':
        await executeInteraction(stagehand, page, step, strategy, screenshotDir, testId, record)
        break

      case 'wait':
        const waitMs = parseInt(step.value || '3000', 10)
        await page.waitForTimeout(waitMs)
        record.status = 'success'
        break

      case 'screenshot':
        const screenshotName = `${testId}_${step.id}_${Date.now()}.png`
        const screenshotPath = path.join(screenshotDir, screenshotName)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        record.screenshot = `/screenshots/${screenshotName}`
        record.status = 'success'
        break

      case 'js': {
        if (!step.value && !step.selector) {
          throw new Error('JS 步骤必须提供 JavaScript 代码或选择器')
        }

        let jsResult: any
        if (step.value) {
          jsResult = await page.evaluate((code: string) => {
            try {
              return eval(code)
            } catch (e) {
              throw e
            }
          }, step.value)
        } else if (step.selector) {
          const selectorStr = buildSelectorString(step.selector)
          if (!selectorStr) {
            throw new Error('无效的选择器配置')
          }
          const element = await page.locator(selectorStr).first()
          if (await element.count() === 0) {
            throw new Error(`未找到元素：${selectorStr}`)
          }
          await element.click()
          jsResult = 'clicked'
        }

        record.result = JSON.stringify(jsResult)
        record.status = 'success'
        break
      }

      case 'extract': {
        if (!step.value) {
          throw new Error('Extract 步骤必须提供提取指令')
        }
        const result = await stagehand.extract(step.value, { page })
        record.extractedData = JSON.stringify(result)
        record.status = 'success'
        break
      }

      case 'condition': {
        // 条件判断步骤：本步骤执行成功后，执行 thenSteps 中的步骤
        // 执行失败后，执行后续步骤（跳出）
        const subSteps = step.thenSteps || []
        const subRecords: StepExecutionRecord[] = []

        console.log(`[条件判断] 本步骤执行成功，执行 ${subSteps.length} 个子步骤`)

        for (const subStep of subSteps) {
          const subRecord = await executeStep(stagehand, page, subStep, testId, strategy, screenshotDir)
          subRecords.push(subRecord)
        }

        record.subStepRecords = subRecords
        record.status = 'success'
        break
      }

      case 'conditionLoop': {
        const loopSteps = step.loopSteps || []
        const maxIterations = step.maxIterations || 10
        const conditionStep = step.conditionStep
        const loopRecords: StepExecutionRecord[] = []
        let iteration = 0

        console.log(`[条件循环] 开始执行，最大循环次数：${maxIterations}，循环体步骤数：${loopSteps.length}`)

        while (iteration < maxIterations) {
          iteration++
          console.log(`[条件循环] 第 ${iteration} 次迭代`)

          // 首先判断条件：执行条件步骤
          if (conditionStep) {
            const conditionRecord = await executeStep(stagehand, page, conditionStep, testId, strategy, screenshotDir)
            
            if (conditionRecord.status !== 'success') {
              console.log(`[条件循环] 条件不满足，退出循环`)
              break
            }
            console.log(`[条件循环] 条件满足，执行循环体`)
          }

          // 执行循环体内的步骤
          const iterationRecords: StepExecutionRecord[] = []
          for (const subStep of loopSteps) {
            const subRecord = await executeStep(stagehand, page, subStep, testId, strategy, screenshotDir)
            iterationRecords.push(subRecord)
          }

          loopRecords.push({
            stepId: `${step.id}_iter_${iteration}`,
            stepType: 'condition',
            description: `第 ${iteration} 次循环`,
            strategy,
            status: 'success',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            subStepRecords: iterationRecords,
          })

          console.log(`[条件循环] 第 ${iteration} 次循环完成`)

          // 等待页面稳定
          await waitForDomSettle(page, 2000)
        }

        console.log(`[条件循环] 循环结束，共执行 ${iteration} 次`)

        record.loopRecords = loopRecords
        record.loopCount = iteration
        record.status = 'success'
        break
      }

      default:
        throw new Error(`不支持的步骤类型：${step.type}`)
    }

    record.endTime = new Date().toISOString()
    record.duration = record.endTime && record.startTime
      ? new Date(record.endTime).getTime() - new Date(record.startTime).getTime()
      : 0
  } catch (error) {
    record.status = 'failed'
    record.endTime = new Date().toISOString()
    record.duration = record.endTime && record.startTime
      ? new Date(record.endTime).getTime() - new Date(record.startTime).getTime()
      : 0
    record.error = (error as Error).message
  }

  return record
}
