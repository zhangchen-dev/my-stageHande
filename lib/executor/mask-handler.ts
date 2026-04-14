import { Page } from 'playwright'
import path from 'path'

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
 * 检测并处理 mask 遮罩层
 */
async function handleMaskLayer(
  page: Page, 
  screenshotDir: string, 
  testId: string
): Promise<{ closed: boolean; screenshot?: string }> {
  for (const maskSelector of MASK_SELECTORS) {
    try {
      const maskCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length
      }, maskSelector)
      
      if (maskCount > 0) {
        // 尝试查找并点击关闭按钮
        for (const closeSelector of CLOSE_BUTTON_SELECTORS) {
          const closeCount = await page.evaluate((selector) => {
            return document.querySelectorAll(selector).length
          }, closeSelector)
          
          if (closeCount > 0) {
            try {
              await page.evaluate((selector) => {
                const closeButton = document.querySelector(selector) as HTMLElement
                if (closeButton) {
                  closeButton.click()
                }
              }, closeSelector)
              
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
          const stillHasMask = await page.evaluate((selector) => {
            return document.querySelectorAll(selector).length > 0
          }, maskSelector)
          
          if (!stillHasMask) {
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

export {
  handleMaskLayer
}
