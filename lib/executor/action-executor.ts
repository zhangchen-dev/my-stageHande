import { Page } from 'playwright'
import { TestStep, ExecutionStrategy, StepExecutionRecord, ElementSelector } from '@/types'
import { PATHS } from '@/utils/file'
import path from 'path'
import fs from 'fs'
import { handleMaskLayer } from './mask-handler'
import { buildSelectorString } from './element-finder'

function getActionMethod(stepType: string): string {
  switch (stepType) {
    case 'click': return 'click'
    case 'fill': return 'fill'
    case 'hover': return 'hover'
    default: return 'click'
  }
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
    throw new Error(`无效的选择器配置：${JSON.stringify(step.selector)}`)
  }

  record.selectorUsed = step.selector

  const method = getActionMethod(step.type)
  const args: string[] = step.type === 'fill' && step.value ? [step.value] : []

  const result = await stagehand.act({
    selector: selectorStr,
    description: step.description,
    method,
    arguments: args,
  }, { page })

  if (!result.success) {
    throw new Error(result.message || `选择器操作失败：${selectorStr}`)
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

  const result = await stagehand.act(instruction, { page })

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

export async function executeInteraction(
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

  if ((step as any).loop) {
    await executeLoopGuide(stagehand, page, step, screenshotDir, testId, record)
    return
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
      console.log(`选择器字符串：${selectorStr}`)
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
          }, { page })
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

  throw new Error(`不支持的执行策略：${strategy}`)
}

async function executeLoopGuide(
  stagehand: any,
  page: Page,
  step: TestStep,
  screenshotDir: string,
  testId: string,
  record: StepExecutionRecord
): Promise<void> {
  const maxIterations = (step as any).maxLoopIterations || 50
  const tryActivateGuide = (step as any).tryActivateGuide || false

  const loopRecords: StepExecutionRecord[] = []
  let iteration = 0
  let consecutiveNoChange = 0
  const maxConsecutiveNoChange = 3

  while (iteration < maxIterations && consecutiveNoChange < maxConsecutiveNoChange) {
    iteration++
    const iterRecord: StepExecutionRecord = {
      stepId: step.id,
      stepType: step.type,
      description: `第 ${iteration} 次循环：${step.description}`,
      strategy: 'auto',
      status: 'running',
      startTime: new Date().toISOString(),
    }

    try {
      await waitForDomSettle(page, 5000)

      const domSnapshotBefore = await page.evaluate(() => document.body.innerHTML.length)

      const guideResult = await page.evaluate(() => {
        const result: {
          exists: boolean
          text: string
          targetSelector: string
        } = { exists: false, text: '', targetSelector: '' }

        const highlightSelectors = [
          '[class*="highlight"]',
          '[class*="Highlight"]',
          '[class*="spotlight"]',
          '[class*="Spotlight"]',
          '[class*="active-guide"]',
          '[class*="guide-target"]',
          '[class*="guided"]',
          '[class*="current-step"]',
          '[class*="currentStep"]',
          '.shepherd-target',
          '.introjs-highlight',
          '.driver-highlighted',
          '[data-guide-step]',
          '[data-shepherd-step]',
          '[data-intro]',
        ]
        for (const selector of highlightSelectors) {
          const elements = document.querySelectorAll(selector)
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const el = elements[i] as HTMLElement
              if (el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) {
                result.exists = true
                result.text = el.innerText?.substring(0, 100) || ''
                result.targetSelector = selector
                return result
              }
            }
          }
        }

        const guideSelectors = [
          '[class*="guide"]',
          '[class*="Guide"]',
          '[class*="tooltip"]',
          '[class*="Tooltip"]',
          '[class*="bubble"]',
          '[class*="Bubble"]',
          '[role="tooltip"]',
          '[class*="popover"]',
          '[class*="Popover"]',
        ]
        for (const selector of guideSelectors) {
          const elements = document.querySelectorAll(selector)
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const el = elements[i] as HTMLElement
              if (el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) {
                result.exists = true
                result.text = el.innerText?.substring(0, 100) || ''
                result.targetSelector = selector

                const ariaDescribedby = el.getAttribute('aria-describedby')
                if (ariaDescribedby) {
                  const target = document.querySelector(`[aria-describedby="${ariaDescribedby}"]`)
                  if (target && target !== el) {
                    result.targetSelector = `[aria-describedby="${ariaDescribedby}"]`
                  }
                }

                const dataTarget = el.getAttribute('data-target') || el.getAttribute('data-element')
                if (dataTarget) {
                  const target = document.querySelector(dataTarget)
                  if (target) {
                    result.targetSelector = dataTarget
                  }
                }

                return result
              }
            }
          }
        }

        const overlaySelectors = [
          '[class*="overlay"]',
          '[class*="Overlay"]',
          '[class*="modal"]',
          '[class*="Modal"]',
          '[class*="dialog"]',
          '[class*="Dialog"]',
          '[role="dialog"]',
        ]
        for (const selector of overlaySelectors) {
          const elements = document.querySelectorAll(selector)
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const el = elements[i] as HTMLElement
              if (el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) {
                const target = el.querySelector('button, a, [role="button"], input, select, textarea')
                if (target) {
                  result.exists = true
                  result.text = el.innerText?.substring(0, 100) || ''
                  result.targetSelector = selector
                  return result
                }
              }
            }
          }
        }

        return result
      })

      iterRecord.guideBubbleInfo = guideResult

      if (!guideResult.exists) {
        if (tryActivateGuide && iteration === 1) {
          console.log(`[循环模式] 第 ${iteration} 次：未检测到引导元素，尝试唤起引导`)
          await page.evaluate(() => {
            const startButtons = document.querySelectorAll('[class*="start"], [class*="Start"], button, a')
            for (let i = 0; i < startButtons.length; i++) {
              const btn = startButtons[i] as HTMLElement
              const text = btn.innerText || btn.textContent || ''
              if (text.includes('开始') || text.includes('Start') || text.includes('演示') || text.includes('Demo')) {
                btn.click()
                return true
              }
            }
            return false
          })
          await waitForDomSettle(page, 3000)
          continue
        }

        console.log(`[循环模式] 第 ${iteration} 次：未检测到引导元素，结束循环`)
        iterRecord.status = 'success'
        iterRecord.endTime = new Date().toISOString()
        loopRecords.push(iterRecord)
        break
      }

      console.log(`[循环模式] 第 ${iteration} 次：检测到引导元素 - ${guideResult.targetSelector}`)

      let clickSelector = guideResult.targetSelector
      
      // 尝试查找气泡附近的目标元素
      const nearbyTarget = await page.evaluate((bubbleSelector) => {
        const bubble = document.querySelector(bubbleSelector)
        if (!bubble) return null

        const bubbleRect = (bubble as HTMLElement).getBoundingClientRect()
        const bubbleCenterX = bubbleRect.left + bubbleRect.width / 2
        const bubbleCenterY = bubbleRect.top + bubbleRect.height / 2

        const clickableElements = document.querySelectorAll('button, a, [role="button"], input, select, textarea, [class*="btn"], [class*="button"]')
        let closestElement: Element | null = null
        let closestDistance = Infinity

        for (let i = 0; i < clickableElements.length; i++) {
          const el = clickableElements[i] as HTMLElement
          if (el.offsetParent === null || el.offsetWidth === 0 || el.offsetHeight === 0) continue
          if (bubble.contains(el) || el.contains(bubble)) continue

          const rect = el.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const distance = Math.sqrt(Math.pow(centerX - bubbleCenterX, 2) + Math.pow(centerY - bubbleCenterY, 2))

          if (distance < closestDistance && distance < 300) {
            closestDistance = distance
            closestElement = el
          }
        }

        if (closestElement) {
          let selector = closestElement.tagName.toLowerCase()
          if ((closestElement as HTMLElement).id) {
            selector += `#${(closestElement as HTMLElement).id}`
          } else if ((closestElement as HTMLElement).className) {
            const classes = (closestElement as HTMLElement).className.split(' ').filter(c => c).slice(0, 2)
            if (classes.length > 0) {
              selector += `.${classes.join('.')}`
            }
          }
          return selector
        }

        return null
      }, guideResult.targetSelector)

      if (nearbyTarget) {
        clickSelector = nearbyTarget
        console.log(`[循环模式] 第 ${iteration} 次：找到气泡附近的目标元素 ${clickSelector}`)
      }

      const actResult = await stagehand.act({
        selector: clickSelector,
        description: `点击引导元素: ${guideResult.text || step.description}`,
        method: 'click',
        arguments: [],
      }, { page })

      if (!actResult.success) {
        throw new Error(actResult.message || '点击引导元素失败')
      }

      await waitForDomSettle(page, 3000)

      const domSnapshotAfter = await page.evaluate(() => document.body.innerHTML.length)
      const domChanged = domSnapshotBefore !== domSnapshotAfter

      if (!domChanged) {
        consecutiveNoChange++
        console.log(`[循环模式] 第 ${iteration} 次：页面未变化，连续 ${consecutiveNoChange} 次`)
        if (consecutiveNoChange >= maxConsecutiveNoChange) {
          iterRecord.status = 'failed'
          iterRecord.error = `连续 ${maxConsecutiveNoChange} 次点击后页面无变化，可能点击无效`
          iterRecord.endTime = new Date().toISOString()
          loopRecords.push(iterRecord)
          throw new Error(iterRecord.error)
        }
      } else {
        consecutiveNoChange = 0
        console.log(`[循环模式] 第 ${iteration} 次：页面已变化，重置计数器`)
      }

      const screenshotName = `${testId}_${step.id}_iter${iteration}_${Date.now()}.png`
      const screenshotPath = path.join(screenshotDir, screenshotName)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      iterRecord.screenshot = `/screenshots/${screenshotName}`

      iterRecord.status = 'success'
      iterRecord.endTime = new Date().toISOString()
      loopRecords.push(iterRecord)

    } catch (error) {
      iterRecord.status = 'failed'
      iterRecord.endTime = new Date().toISOString()
      iterRecord.error = (error as Error).message
      loopRecords.push(iterRecord)
      throw error
    }
  }

  record.loopRecords = loopRecords
  record.loopCount = iteration
  record.status = 'success'

  if (consecutiveNoChange >= maxConsecutiveNoChange) {
    throw new Error(`连续 ${maxConsecutiveNoChange} 次点击后页面无变化，可能点击无效`)
  }
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
