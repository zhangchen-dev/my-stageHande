import { Page } from 'playwright'
import { ElementSelector } from '@/types'
import { buildSelectorString } from './element-finder'

async function evaluateCondition(
  page: Page,
  condition: any
): Promise<boolean> {
  if (!condition || !condition.type) {
    throw new Error('条件配置不完整')
  }

  try {
    switch (condition.type) {
      case 'elementExists': {
        if (!condition.selector) throw new Error('元素存在条件需要选择器配置')
        return await checkElementExists(page, condition.selector)
      }
      case 'elementVisible': {
        if (!condition.selector) throw new Error('元素可见条件需要选择器配置')
        return await checkElementVisible(page, condition.selector)
      }
      case 'textMatch': {
        if (!condition.selector || !condition.value) throw new Error('文本匹配条件需要选择器和匹配值')
        return await checkTextMatch(page, condition.selector, condition.value)
      }
      case 'attributeMatch': {
        if (!condition.selector || !condition.value) throw new Error('属性匹配条件需要选择器和匹配值')
        return await checkAttributeMatch(page, condition.selector, condition.value)
      }
      default:
        throw new Error(`不支持的条件类型: ${condition.type}`)
    }
  } catch (error) {
    console.error(`[condition] 条件评估失败: ${(error as Error).message}`)
    return false
  }
}

async function checkElementExists(page: Page, selector: ElementSelector): Promise<boolean> {
  const selectorStr = buildSelectorString(selector)
  if (!selectorStr) return false

  try {
    const count = await page.locator(selectorStr).count()
    return count > 0
  } catch {
    return false
  }
}

async function checkElementVisible(page: Page, selector: ElementSelector): Promise<boolean> {
  const selectorStr = buildSelectorString(selector)
  if (!selectorStr) return false

  try {
    return await page.locator(selectorStr).isVisible()
  } catch {
    return false
  }
}

async function checkTextMatch(page: Page, selector: ElementSelector, value: string): Promise<boolean> {
  const selectorStr = buildSelectorString(selector)
  if (!selectorStr) return false

  try {
    const element = page.locator(selectorStr).first()
    const text = await element.textContent()
    return text?.includes(value) || false
  } catch {
    return false
  }
}

async function checkAttributeMatch(page: Page, selector: ElementSelector, value: string): Promise<boolean> {
  const selectorStr = buildSelectorString(selector)
  if (!selectorStr) return false

  try {
    const element = page.locator(selectorStr).first()
    const className = await element.getAttribute('class')
    return className?.includes(value) || false
  } catch {
    return false
  }
}

export { evaluateCondition }
