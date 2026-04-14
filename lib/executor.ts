/**
 * 执行引擎 - 多方案元素定位与执行
 * 支持精确选择器、AI 识别、截图匹配三种策略
 * 支持 mask 遮盖层处理和 iframe 上下文切换
 */

import { Page, Frame } from 'playwright'
import { TestStep, ElementSelector, ExecutionStrategy, StepExecutionRecord, ExecutionRecord, GuideBubbleInfo } from '@/types'
import { PATHS } from '@/utils/file'
import path from 'path'
import fs from 'fs'

// 扩展 Window 接口以支持自定义属性
declare global {
  interface Window {
    _clickedSet?: Set<string>
  }
}

/**
 * 常见 mask/overlay 元素选择器
 */
const MASK_SELECTORS = [
  // 通用遮罩层
  '[class*="mask"]',
  '[class*="overlay"]',
  '[class*="modal-backdrop"]',
  '[class*="Modal"]',
  '[role="dialog"]',
  // 特定遮罩
  '.ant-modal-mask',
  '.el-dialog__wrapper',
  '[class*="drawer-mask"]',
  // Demo 特定
  '[class*="Demo"] [class*="mask"]',
  '[class*="demoMask"]',
  '[class*="guideMask"]',
]

/**
 * 常见关闭按钮选择器
 */
const CLOSE_BUTTON_SELECTORS = [
  '[aria-label="Close"]',
  '[aria-label="关闭"]',
  '[class*="close"]',
  '[class*="Close"]',
  'button:has-text("关闭")',
  'button:has-text("Close")',
  '[class*="CloseButton"]',
]

/**
 * 从选择器构建 CSS 或 XPath 表达式
 */
function buildSelectorExpression(selector: ElementSelector): string | null {
  // 优先级：id > testId > xpath > classPrefix > css > 其他
  
  if (selector.id) {
    return `#${CSS.escape(selector.id)}`
  }
  
  if (selector.testId) {
    return `[data-testid="${selector.testId}"]`
  }
  
  if (selector.xpath) {
    return selector.xpath
  }
  
  if (selector.classPrefix) {
    // 类名前缀匹配：[class^="prefix"] 匹配以 prefix 开头的 class
    return `[class^="${selector.classPrefix}"]`
  }
  
  if (selector.css) {
    return selector.css
  }
  
  if (selector.name) {
    return `[name="${selector.name}"]`
  }
  
  if (selector.className) {
    return `.${selector.className.split(' ').filter(c => c).map(c => CSS.escape(c)).join('.')}`
  }
  
  if (selector.text) {
    return `text=${selector.text}`
  }
  
  if (selector.containsText) {
    return `text=${selector.containsText}`
  }
  
  return null
}

/**
 * 使用精确选择器查找元素
 */
async function findBySelector(page: Page, selector: ElementSelector, frame?: Frame): Promise<Locator | null> {
  const expr = buildSelectorExpression(selector)
  if (!expr) return null
  
  const target = frame || page
  
  try {
    if (expr.startsWith('//') || expr.startsWith('(')) {
      // XPath
      const count = await target.locator(`xpath=${expr}`).count()
      if (count > 0) {
        return target.locator(`xpath=${expr}`)
      }
    } else if (expr.startsWith('text=')) {
      // Text selector
      const text = expr.substring(5)
      const count = await target.getByText(text, { exact: false }).count()
      if (count > 0) {
        return target.getByText(text, { exact: false })
      }
    } else {
      // CSS
      const count = await target.locator(expr).count()
      if (count > 0) {
        return target.locator(expr)
      }
    }
  } catch {
    return null
  }
  
  return null
}

type Locator = ReturnType<Page['locator']>

/**
 * 检测并处理 mask 遮罩层
 */
async function handleMaskLayer(page: Page, screenshotDir: string, testId: string): Promise<{ closed: boolean; screenshot?: string }> {
  for (const maskSelector of MASK_SELECTORS) {
    try {
      const maskCount = await page.locator(maskSelector).count()
      if (maskCount > 0) {
        // 尝试查找并点击关闭按钮
        for (const closeSelector of CLOSE_BUTTON_SELECTORS) {
          const closeCount = await page.locator(closeSelector).count()
          if (closeCount > 0) {
            try {
              await page.locator(closeSelector).first().click({ timeout: 2000, force: true })
              const screenshotName = `${testId}_mask_closed_${Date.now()}.png`
              const screenshotPath = path.join(screenshotDir, screenshotName)
              await page.screenshot({ path: screenshotPath })
              return { closed: true, screenshot: `/screenshots/${screenshotName}` }
            } catch {}
          }
        }
        
        // 尝试按 ESC 键关闭
        try {
          await page.keyboard.press('Escape')
          await page.waitForTimeout(500)
          
          // 检查是否还有 mask
          const stillHasMask = await page.locator(maskSelector).count()
          if (stillHasMask === 0) {
            const screenshotName = `${testId}_mask_esc_${Date.now()}.png`
            const screenshotPath = path.join(screenshotDir, screenshotName)
            await page.screenshot({ path: screenshotPath })
            return { closed: true, screenshot: `/screenshots/${screenshotName}` }
          }
        } catch {}
      }
    } catch {}
  }
  
  return { closed: false }
}

/**
 * 查找并点击指定文本的元素（支持模糊匹配）
 */
async function clickByText(page: Page, text: string, frame?: Frame): Promise<boolean> {
  const target = frame || page
  
  // 方法1: 精确文本匹配
  try {
    const exactMatch = target.getByText(text, { exact: true })
    if (await exactMatch.count() > 0) {
      await exactMatch.first().click({ timeout: 3000 })
      return true
    }
  } catch {}
  
  // 方法2: 模糊文本匹配
  try {
    const fuzzyMatch = target.getByText(text, { exact: false })
    if (await fuzzyMatch.count() > 0) {
      await fuzzyMatch.first().click({ timeout: 3000 })
      return true
    }
  } catch {}
  
  // 方法3: 包含文本匹配
  try {
    const containsMatch = target.locator(`*:has-text("${text}")`)
    if (await containsMatch.count() > 0) {
      await containsMatch.first().click({ timeout: 3000 })
      return true
    }
  } catch {}
  
  return false
}

/**
 * 获取所有 iframe 列表
 */
async function getIframes(page: Page): Promise<Array<{ name: string; frame: Frame }>> {
  const iframes: Array<{ name: string; frame: Frame }> = []
  
  try {
    const frames = page.frames()
    for (const frame of frames) {
      const name = frame.name() || frame.url() || 'unnamed'
      if (!name.includes('about:') && !name.includes('data:')) {
        iframes.push({ name, frame })
      }
    }
  } catch {}
  
  return iframes
}

/**
 * 获取目标 iframe（用于演示页面等嵌套场景）
 * 优先查找 #demo_detail_iframe 或其他主要 iframe
 */
async function getTargetIframe(page: Page): Promise<Frame | null> {
  try {
    // 方法1：通过 ID 查找常见的 iframe
    const iframeSelectors = ['#demo_detail_iframe', '#iframe', 'iframe', '[id*="iframe"]', '[id*="frame"]']
    
    for (const sel of iframeSelectors) {
      try {
        // 使用 page.locator 或 page.$
        const iframeEl = await page.$(sel)
        if (iframeEl) {
          const contentFrame = await iframeEl.contentFrame()
          if (contentFrame) {
            console.log(`[getTargetIframe] 找到 iframe: ${sel}`)
            return contentFrame
          }
        }
      } catch (e) {
        continue
      }
    }
    
    // 方法2：遍历所有 frames，找到非主框架的可见 iframe
    const frames = page.frames()
    for (const f of frames) {
      if (f === page.mainFrame()) continue
      
      const url = f.url() || ''
      if (url.includes('about:') || url.includes('data:') || url === 'about:blank' || !url) continue
      
      // 检查这个 frame 是否有内容（有 DOM 元素）
      try {
        const hasContent = await f.evaluate(() => document.querySelectorAll('*').length > 5)
        if (hasContent) {
          console.log(`[getTargetIframe] 找到内容丰富的 iframe: ${url.substring(0, 60)}...`)
          return f
        }
      } catch (e) {
        continue
      }
    }
  } catch (e) {
    console.warn('[getTargetIframe] 获取 iframe 失败:', e)
  }

  return null
}

/**
 * 在所有上下文中查找元素
 */
async function findElementGlobally(
  page: Page,
  selector: ElementSelector
): Promise<{ found: boolean; frame?: Frame; locator?: Locator }> {
  // 先在主页面查找
  const locator = await findBySelector(page, selector)
  if (locator && await locator.count() > 0) {
    return { found: true, locator }
  }
  
  // 在所有 iframe 中查找
  const iframes = await getIframes(page)
  for (const { frame } of iframes) {
    const frameLocator = await findBySelector(page, selector, frame)
    if (frameLocator && await frameLocator.count() > 0) {
      return { found: true, frame, locator: frameLocator }
    }
  }
  
  return { found: false }
}

/**
 * 使用 AI 描述查找并操作元素
 */
async function findByAI(
  stagehand: any,
  page: Page,
  action: string,
  description: string
): Promise<{ success: boolean; confidence?: number; error?: string }> {
  try {
    await stagehand.act(`${action}: ${description}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * 常见引导/指引气泡选择器
 * 覆盖多种 UI 组件库的引导组件
 */
const GUIDE_BUBBLE_SELECTORS = [
  // 通用引导气泡
  '[class*="guide"]',
  '[class*="Guide"]', 
  '[class*="popover"]',
  '[class*="Popover"]',
  '[class*="tooltip"]',
  '[class*="Tooltip"]',
  '[class*="tour"]',
  '[class*="Tour"]',
  '[class*="intro"]',
  '[class*="Intro"]',
  '[class*="step"]',
  '[class*="Step"]',
  // Ant Design 引导
  '[class*="ant-tour"]',
  '[class*="ant-popover"]',
  // Element Plus 引导
  '[class*="el-tour"]',
  '[class*="el-popover"]',
  // Demo 特定引导
  '[class*="Demo"] [class*="guide"]',
  '[class*="Demo"] [class*="Guide"]',
  '[class*="demo-guide"]',
  '[class*="demoGuide"]',
  // 指引箭头
  '[class*="arrow"]',
  '[class*="pointer"]',
]

/**
 * 检测页面上是否存在引导指引气泡
 * 支持主页面和 iframe 内部检测
 * 返回详细的气泡信息
 */
export async function detectGuideBubble(page: Page, frame?: Frame): Promise<GuideBubbleInfo> {
  // 如果指定了 frame，在 frame 中检测
  if (frame) {
    const result = await detectGuideBubbleInContext(frame)
    if (result.exists) return result
  }

  // 在主页面检测
  const mainResult = await detectGuideBubbleInContext(page)
  if (mainResult.exists) return mainResult

  // 在所有 iframe 中检测
  try {
    const frames = page.frames()
    for (const f of frames) {
      // 跳过主页面和内部页面
      if (f === page.mainFrame()) continue
      const url = f.url() || ''
      if (url.includes('about:') || url.includes('data:') || !url) continue
      
      try {
        const frameResult = await detectGuideBubbleInContext(f)
        if (frameResult.exists) {
          console.log(`[detectGuideBubble] 在 iframe 中检测到气泡: ${url.substring(0, 60)}`)
          return frameResult
        }
      } catch (e) {
        // 继续尝试其他 frame
        continue
      }
    }
  } catch (e) {
    // iframe 检测失败时静默处理
  }

  return { exists: false }
}

/**
 * 在指定的上下文（Page 或 Frame）中检测引导气泡
 */
async function detectGuideBubbleInContext(context: Page | Frame): Promise<GuideBubbleInfo> {
  const result = await context.evaluate((selectors) => {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector)
        for (const el of elements) {
          const htmlEl = el as HTMLElement
          const rect = htmlEl.getBoundingClientRect()
          
          // 检查元素是否可见
          if (rect.width > 0 && rect.height > 0 &&
              window.getComputedStyle(htmlEl).visibility !== 'hidden' &&
              window.getComputedStyle(htmlEl).display !== 'none' &&
              window.getComputedStyle(htmlEl).opacity !== '0') {
            
            // 排除地图区域和错误页面的元素
            if (htmlEl.closest('[class*="DemoMap"], [class*="map"]')) continue
            
            // 获取文本内容
            const text = htmlEl.textContent?.trim() || ''
            
            // 尝试查找气泡指向的目标（通常通过 data-target、aria-describedby 等属性）
            let targetSelector = ''
            const targetId = htmlEl.getAttribute('data-target') || 
                           htmlEl.getAttribute('aria-describedby') ||
                           htmlEl.getAttribute('data-for')
            if (targetId) {
              targetSelector = `#${targetId}`
            }
            
            return {
              exists: true,
              text: text.substring(0, 200),
              targetSelector: targetSelector || undefined,
              targetPosition: { x: rect.x, y: rect.y },
            }
          }
        }
      } catch (e) {
        continue
      }
    }
    
    return { exists: false }
  }, GUIDE_BUBBLE_SELECTORS)
  
  return result as GuideBubbleInfo
}

/**
 * 查找引导气泡指向的目标元素并点击
 * 通过分析 DOM 结构找到气泡关联的目标
 * 支持主页面和 iframe 上下文
 */
export async function clickGuideTarget(page: Page, targetFrame?: Frame): Promise<{
  success: boolean
  targetInfo?: string
  error?: string
}> {
  // 如果指定了目标 frame，优先在 frame 中执行
  if (targetFrame) {
    const result = await clickGuideTargetInContext(targetFrame)
    if (result.success) return result
    
    console.log('[clickGuideTarget] 在目标frame中未点击成功，尝试主页面')
  }
  
  // 在所有上下文中尝试点击
  // 方法1：在主页面中尝试
  const mainResult = await clickGuideTargetInContext(page)
  if (mainResult.success) return mainResult
  
  // 方法2：在 iframe 中尝试（使用高亮检测）
  try {
    const frames = page.frames()
    for (const f of frames) {
      if (f === page.mainFrame()) continue
      const url = f.url() || ''
      if (url.includes('about:') || url.includes('data:') || !url) continue
      
      try {
        // 使用增强的高亮检测方法
        const highlightResult = await clickHighlightTargetInFrame(f)
        if (highlightResult.success) return highlightResult
      } catch (e) {
        continue
      }
    }
  } catch (e) {
    // 静默处理
  }

  // 方法3：在 iframe 中使用原始方法
  try {
    const frames = page.frames()
    for (const f of frames) {
      if (f === page.mainFrame()) continue
      const url = f.url() || ''
      if (url.includes('about:') || url.includes('data:') || !url) continue
      
      try {
        const frameResult = await clickGuideTargetInContext(f)
        if (frameResult.success) return frameResult
      } catch (e) {
        continue
      }
    }
  } catch (e) {
    // 静默处理
  }

  return { success: false, error: 'No guide target found' }
}

/**
 * 指定上下文中查找引导气泡指向的目标元素并点击
 */
async function clickGuideTargetInContext(context: Page | Frame): Promise<{
  success: boolean
  targetInfo?: string
  error?: string
}> {
  const result = await context.evaluate(() => {
    // 方法1：查找带有 guide 相关 class 的可见元素，找到其指向的目标
    const guideSelectors = [
      '[class*="guide"]', '[class*="Guide"]',
      '[class*="tour"]', '[class*="Tour"]',
      '[class*="popover"][style*="visible"]',
      '[class*="Popover"][style*="block"]',
      '.ant-tour', '.ant-popover-inner',
      '[role="dialog"][class*="guide"]',
    ]
    
    for (const selector of guideSelectors) {
      try {
        const guides = document.querySelectorAll(selector)
        for (const guide of guides) {
          const guideEl = guide as HTMLElement
          
          // 检查是否可见
          const rect = guideEl.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          if (guideEl.closest('[class*="DemoMap"], [class*="map"]')) continue
          
          // 方法1：通过 data 属性找目标
          const targetAttr = ['data-target', 'data-for', 'data-anchor-id', 'data-step-target']
          for (const attr of targetAttr) {
            const targetId = guideEl.getAttribute(attr)
            if (targetId) {
              const target = document.getElementById(targetId) || document.querySelector(`[data-id="${targetId}"]`)
              if (target) {
                ;(target as HTMLElement).click()
                return { 
                  success: true, 
                  targetInfo: `Clicked target by ${attr}="${targetId}: ${(target as HTMLElement).tagName}.${target.className}` 
                }
              }
            }
          }
          
          // 方法2：通过 aria 属性找目标
          const describedBy = guideEl.getAttribute('aria-describedby') || 
                            guideEl.getAttribute('aria-labelledby')
          if (describedBy) {
            const target = document.getElementById(describedBy)
            if (target) {
              ;(target as HTMLElement).click()
              return { 
                success: true, 
                targetInfo: `Clicked target by aria: ${describedBy}` 
              }
            }
          }
          
          // 方法3：查找相邻的高亮元素（通常引导会用高亮标记目标）
          const parent = guideEl.parentElement
          if (parent) {
            const highlightSelectors = [
              '[class*="highlight"]', '[class*="Highlight"]',
              '[class*="target"]', '[class*="Target"]',
              '[class*="mask-target"]', '[class*="spotlight"]',
            ]
            for (const hs of highlightSelectors) {
              const highlight = parent.querySelector(hs) || document.querySelector(hs)
              if (highlight && !(highlight as HTMLElement).closest('[class*="DemoMap"], [class*="map"]')) {
                ;(highlight as HTMLElement).click()
                return { 
                  success: true, 
                  targetInfo: `Clicked highlighted element: ${hs}` 
                }
              }
            }
          }
          
          // 方法4：通过位置推断 - 找到气泡下方或旁边的可点击元素
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          
          const clickableElements = document.elementsFromPoint(centerX, centerY + rect.height / 2 + 50)
          for (const el of clickableElements) {
            if (el instanceof HTMLElement && 
                (el.tagName === 'BUTTON' || el.tagName === 'A' || 
                 el.onclick || el.getAttribute('onclick') ||
                 el.classList.contains('ant-btn') ||
                 el.getAttribute('role') === 'button') &&
                !el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error"]')) {
              el.click()
              return { 
                success: true, 
                targetInfo: `Clicked element below bubble: ${el.tagName}.${el.className}` 
              }
            }
          }
        }
      } catch (e) {
        continue
      }
    }
    
    // 方法5：查找所有可见的引导相关元素的兄弟或内部目标
    const allGuides = document.querySelectorAll('[class*="guide"], [class*="tour"], [class*="step-active"], [class*="current-step"]')
    for (const guide of allGuides) {
      const style = window.getComputedStyle(guide)
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        if ((guide as HTMLElement).closest('[class*="DemoMap"], [class*="map"]')) continue
        
        // 找到引导容器的上一个兄弟元素
        const prevSibling = guide.previousElementSibling
        if (prevSibling && prevSibling instanceof HTMLElement &&
            !(prevSibling as HTMLElement).closest('[class*="DemoMap"], [class*="map"]')) {
          prevSibling.click()
          return { 
            success: true, 
            targetInfo: `Clicked previous sibling of guide` 
          }
        }
        
        // 或者查找内部引用的目标
        const innerTarget = guide.querySelector('[class*="target"], [class*="highlight"], [data-current="true"]')
        if (innerTarget) {
          ;(innerTarget as HTMLElement).click()
          return { 
            success: true, 
            targetInfo: `Clicked inner target element` 
          }
        }
      }
    }
    
    return { success: false, error: 'No guide target found in this context' }
  })
  
  return result as { success: boolean; targetInfo?: string; error?: string }
}

/**
 * 增强的高亮目标检测和点击（基于测试脚本验证的逻辑）
 * 通过 CSS 特征评分找到引导高亮的目标按钮
 * 主要用于 iframe 内的演示页面引导流程
 */
async function clickHighlightTargetInFrame(frame: Frame): Promise<{
  success: boolean
  targetInfo?: string
  error?: string
}> {
  const result = await frame.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight
    const allBtns = document.querySelectorAll(`
      button:not([disabled]),
      [role="button"]:not([disabled]),
      .ant-btn:not([disabled]),
      .el-button:not([disabled]),
      a[class*="btn"],
      div[onclick],
      span[style*="cursor"]
    `)

    const candidates: Array<{ el: HTMLElement; score: number; text: string; tag: string; reasons: string[] }> = []
    
    for (const el of allBtns) {
      if (!(el instanceof HTMLElement)) continue
      
      // 排除区域（排除地图区域、底部工具栏、错误页面等）
      if (el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error-page"], [class*="error"]')) continue
      
      const s = window.getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      
      // 尺寸过滤
      if (r.width < 30 || r.height < 25 || r.width > 500) continue
      // 位置过滤：不在最底部工具栏区域
      if (r.y > H - 200 || r.y < -50 || r.x > W - 20) continue
      
      let score = 0
      const reasons: string[] = []
      
      // 排除错误页面按钮
      const text = (el.textContent || '').trim()
      if (/重新加载|Reload|Details?|详情/i.test(text)) continue
      
      // A. box-shadow 发光（引导最常用的方式，权重最高）
      const bs = s.boxShadow || ''
      if (bs !== 'none' && bs.length > 20) {
        if (/rgba?\((?!0,\s*0,\s*0)[^)]+\)/i.test(bs)) {
          score += 15
          reasons.push('glow')
        } else {
          score += 5
          reasons.push('shadow')
        }
      }
      
      // B. 特殊边框颜色（排除白/黑/灰色系）
      const bc = s.borderTopColor || s.borderColor || ''
      if (bc.includes('rgb(') && !bc.includes('0, 0, 0') &&
          !bc.includes('217, 217') && !bc.includes('255, 255') &&
          !bc.includes('95, 99') && !/1\d{2},\s*1\d{2}/.test(bc) &&
          !/15\d,\s*16\d/.test(bc)) {
        score += 12
        reasons.push('color-border')
      }
      
      // C. outline（排除浏览器默认值）
      const ol = s.outline || ''
      if (ol !== 'none' && ol.length > 8 && 
          !ol.includes('255, 255, 255') && !ol.includes('95, 99, 104') &&
          !/1\d{2},\s*1\d{2}/.test(ol)) {
        score += 8
        reasons.push('outline')
      }
      
      // D. z-index 异常高（引导会提升层级）
      const zi = parseInt(s.zIndex || '0')
      if (zi >= 999) { score += 6; reasons.push(`z:${zi}`) }
      
      // E. 操作文字匹配（常见引导目标文字）
      if (/新增|申请|授权|取票|同步|下一步|确认|提交|开始/i.test(text)) {
        score += 4
        reasons.push('action-text')
      }
      
      // F. primary 按钮
      if (el.classList.contains('ant-btn-primary')) { 
        score += 5
        reasons.push('primary') 
      }
      
      // G. 彩色背景
      const bg = s.backgroundColor || ''
      if (bg.includes('rgb(') && !bg.includes('0, 0, 0') && 
          !bg.includes('255, 255, 255') && bg.length > 12) {
        score += 2
        reasons.push('colored-bg')
      }
      
      if (score >= 8) {
        candidates.push({ el, score, text: text.substring(0, 40), tag: el.tagName, reasons })
      }
    }
    
    // 按分数排序
    candidates.sort((a, b) => b.score - a.score)
    
    if (candidates.length > 0) {
      const best = candidates[0]
      best.el.click()
      return { 
        success: true, 
        info: `<${best.tag}> "${best.text}" [${best.score}pt] ${best.reasons.join(',')}` 
      }
    }
    
    // 兜底方案：返回第一个可见的可点击元素（排除已点击的）
    for (const el of allBtns) {
      if (!(el instanceof HTMLElement)) continue
      if (el.closest('[class*="DemoMap"], [class*="error"]')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 30 && r.height > 20 && r.y < window.innerHeight - 200) {
        const key = `${el.tagName}:${(el.textContent || '').trim().substring(0, 20)}`
        if (!window._clickedSet?.has(key)) {
          el.click()
          if (!window._clickedSet) window._clickedSet = new Set()
          window._clickedSet.add(key)
          return { success: true, info: `fallback: "${(el.textContent || '').trim().substring(0, 25)}"` }
        }
      }
    }
    
    return { success: false, error: 'No highlighted target found' }
  })

  if (result.success) {
    console.log(`[clickHighlightTargetInFrame] ✅ ${result.info}`)
    return { success: true, targetInfo: result.info }
  }
  
  return { success: false, error: result.error || 'Failed to find highlighted target' }
}

/**
 * 尝试唤起引导（当没有气泡时调用）
 */
export async function activateGuide(page: Page): Promise<boolean> {
  try {
    // 常见的唤起引导的方法
    const activateSelectors = [
      '[class*="start"]',           // 开始按钮
      '[class*="Start"]',
      '[class*="guide-start"]',
      '[class*="help"]',             // 帮助按钮
      '[class*="Help"]',
      '[class*="tutorial"]',         // 教程按钮
      'button:has-text("开始")',     // 文本匹配
      'button:has-text("演示")',
      'button:has-text("引导")',
      'button:has-text("教程")',
      ':text("开始")',
      ':text("演示")',
      ':text("引导")',
    ]
    
    for (const selector of activateSelectors) {
      try {
        const count = await page.locator(selector).count()
        if (count > 0) {
          await page.locator(selector).first().click({ timeout: 2000 })
          await page.waitForTimeout(1500)
          
          // 验证是否成功唤起
          const hasGuide = await detectGuideBubble(page)
          if (hasGuide.exists) {
            return true
          }
        }
      } catch {
        continue
      }
    }
    
    return false
  } catch (error) {
    console.error('Failed to activate guide:', error)
    return false
  }
}

/**
 * 使用 JS 执行点击操作（支持 document.querySelector）
 * 用于图片按钮等无法通过文本匹配的元素
 */
async function clickByJS(
  context: Page | Frame,
  selector: ElementSelector
): Promise<{ success: boolean; elementInfo?: string; error?: string }> {
  // 构建查询选择器
  let querySelector = ''
  
  if (selector.classPrefix) {
    querySelector = `[class^="${selector.classPrefix}"]`
  } else if (selector.id) {
    querySelector = `#${selector.id}`
  } else if (selector.className) {
    querySelector = `.${selector.className}`
  } else if (selector.css) {
    querySelector = selector.css
  } else {
    return { success: false, error: 'No valid selector for JS execution' }
  }

  const result = await context.evaluate((qs) => {
    const elements = document.querySelectorAll(qs)
    
    if (elements.length === 0) {
      return { found: false, count: 0 }
    }
    
    // 找到第一个可见的元素
    let targetElement: HTMLElement | null = null
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement
      const rect = el.getBoundingClientRect()
      // 检查元素是否可见（有尺寸且在视口内）
      if (rect.width > 0 && rect.height > 0 && 
          window.getComputedStyle(el).visibility !== 'hidden' &&
          window.getComputedStyle(el).display !== 'none') {
        targetElement = el
        break
      }
    }
    
    if (!targetElement) {
      // 如果没有找到可见的，使用第一个元素
      targetElement = elements[0] as HTMLElement
    }
    
    // 点击元素
    targetElement.click()
    
    return {
      found: true,
      count: elements.length,
      tagName: targetElement.tagName,
      className: targetElement.className,
      id: targetElement.id || ''
    }
  }, querySelector)

  if (result.found) {
    return {
      success: true,
      elementInfo: `${result.tagName}.${result.className} (${result.count} matches)`
    }
  } else {
    return { success: false, error: `No element found for selector: ${querySelector}` }
  }
}

/**
 * 根据策略执行测试步骤
 */
export async function executeStep(
  stagehand: any,
  page: Page,
  step: TestStep,
  testId: string,
  strategy: ExecutionStrategy = 'auto',
  customScreenshotDir?: string  // 支持自定义截图输出目录
): Promise<StepExecutionRecord> {
  const record: StepExecutionRecord = {
    stepId: step.id,
    stepType: step.type,
    description: step.description,
    strategy,
    status: 'running',
    startTime: new Date().toISOString(),
  }
  
  // 使用自定义目录或默认目录
  const screenshotDir = customScreenshotDir || PATHS.SCREENSHOTS
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }
  
  try {
    // 根据操作类型选择执行方式
    switch (step.type) {
      case 'goto':
        if (!step.value) throw new Error('Goto step must provide URL')
        await page.goto(step.value, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(2000) // 等待初始渲染
        record.status = 'success'
        break
        
      case 'clear':
        // 清除浏览器状态
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
        
      case 'screenshot':
        const screenshotName = `${testId}_${step.id}_${Date.now()}.png`
        const screenshotPath = path.join(screenshotDir, screenshotName)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        record.screenshot = `/screenshots/${screenshotName}`
        record.status = 'success'
        break
        
      case 'wait':
        const waitTime = parseInt(step.value || '1000')
        await page.waitForTimeout(waitTime)
        record.status = 'success'
        break
        
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
        
      case 'js':
        // 使用 JS 执行操作（如 document.querySelector 点击）
        if (step.selector) {
          const jsResult = await clickByJS(page, step.selector)
          if (jsResult.success) {
            record.status = 'success'
            
            // 截图记录
            const successScreenshotName = `${testId}_${step.id}_js_success_${Date.now()}.png`
            const successPath = path.join(screenshotDir, successScreenshotName)
            await page.screenshot({ path: successPath, fullPage: true })
            record.screenshot = `/screenshots/${successScreenshotName}`
          } else {
            throw new Error(jsResult.error || 'JS execution failed')
          }
        } else {
          throw new Error('JS step must provide a selector')
        }
        break
        
      case 'followGuide': {
        // 智能引导跟随：检测气泡→按指引点击→无气泡则唤起→失败
        const maxWaitTime = step.maxWaitTime || 10000 // 默认最多等待10秒
        const tryActivate = step.tryActivateGuide !== false // 默认尝试唤起
        const isLoopMode = step.loop === true // 循环模式
        const maxLoopIter = step.maxLoopIterations || 50 // 最大循环次数
        
        // 获取目标 iframe（用于演示页面等嵌套场景）
        const targetFrame = await getTargetIframe(page)
        
        if (isLoopMode) {
          // ========== 循环模式：自动循环直到没有气泡 ==========
          console.log(`[followGuide] 🔄 循环模式启动，最大循环 ${maxLoopIter} 次${targetFrame ? ' (iframe mode)' : ''}`)
          
          let totalIterations = 0
          let hasMoreGuides = true
          let staleCount = 0 // 无变化计数器（防止死循环）
          let lastTargetKey = '' // 上次点击的目标标识
          const MAX_STALE = 3 // 连续3次无变化则结束
          const loopRecords: StepExecutionRecord[] = []
          
          while (hasMoreGuides && totalIterations < maxLoopIter) {
            totalIterations++
            console.log(`\n[followGuide] 🔄 循环第 ${totalIterations}/${maxLoopIter} 次`)
            
            const iterRecord: StepExecutionRecord = {
              stepId: `${step.id}_iter${totalIterations}`,
              stepType: step.type,
              description: `[循环${totalIterations}] ${step.description}`,
              strategy,
              status: 'running',
              startTime: new Date().toISOString(),
            }
            
            // 轮询检测气泡（支持主页面和 iframe）
            let guideDetected = false
            const pollInterval = 500
            const maxAttempts = Math.floor(maxWaitTime / pollInterval)
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              // 使用增强的 detectGuideBubble（自动检测主页面和 iframe）
              const bubbleInfo = await detectGuideBubble(page, targetFrame || undefined)
              
              if (bubbleInfo.exists) {
                console.log(`[followGuide] ✅ 检测到指引气泡! 文本: "${bubbleInfo.text?.substring(0, 50)}"`)
                iterRecord.guideBubbleInfo = bubbleInfo
                guideDetected = true
                
                // 截图记录气泡状态
                const bubbleScreenshotName = `${testId}_${step.id}_iter${totalIterations}_detected_${Date.now()}.png`
                await page.screenshot({ path: path.join(screenshotDir, bubbleScreenshotName), fullPage: true })
                iterRecord.screenshot = `/screenshots/${bubbleScreenshotName}`
                
                // 点击目标（使用增强的 clickGuideTarget，支持 iframe 和高亮检测）
                const clickResult = await clickGuideTarget(page, targetFrame || undefined)
                
                if (clickResult.success) {
                  console.log(`[followGuide] ✅ 成功点击目标: ${clickResult.targetInfo}`)
                  iterRecord.status = 'success'
                  
                  // 检测是否与上次点击相同（防止死循环）
                  const currentKey = clickResult.targetInfo || ''
                  if (currentKey === lastTargetKey) {
                    staleCount++
                    if (staleCount >= MAX_STALE) {
                      console.log(`[followGuide] ⏹️ ${MAX_STALE}次连续相同操作，结束循环`)
                      iterRecord.description = `[循环结束-重复] ${step.description}`
                    }
                  } else {
                    staleCount = 0
                    lastTargetKey = currentKey
                  }
                  
                  await page.waitForTimeout(1500)
                  
                  // 截图记录点击后状态
                  const afterScreenshotName = `${testId}_${step.id}_iter${totalIterations}_clicked_${Date.now()}.png`
                  await page.screenshot({ path: path.join(screenshotDir, afterScreenshotName), fullPage: true })
                } else {
                  // 有气泡但无法点击 - 尝试备选方案
                  console.log(`[followGuide] ⚠️ 无法点击目标: ${clickResult.error}，尝试备选...`)
                  
                  // 备选1: 在目标 iframe 中使用高亮检测点击
                  if (targetFrame) {
                    const highlightResult = await clickHighlightTargetInFrame(targetFrame)
                    if (highlightResult.success) {
                      iterRecord.status = 'success'
                      await page.waitForTimeout(1500)
                      const fbScreenshotName = `${testId}_${step.id}_iter${totalIterations}_fallback_${Date.now()}.png`
                      await page.screenshot({ path: path.join(screenshotDir, fbScreenshotName), fullPage: true })
                      break
                    }
                  }
                  
                  // 备选2: 使用步骤提供的选择器
                  if (step.selector) {
                    const fallbackResult = await clickByJS(targetFrame || page, step.selector)
                    if (fallbackResult.success) {
                      iterRecord.status = 'success'
                      await page.waitForTimeout(1500)
                      const fbScreenshotName = `${testId}_${step.id}_iter${totalIterations}_js_fallback_${Date.now()}.png`
                      await page.screenshot({ path: path.join(screenshotDir, fbScreenshotName), fullPage: true })
                      break
                    }
                  }
                  
                  // 所有备选都失败
                  iterRecord.status = 'failed'
                  iterRecord.error = `循环${totalIterations}: 目标点击失败且所有备选也失败`
                }
                
                break // 跳出轮询
              }
              
              if (attempt < maxAttempts - 1) {
                await page.waitForTimeout(pollInterval)
              }
            }
            
            // 处理无气泡情况
            if (!guideDetected) {
              console.log(`[followGuide] ⏹️ 第${totalIterations}次未检测到气泡，循环结束`)
              iterRecord.status = 'skipped'
              iterRecord.description = `[循环结束-无气泡] ${step.description}`
              hasMoreGuides = false
            }
            
            // 检查是否因重复操作而需要结束
            if (staleCount >= MAX_STALE) {
              hasMoreGuides = false
            }
            
            iterRecord.endTime = new Date().toISOString()
            iterRecord.duration = new Date(iterRecord.endTime).getTime() - new Date(iterRecord.startTime || iterRecord.endTime).getTime()
            loopRecords.push(iterRecord)
            
            // 步骤间等待
            if (hasMoreGuides) {
              await page.waitForTimeout(800)
            }
          }
          
          // 构造最终record（包含所有循环迭代信息）
          record.status = loopRecords.some(r => r.status === 'failed') ? 'partial' : 'success' as any
          record.guideBubbleInfo = { exists: totalIterations > 0, currentStep: totalIterations, totalSteps: maxLoopIter } as GuideBubbleInfo
          
          // 取最后一张截图作为主截图
          const lastWithScreenshot = [...loopRecords].reverse().find(r => r.screenshot)
          if (lastWithScreenshot) {
            record.screenshot = lastWithScreenshot.screenshot
          }
          
          record.endTime = new Date().toISOString()
          record.duration = new Date(record.endTime).getTime() - new Date(record.startTime || record.endTime).getTime()
          
          // 将循环记录附加到特殊字段
          ;(record as unknown as Record<string, unknown>)._loopRecords = loopRecords
          ;(record as unknown as Record<string, unknown>)._loopTotalIterations = totalIterations
          
          console.log(`[followGuide] loop done: ${totalIterations} iters, ${loopRecords.filter(r=>r.status==='success').length} success`)
          break
        }
        
        // ========== 单次模式（原有逻辑）==========
        
        console.log(`[followGuide] 开始检测指引气泡，最大等待: ${maxWaitTime}ms`)
        
        let guideDetected = false
        let clickResult: { success: boolean; targetInfo?: string; error?: string }
        
        // 1. 轮询检测引导气泡（最多等待 maxWaitTime 毫秒）
        const pollInterval = 500 // 每500ms检测一次
        const maxAttempts = Math.floor(maxWaitTime / pollInterval)
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const bubbleInfo = await detectGuideBubble(page)
          
          if (bubbleInfo.exists) {
            console.log(`[followGuide] ✅ 检测到指引气泡! 文本: "${bubbleInfo.text}"`)
            record.guideBubbleInfo = bubbleInfo
            guideDetected = true
            
            // 截图记录检测到气泡的状态
            const bubbleScreenshotName = `${testId}_${step.id}_guide_detected_${Date.now()}.png`
            const bubblePath = path.join(screenshotDir, bubbleScreenshotName)
            await page.screenshot({ path: bubblePath, fullPage: true })
            record.screenshot = `/screenshots/${bubbleScreenshotName}` // 保存到record
            
            // 2. 有气泡 → 点击气泡指向的目标元素
            clickResult = await clickGuideTarget(page)
            
            if (clickResult.success) {
              console.log(`[followGuide] ✅ 成功点击目标: ${clickResult.targetInfo}`)
              record.status = 'success'
              
              // 等待动画/过渡
              await page.waitForTimeout(1500)
              
              // 截图记录点击后状态
              const afterClickScreenshotName = `${testId}_${step.id}_after_guide_click_${Date.now()}.png`
              const afterClickPath = path.join(screenshotDir, afterClickScreenshotName)
              await page.screenshot({ path: afterClickPath, fullPage: true })
              record.screenshot = `/screenshots/${afterClickScreenshotName}`
            } else {
              // 有气泡但无法点击目标，使用备选方案
              console.warn(`[followGuide] ⚠️ 无法点击目标: ${clickResult.error}`)
              
              if (step.selector) {
                // 使用步骤提供的选择器作为备选
                console.log('[followGuide] 尝试使用备选选择器...')
                const fallbackResult = await clickByJS(page, step.selector)
                if (fallbackResult.success) {
                  console.log(`[followGuide] ✅ 备选方案成功: ${fallbackResult.elementInfo}`)
                  record.status = 'success'
                  await page.waitForTimeout(1500)
                  
                  const fallbackScreenshotName = `${testId}_${step.id}_fallback_success_${Date.now()}.png`
                  const fallbackPath = path.join(screenshotDir, fallbackScreenshotName)
                  await page.screenshot({ path: fallbackPath, fullPage: true })
                  record.screenshot = `/screenshots/${fallbackScreenshotName}`
                } else {
                  throw new Error(`引导目标点击失败且备选方案也失败: ${clickResult.error}`)
                }
              } else {
                throw new Error(`无法点击引导目标: ${clickResult.error}`)
              }
            }
            
            break // 跳出循环
          }
          
          // 没有检测到气泡，短暂等待后重试
          if (attempt < maxAttempts - 1) {
            await page.waitForTimeout(pollInterval)
          }
        }
        
        // 3. 如果没有检测到气泡
        if (!guideDetected) {
          console.warn('[followGuide] ⚠️ 未检测到指引气泡')
          
          if (tryActivate) {
            // 尝试唤起引导
            console.log('[followGuide] 尝试唤起引导...')
            const activated = await activateGuide(page)
            
            if (activated) {
              console.log('[followGuide] ✅ 引导已唤起!')
              // 唤起成功后再次尝试检测和点击
              await page.waitForTimeout(2000)
              
              const afterActivateBubble = await detectGuideBubble(page)
              if (afterActivateBubble.exists) {
                record.guideBubbleInfo = afterActivateBubble
                
                const activateClickResult = await clickGuideTarget(page)
                if (activateClickResult.success) {
                  record.status = 'success'
                  
                  const successScreenshotName = `${testId}_${step.id}_activated_and_clicked_${Date.now()}.png`
                  const successPath = path.join(screenshotDir, successScreenshotName)
                  await page.screenshot({ path: successPath, fullPage: true })
                  record.screenshot = `/screenshots/${successScreenshotName}`
                } else {
                  throw new Error('引导已唤起但无法点击目标')
                }
              } else {
                throw new Error('引导唤起但未检测到气泡')
              }
            } else {
              // 无法唤起引导，任务失败
              throw new Error('未检测到指引气泡且无法唤起引导，任务执行失败')
            }
          } else {
            // 不允许尝试唤起，直接失败
            throw new Error('未检测到指引气泡（配置为不尝试唤起），任务执行失败')
          }
        }
        break
      } // end case 'followGuide'
    }
    
    record.endTime = new Date().toISOString()
    record.duration = new Date(record.endTime).getTime() - new Date(record.startTime || record.endTime).getTime()
    
  } catch (error) {
    record.status = 'failed'
    record.error = (error as Error).message
    record.endTime = new Date().toISOString()
    
    // 失败时截图
    try {
      const failScreenshotName = `${testId}_${step.id}_fail_${Date.now()}.png`
      const failPath = path.join(screenshotDir, failScreenshotName)
      await page.screenshot({ path: failPath, fullPage: true })
      record.screenshot = `/screenshots/${failScreenshotName}`
    } catch {}
  }
  
  return record
}

/**
 * 执行交互操作（点击、填写等）
 */
async function executeInteraction(
  stagehand: any,
  page: Page,
  step: TestStep,
  strategy: ExecutionStrategy,
  screenshotDir: string,
  testId: string,
  record: StepExecutionRecord
): Promise<void> {
  // 先检查并处理 mask 遮罩层
  const maskResult = await handleMaskLayer(page, screenshotDir, testId)
  if (maskResult.closed) {
    record.maskClosed = true
    record.maskScreenshot = maskResult.screenshot
  }
  
  // 先尝试精确选择器（如果提供且策略允许）
  if (step.selector && (strategy === 'selector' || strategy === 'auto')) {
    // 尝试在主页面和所有 iframe 中查找
    const globalResult = await findElementGlobally(page, step.selector)
    
    if (globalResult.found && globalResult.locator) {
      record.selectorUsed = step.selector
      
      try {
        // 执行相应的操作
        switch (step.type) {
          case 'click':
            await globalResult.locator.click({ timeout: 5000, force: false })
            break
          case 'fill':
            if (step.value) {
              await globalResult.locator.fill(step.value)
            }
            break
          case 'hover':
            await globalResult.locator.hover()
            break
        }
        record.status = 'success'
        record.frameName = globalResult.frame?.name()
        
        // 成功后截图记录
        const successScreenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
        const successPath = path.join(screenshotDir, successScreenshotName)
        await page.screenshot({ path: successPath, fullPage: true })
        record.screenshot = `/screenshots/${successScreenshotName}`
        
        return
      } catch (selectorError) {
        // 选择器找到了元素但操作失败，抛出错误
        throw selectorError
      }
    }
  }
  
  // 如果没有选择器或选择器未找到，尝试 AI 识别
  if (strategy === 'ai' || strategy === 'auto') {
    let action = 'Click'
    if (step.type === 'fill') action = 'Input in'
    if (step.type === 'hover') action = 'Hover on'
    
    const result = await findByAI(stagehand, page, action, step.description)
    
    if (result.success) {
      record.status = 'success'
      if (result.confidence) {
        record.aiConfidence = result.confidence
      }
      
      // 成功后截图记录
      const successScreenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
      const successPath = path.join(screenshotDir, successScreenshotName)
      await page.screenshot({ path: successPath, fullPage: true })
      record.screenshot = `/screenshots/${successScreenshotName}`
      
      return
    } else if (strategy === 'ai') {
      // 仅 AI 模式失败时抛出错误
      throw new Error(result.error || 'AI 识别失败')
    }
  }
  
  // 最后尝试：使用描述作为 fallback
  try {
    let action = 'Click'
    if (step.type === 'fill' && step.value) {
      action = `Input "${step.value}" in`
    }
    if (step.type === 'hover') action = 'Hover on'
    
    await stagehand.act(`${action} ${step.description}`)
    record.status = 'success'
    
    // 成功后截图记录
    const successScreenshotName = `${testId}_${step.id}_success_${Date.now()}.png`
    const successPath = path.join(screenshotDir, successScreenshotName)
    await page.screenshot({ path: successPath, fullPage: true })
    record.screenshot = `/screenshots/${successScreenshotName}`
    
  } catch (error) {
    throw error
  }
}

/**
 * 将步骤执行记录转换为通用执行记录
 */
export function toExecutionRecord(stepRecord: StepExecutionRecord): ExecutionRecord {
  return {
    id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    stepId: stepRecord.stepId,
    timestamp: stepRecord.startTime || new Date().toISOString(),
    status: stepRecord.status === 'success' ? 'success' : 
            stepRecord.status === 'skipped' ? 'skipped' : 'failed',
    message: stepRecord.status === 'success' 
      ? `成功: ${stepRecord.description}`
      : `失败: ${stepRecord.description}${stepRecord.error ? ` - ${stepRecord.error}` : ''}`,
    screenshot: stepRecord.screenshot,
    selectorUsed: stepRecord.selectorUsed,
    aiConfidence: stepRecord.aiConfidence,
  }
}
