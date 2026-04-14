import { Page } from 'playwright'
import { TestStep, ExecutionStrategy, StepExecutionRecord, ElementSelector } from '@/types'
import { PATHS } from '@/utils/file'
import path from 'path'
import fs from 'fs'
import { handleMaskLayer } from './executor/mask-handler'
import { evaluateCondition } from './executor/condition-evaluator'
import { buildSelectorString } from './executor/element-finder'

function getActionMethod(stepType: string): string {
  switch (stepType) {
    case 'click': return 'click'
    case 'fill': return 'fill'
    case 'hover': return 'hover'
    default: return 'click'
  }
}

async function waitForDomSettle(page: Page, timeout: number = 10000): Promise<void> {
  try {
    await page.waitForLoadState('load', { timeout })
  } catch {}

  try {
    await page.waitForFunction(() => {
      return new Promise<boolean>((resolve) => {
        if (!document.body) { resolve(true); return }
        let stableCount = 0
        let timer = setTimeout(() => resolve(true), 300)
        const observer = new MutationObserver(() => {
          stableCount = 0
          clearTimeout(timer)
          timer = setTimeout(() => resolve(true), 300)
        })
        observer.observe(document.body, { childList: true, subtree: true, attributes: true })
        const check = setInterval(() => {
          stableCount++
          if (stableCount >= 10) {
            clearInterval(check)
            observer.disconnect()
            resolve(true)
          }
        }, 100)
        setTimeout(() => {
          clearInterval(check)
          observer.disconnect()
          resolve(true)
        }, Math.min(timeout, 5000))
      })
    }, { timeout })
  } catch {}

  try {
    const pendingRequests = await page.evaluate(() => {
      return (window as any).__pendingRequests || 0
    })
    if (pendingRequests > 0) {
      await page.waitForFunction(() => (window as any).__pendingRequests === 0, { timeout: 5000 }).catch(() => {})
    }
  } catch {}
}

async function executeWithSelector(
  stagehand: any,
  page: Page,
  step: TestStep,
  screenshotDir: string,
  testId: string,
  record: StepExecutionRecord
): Promise<void> {
  const selectorStr = buildSelectorString(step.selector!)
  if (!selectorStr) {
    throw new Error(`无效的选择器配置: ${JSON.stringify(step.selector)}`)
  }

  record.selectorUsed = step.selector

  const method = getActionMethod(step.type)
  const args: string[] = step.type === 'fill' && step.value ? [step.value] : []

  const result = await stagehand.act({
    selector: selectorStr,
    description: step.description,
    method,
    arguments: args,
  })

  if (!result.success) {
    throw new Error(result.message || `选择器操作失败: ${selectorStr}`)
  }

  record.status = 'success'

  const screenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
  const screenshotPath = path.join(screenshotDir, screenshotName)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  record.screenshot = `/screenshots/${screenshotName}`
}

async function executeWithAI(
  stagehand: any,
  page: Page,
  step: TestStep,
  screenshotDir: string,
  testId: string,
  record: StepExecutionRecord
): Promise<void> {
  let instruction = step.description
  if (step.type === 'fill' && step.value) {
    instruction = `type "${step.value}" into ${step.description}`
  }

  const result = await stagehand.act(instruction)

  if (!result.success) {
    throw new Error(result.message || 'AI 操作失败')
  }

  record.status = 'success'

  if (result.actions && result.actions.length > 0) {
    const lastAction = result.actions[result.actions.length - 1]
    if (lastAction.selector) {
      record.selectorUsed = { css: lastAction.selector }
    }
  }

  const screenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
  const screenshotPath = path.join(screenshotDir, screenshotName)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  record.screenshot = `/screenshots/${screenshotName}`
}

async function executeInteraction(
  stagehand: any,
  page: Page,
  step: TestStep,
  strategy: ExecutionStrategy,
  screenshotDir: string,
  testId: string,
  record: StepExecutionRecord
): Promise<void> {
  const maskResult = await handleMaskLayer(page, screenshotDir, testId)
  if (maskResult.closed) {
    record.maskClosed = true
    record.maskScreenshot = maskResult.screenshot
  }

  if (strategy === 'selector') {
    if (!step.selector) {
      throw new Error('选择器策略需要提供选择器配置')
    }
    await executeWithSelector(stagehand, page, step, screenshotDir, testId, record)
    return
  }

  if (strategy === 'ai') {
    await executeWithAI(stagehand, page, step, screenshotDir, testId, record)
    return
  }

  if (strategy === 'auto') {
    if (step.selector) {
      const selectorStr = buildSelectorString(step.selector)
      if (selectorStr) {
        record.selectorUsed = step.selector
        try {
          const method = getActionMethod(step.type)
          const args: string[] = step.type === 'fill' && step.value ? [step.value] : []
          const result = await stagehand.act({
            selector: selectorStr,
            description: step.description,
            method,
            arguments: args,
          })
          if (result.success) {
            record.status = 'success'
            const screenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
            const screenshotPath = path.join(screenshotDir, screenshotName)
            await page.screenshot({ path: screenshotPath, fullPage: true })
            record.screenshot = `/screenshots/${screenshotName}`
            return
          }
        } catch {
          console.warn('选择器操作失败，尝试 AI 识别')
        }
      }
    }

    await executeWithAI(stagehand, page, step, screenshotDir, testId, record)
    return
  }

  throw new Error(`不支持的执行策略: ${strategy}`)
}

export function toExecutionRecord(record: StepExecutionRecord): StepExecutionRecord {
  const { ...rest } = record as any
  delete rest._subStepRecords
  delete rest._conditionResult
  delete rest._loopRecords
  delete rest._loopTotalIterations
  return rest as StepExecutionRecord
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

      case 'screenshot': {
        const screenshotName = `${testId}_${step.id}_${Date.now()}.png`
        const screenshotPath = path.join(screenshotDir, screenshotName)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        record.screenshot = `/screenshots/${screenshotName}`
        record.status = 'success'
        break
      }

      case 'wait': {
        const waitTime = parseInt(step.value || '1000')
        await page.waitForTimeout(waitTime)
        record.status = 'success'
        break
      }

      case 'scroll':
        if (step.value) {
          await page.evaluate((scrollValue) => {
            window.scrollBy(0, parseInt(scrollValue))
          }, step.value)
        } else {
          await page.evaluate(() => window.scrollBy(0, 300))
        }
        record.status = 'success'
        break

      case 'js': {
        if (step.selector) {
          const selectorStr = buildSelectorString(step.selector)
          if (!selectorStr) throw new Error('JS 步骤需要有效的选择器')

          const method = step.value ? 'evaluate' : 'click'
          const args: string[] = step.value ? [step.value] : []

          const result = await stagehand.act({
            selector: selectorStr,
            description: step.description,
            method,
            arguments: args,
          })

          if (!result.success) {
            throw new Error(result.message || 'JS 执行失败')
          }

          record.status = 'success'
          const screenshotName = `${testId}_${step.id}_js_success_${Date.now()}.png`
          const screenshotPath = path.join(screenshotDir, screenshotName)
          await page.screenshot({ path: screenshotPath, fullPage: true })
          record.screenshot = `/screenshots/${screenshotName}`
        } else {
          throw new Error('JS 步骤必须提供选择器')
        }
        break
      }

      case 'condition': {
        const conditionStep = step as any
        console.log(`[condition] 开始执行条件判断: ${step.description}`)

        const conditionResult = await evaluateCondition(page, conditionStep.condition)
        console.log(`[condition] 条件评估结果: ${conditionResult}`)

        let subStepRecords: StepExecutionRecord[] = []

        if (conditionResult) {
          console.log(`[condition] 条件满足，执行 ${conditionStep.thenSteps?.length || 0} 个步骤`)
          if (conditionStep.thenSteps && conditionStep.thenSteps.length > 0) {
            for (const subStep of conditionStep.thenSteps) {
              const subRecord = await executeStep(stagehand, page, subStep, testId, strategy, screenshotDir)
              subStepRecords.push(subRecord)
              if (subRecord.status === 'failed') break
            }
          }
        } else {
          console.log(`[condition] 条件不满足，执行 ${conditionStep.elseSteps?.length || 0} 个步骤`)
          if (conditionStep.elseSteps && conditionStep.elseSteps.length > 0) {
            for (const subStep of conditionStep.elseSteps) {
              const subRecord = await executeStep(stagehand, page, subStep, testId, strategy, screenshotDir)
              subStepRecords.push(subRecord)
              if (subRecord.status === 'failed') break
            }
          }
        }

        record.status = subStepRecords.some(r => r.status === 'failed') ? 'failed' : 'success'

        const lastWithScreenshot = [...subStepRecords].reverse().find(r => r.screenshot)
        if (lastWithScreenshot) {
          record.screenshot = lastWithScreenshot.screenshot
        }

        ;(record as unknown as Record<string, unknown>)._subStepRecords = subStepRecords
        ;(record as unknown as Record<string, unknown>)._conditionResult = conditionResult
        break
      }
    }

    record.endTime = new Date().toISOString()
    record.duration = new Date(record.endTime).getTime() - new Date(record.startTime || record.endTime).getTime()

  } catch (error) {
    record.status = 'failed'
    record.error = (error as Error).message
    record.endTime = new Date().toISOString()

    try {
      const failScreenshotName = `${testId}_${step.id}_fail_${Date.now()}.png`
      const failPath = path.join(screenshotDir, failScreenshotName)
      await page.screenshot({ path: failPath, fullPage: true })
      record.screenshot = `/screenshots/${failScreenshotName}`
    } catch {}
  }

  return record
}
