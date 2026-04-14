/**
 * 循环模式 followGuide 测试 v6
 * 
 * 基于已验证的截图信息优化:
 *   - 引导目标: 带蓝色高亮框 + 手指图标的按钮 (如"新增服务申请")
 *   - 高亮特征: box-shadow 蓝色发光 / 特殊 border / z-index 提升
 *   - 关键: 排除底部链接、静态文字、地图区域等干扰项
 */

const { chromium } = require('playwright')
const path = require('path')
const fs_mod = require('fs')

const DEMO_URL = 'https://xft.cmbchina.com/omsapp/#/xft-demo?democode=input_invoice&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJTTTNXaXRoU00yIn0.eyJleHAiOjE3NTU1NzQ2ODksImlhdCI6MTc1NTU2Mzg4OSwidG9rZW5lIjoie1widXNlck5hbWVcIjpcIuW8o+S9s+eQqvwiLFwicGxhdGZvcm1Vc2VySWRcIjpcIjEwMDIyOTUxXCIsXCJzYXBJZFwiOlwiODAzODAwMzRcIixcIm9yZ2FuaXphdGlvblwiOlwi5oC76KGMLeS_oeaBryajgqcunY_hveuvguWZs-2L4bHl9a-sjOX5k6Hlj5fm4aHljaT1p5_miJzmjLzoq5Ttm6vmjaLmhaLqn5zmipTqr53kiJH0In0.RS3eXeSy4eqOeb3F_l6hrUK9hXUrM392M_GkUlehWvAU4gzEpuDH32bCHD9A39_twWFP-Wvmek2WJPfLU9x8Kw&xftToken=041C179428745A7D83B85035134D35585ACF8F0100EC7C56AFCA2D3CD8FF27D987D47878416B658048B94B5989240D8DCCFA5FD9592557B2AC2F0158B1DE4745F72965C7B521AAAEB5B61B829F9532ACCB79D15D10AE70AD3C2ED063B149624740770B2C4C8BEAA23B98E0F5C8012F675E763A485B814D75ABE1E4DF0ADB95B7C9A67EB4AE23FBC246C692A7307BA117A8F6214EC63E95B1C43CD289618F2CBAC00818B22A065C213D75A0E1EDADDA6D2FBE1C'

/**
 * 检测引导状态并找到高亮的目标元素
 */
async function detectAndFindTarget(page) {
  return await page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight
    
    // ===== 1. 找引导遮罩层 =====
    let hasGuideMask = false
    const maskCandidates = document.querySelectorAll('[class*="mask"], [class*="overlay"], [class*="Mask"], [class*="Overlay"]')
    for (const m of maskCandidates) {
      if (!(m instanceof HTMLElement)) continue
      const r = m.getBoundingClientRect()
      if (r.width > W * 0.6 && r.height > H * 0.6) {
        hasGuideMask = true
        break
      }
    }

    // ===== 2. 找引导气泡（带文字说明的弹窗）=====
    let bubbleInfo = null
    const bubbleSels = [
      '[class*="guide"]', '[class*="tour"]', 
      '[class*="popover"]:not([class*="DemoMap"])',
      '[class*="tooltip"]', '[class*="intro"]'
    ]
    
    for (const sel of bubbleSels) {
      const els = document.querySelectorAll(sel)
      for (const el of els) {
        if (!(el instanceof HTMLElement)) continue
        // 跳过地图区域的
        if (el.closest('[class*="DemoMap"], [class*="map"]')) continue
        
        const s = window.getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue
        const r = el.getBoundingClientRect()
        
        // 气泡特征：绝对定位、中等大小、可见
        const isBubbleLike = s.position === 'absolute' || s.position === 'fixed'
        const hasSize = r.width >= 80 && r.height >= 40 && r.width < W * 0.6
        
        if (isBubbleLike && hasSize) {
          bubbleInfo = {
            text: (el.textContent || '').trim().substring(0, 100),
            pos: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            class: String(el.className).substring(0, 60),
            tag: el.tagName,
          }
          break
        }
      }
      if (bubbleInfo) break
    }

    // ===== 3. 找引导高亮的目标按钮（最关键的！）=====
    let targetBtn = null
    const allBtns = document.querySelectorAll(`
      button:not([disabled]),
      [role="button"]:not([disabled]),
      .ant-btn:not([disabled]),
      .el-button:not([disabled]),
      a[class*="btn"],
      div[onclick],
      span[style*="cursor"]
    `)

    for (const el of allBtns) {
      if (!(el instanceof HTMLElement)) continue
      
      // 排除区域
      if (el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error-page"]')) continue
      
      const s = window.getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      
      // 尺寸过滤：引导目标一般是正常大小的按钮
      if (r.width < 30 || r.height < 25 || r.width > 500) continue
      // 位置过滤：在视口内且不在最底部（排除分页/工具栏）
      if (r.y > H - 200 || r.y < -50 || r.x > W - 20) continue
      
      // 计算高亮分数
      let highlightScore = 0
      let reasons = []
      
      // A. box-shadow 发光（引导最常用的方式）
      const bs = s.boxShadow || ''
      if (bs !== 'none' && bs.length > 20) {
        // 检查是否有彩色值（非黑非透明）
        if (/rgba?\([^)]+\)/i.test(bs)) {
          const colors = bs.match(/rgba?\([^)]+\)/g) || []
          for (const c of colors) {
            // 蓝色系或彩色发光
            if ((c.includes('24, 144') || c.includes('22, 119') || c.includes('64, 158')) ||
                (!c.includes('0, 0, 0') && !c.includes('0,0,0'))) {
              highlightScore += 15
              reasons.push(`blue-glow`)
              break
            }
          }
        }
        // 非零 box-shadow 也给分
        if (highlightScore === 0 && bs !== 'none') {
          highlightScore += 5
          reasons.push(`shadow:${bs.substring(0,25)}`)
        }
      }
      
      // B. 特殊边框颜色（蓝色/主题色边框）— 排除白/黑/灰
      const bc = s.borderTopColor || ''
      const bt = bc
      if ((bt !== '' && !bt.includes('rgb(0, 0, 0)') && bt.length > 5) &&
          (bt.includes('rgb(') && 
           !bc.includes('217, 217') && 
           !bc.includes('255, 255') &&
           !bc.includes('95, 99, 104'))) {
        highlightScore += 12
        reasons.push(`color-border:${bt.substring(0,30)}`)
      }
      
      // C. outline（但排除浏览器默认outline）
      const ol = s.outline || ''
      if (ol !== 'none' && ol.length > 8) {
        // 默认浏览器 outline 一般较短或包含特定值
        if (!ol.includes('rgb(255, 255, 255)') && !ol.includes('rgb(95, 99, 104)')) {
          highlightScore += 8
          reasons.push(`custom-outline`)
        }
      }
      
      // D. z-index 异常高（引导会提升层级）
      const zi = parseInt(s.zIndex || '0')
      if (zi >= 999) { highlightScore += 6; reasons.push(`zindex:${zi}`) }
      if (zi >= 2000) { highlightScore += 4; reasons.push(`zindex-high`) }
      
      // E. transform 动画
      const tf = s.transform || ''
      if (tf !== 'none' && tf.includes('scale')) {
        highlightScore += 3; reasons.push(`scale-anim`)
      }
      
      // F. 文本内容匹配常见引导目标
      const text = (el.textContent || '').trim()
      if (/新增|申请|授权|开始|下一步|完成|取票|同步|确认|提交|保存/i.test(text)) {
        highlightScore += 5
        reasons.push('action-text')
      }
      
      // G. 按钮类型加分
      if (el.classList.contains('ant-btn-primary')) { highlightScore += 4; reasons.push('primary-btn') }
      if (el.classList.contains('ant-btn-primary')) { /* already counted */ }
      if (s.backgroundColor && !s.backgroundColor.includes('0, 0, 0') && s.backgroundColor.includes('rgb(')) {
        highlightScore += 2; reasons.push('colored-bg')
      }

      // 记录高分候选（调试：也记录低分的）
      if (highlightScore >= 5) {
        if (!targetBtn || highlightScore > targetBtn.score) {
          targetBtn = {
            el, score: highlightScore, reasons,
            tag: el.tagName, text: text.substring(0,40),
            class: String(el.className).substring(0,50),
            pos: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          }
        }
      }
    }

    return {
      active: hasGuideMask || !!targetBtn || !!bubbleInfo,
      mask: hasGuideMask,
      bubble: bubbleInfo,
      target: targetBtn ? {
        tag: targetBtn.tag, text: targetBtn.text, class: targetBtn.class,
        score: targetBtn.score, reasons: targetBtn.reasons, pos: targetBtn.pos,
      } : null,
    }
  })
}

/**
 * 点击引导目标
 */
async function clickGuideTarget(page) {
  return await page.evaluate(() => {
    // 使用与 detectAndFindTarget 完全一致的选择器和评分逻辑
    const allBtns = document.querySelectorAll(`
      button:not([disabled]), [role="button"]:not([disabled]),
      .ant-btn:not([disabled]), .el-button:not([disabled]),
      a[class*="btn"], div[onclick], span[style*="cursor"]
    `)

    const candidates = []
    
    for (const el of allBtns) {
      if (!(el instanceof HTMLElement)) continue
      // 排除区域（与 detectAndFindTarget 一致）
      if (el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error"], [class*="error-page"]')) continue
      
      const s = window.getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      // 尺寸过滤（与 detectAndFindTarget 一致）
      if (r.width < 30 || r.height < 25 || r.width > 500) continue
      if (r.y > window.innerHeight - 200 || r.y < -50) continue
      
      // 排除错误页面按钮
      const text = (el.textContent||'').trim()
      if (/重新加载|Reload|Details?|详情/i.test(text)) continue
      
      let score = 0
      const reasons = []
      
      const bs = s.boxShadow || ''
      // A. box-shadow 发光
      if (bs !== 'none' && bs.length > 20) {
        if (/rgba?\((?!0,\s*0,\s*0)[^)]+\)/i.test(bs)) {
          score += 15; reasons.push('glow')
        } else {
          score += 5; reasons.push('shadow')
        }
      }
      
      // B. 特殊边框颜色 — 排除白/黑/灰色系
      const bc = s.borderTopColor || s.borderColor || ''
      if (bc.includes('rgb(') && !bc.includes('0, 0, 0') &&
          !bc.includes('217, 217') && !bc.includes('255, 255') &&
          !bc.includes('95, 99') && !/1\d{2},\s*1\d{2}/.test(bc) &&
          !/15\d,\s*16\d/.test(bc)) {
        score += 12; reasons.push('color-border')
      }
      
      // C. outline（排除浏览器默认值）
      const ol = s.outline || ''
      if (ol !== 'none' && ol.length > 8 && 
          !ol.includes('255, 255, 255') && !ol.includes('95, 99, 104') &&
          !/1\d{2},\s*1\d{2}/.test(ol)) {
        score += 8; reasons.push('outline')
      }
      
      // D. z-index
      const zi = parseInt(s.zIndex || '0')
      if (zi >= 999) { score += 5; reasons.push(`z:${zi}`) }
      
      // E. 操作文字匹配
      if (/新增|申请|授权|取票|同步|下一步|确认|提交|开始/i.test(text)) {
        score += 4; reasons.push('action-text')
      }
      
      // F. primary 按钮
      if (el.classList.contains('ant-btn-primary')) { score += 5; reasons.push('primary') }
      
      // G. 彩色背景
      const bg = s.backgroundColor || ''
      if (bg.includes('rgb(') && !bg.includes('0, 0, 0') && !bg.includes('255, 255, 255') && bg.length > 12) {
        score += 2; reasons.push('colored-bg')
      }

      if (score >= 5) {
        candidates.push({ el, score, text: text.substring(0,30), tag: el.tagName, reasons })
      }
    }
    
    // 按分数排序
    candidates.sort((a, b) => b.score - a.score)
    
    if (candidates.length > 0) {
      const best = candidates[0]
      console.log('[click] 最佳目标:', JSON.stringify({ tag: best.tag, text: best.text, score: best.score, reasons: best.reasons }))
      best.el.click()
      return { success: true, info: `<${best.tag}> "${best.text}" [${best.score}pt] ${best.reasons.join(',')}` }
    }
    
    // 兜底：返回第一个可见按钮
    for (const el of allBtns) {
      if (!(el instanceof HTMLElement)) continue
      if (el.closest('[class*="DemoMap"], [class*="error"]')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 30 && r.height > 20 && r.y < window.innerHeight - 200) {
        const key = `${el.tagName}:${(el.textContent||'').trim().substring(0,20)}`
        if (!window._clickedSet?.has(key)) {
          el.click()
          if (!window._clickedSet) window._clickedSet = new Set()
          window._clickedSet.add(key)
          return { success: true, info: `fallback: "${(el.textContent||'').trim().substring(0,25)}"` }
        }
      }
    }
    
    return { success: false, error: 'No target found' }
  })
}

async function main() {
  const outputDir = path.join(process.cwd(), 'test-output')
  if (!fs_mod.existsSync(outputDir)) fs_mod.mkdirSync(outputDir, { recursive: true })
  
  console.log('='.repeat(70))
  console.log('  循环模式 followGuide 测试 v7')
  console.log('  策略: iframe-aware 检测引导高亮按钮')
  console.log('='.repeat(70))
  
  const browser = await chromium.launch({ headless: false })
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  let iframePage = null
  
  // 获取 iframe 内部的 page 对象
  async function getIframeFrame() {
    const iframeEl = await page.$('#demo_detail_iframe') || await page.$('iframe')
    if (!iframeEl) return null
    return await iframeEl.contentFrame()
  }
  
  try {
    console.log('\n[Step 1] 打开页面...')
    await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    console.log('   页面 DOM 已加载，等待内容渲染...')
    await page.waitForTimeout(8000)
    
    // 等待 iframe 加载
    console.log('[Diag] 等待 iframe 加载...')
    let iframeEl = null
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500)
      iframeEl = await page.$('#demo_detail_iframe') || await page.$('iframe')
      if (iframeEl) break
      // 输出当前状态
      if (i % 5 === 4) {
        const url = await page.evaluate(() => location.href).catch(() => 'N/A')
        console.log(`   仍在等待... (${i+1}) url=${url.substring(0,60)}`)
      }
    }
    
    if (!iframeEl) { console.error('   未找到 iframe!'); process.exit(1) }
    
    const iframe = await iframeEl.contentFrame()
    if (!iframe) { console.error('   无法获取 iframe content frame!'); process.exit(1) }
    iframePage = iframe
    
    console.log(`   主页面 URL: ${page.url().substring(0, 60)}...`)
    console.log(`   iframe URL: ${await iframe.evaluate(() => location.href).then(u => u.substring(0, 80))}`)
    
    await page.screenshot({ path: path.join(outputDir, 'v7_01_initial.png'), fullPage: true, timeout: 30000 })

    console.log('\n[Step 2] 点击「开始演示」...')
    // "开始演示" 按钮在主页面中（右侧面板）
    let clicked = false
    for (const sel of ['text=开始演示', '[class*="startBtn"]', '.ant-btn:has-text("开始")']) {
      try {
        const el = page.locator(sel).first()
        if (await el.count() > 0 && await el.isVisible({ timeout: 1000 })) {
          console.log(`   找到: ${sel}`)
          await el.click({ timeout: 3000 })
          clicked = true
          break
        }
      } catch(e) {}
    }
    if (!clicked) console.log('   未找到开始演示按钮!')
    
    await page.waitForTimeout(5000)
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch(e) {}
    await page.screenshot({ path: path.join(outputDir, 'v7_after_start.png'), fullPage: true })

    console.log('\n[Step 3] 处理弹窗...')
    try {
      // 弹窗可能在主页面或 iframe 中
      for (const p of [page, iframe]) {
        const btn = p.locator('text=暂不').first()
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 1000 })) {
          await btn.click({ timeout: 2000 }); console.log('   已关闭弹窗'); break
        }
      }
    } catch(e) { console.log('   无弹窗') }
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(outputDir, 'v7_guide_ready.png'), fullPage: true })

    // ========== 循环：在 iframe 内检测和点击 ==========
    console.log('\n' + '='.repeat(70))
    console.log('  🔄 循环 followGuide 启动! (iframe mode)')
    console.log('='.repeat(70))

    const MAX_ITERATIONS = 30
    const MAX_STALE = 3
    let iteration = 0
    let staleCount = 0
    let lastKey = ''
    const results = []

    while (iteration < MAX_ITERATIONS) {
      iteration++
      console.log(`\n  🔄 [${iteration}/${MAX_ITERATIONS}] 在 iframe 中检测...`)
      
      // 在 iframe 中执行检测
      const state = await iframe.evaluate(() => {
        const W = window.innerWidth, H = window.innerHeight
        
        // ===== 1. 找引导遮罩层 =====
        let hasGuideMask = false
        const maskCandidates = document.querySelectorAll('[class*="mask"], [class*="overlay"], [class*="Mask"], [class*="Overlay"]')
        for (const m of maskCandidates) {
          if (!(m instanceof HTMLElement)) continue
          const r = m.getBoundingClientRect()
          if (r.width > W * 0.6 && r.height > H * 0.6) { hasGuideMask = true; break }
        }

        // ===== 2. 找引导气泡 =====
        let bubbleInfo = null
        const bubbleSels = ['[class*="guide"]', '[class*="tour"]', '[class*="popover"]:not([class*="DemoMap"])', '[class*="tooltip"]', '[class*="intro"]']
        
        for (const sel of bubbleSels) {
          const els = document.querySelectorAll(sel)
          for (const el of els) {
            if (!(el instanceof HTMLElement)) continue
            if (el.closest('[class*="DemoMap"], [class*="map"]')) continue
            const s = window.getComputedStyle(el)
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue
            const r = el.getBoundingClientRect()
            const isBubbleLike = s.position === 'absolute' || s.position === 'fixed'
            const hasSize = r.width >= 80 && r.height >= 40 && r.width < W * 0.6
            
            if (isBubbleLike && hasSize) {
              bubbleInfo = { text: (el.textContent||'').trim().substring(0,100), pos: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, class: String(el.className).substring(0,60), tag: el.tagName }
              break
            }
          }
          if (bubbleInfo) break
        }

        // ===== 3. 找高亮目标按钮 =====
        let targetBtn = null
        const allBtns = document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled]), .ant-btn:not([disabled]), .el-button:not([disabled]), a[class*="btn"], div[onclick], span[style*="cursor"]')

        for (const el of allBtns) {
          if (!(el instanceof HTMLElement)) continue
          
          // 排除区域（排除底部工具栏）
          if (el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error-page"]')) continue
          
          const s = window.getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden') continue
          const r = el.getBoundingClientRect()
          
          // 过滤：正常大小、不在底部工具栏
          if (r.width < 30 || r.height < 25 || r.width > 500) continue
          if (r.y > H - 200 || r.y < -50 || r.x > W - 20) continue
          
          let highlightScore = 0
          const reasons = []
          
          // A. box-shadow 发光
          const bs = s.boxShadow || ''
          if (bs !== 'none' && bs.length > 20) {
            if (/rgba?\([^)]+\)/i.test(bs)) {
              const colors = bs.match(/rgba?\([^)]+\)/g) || []
              for (const c of colors) {
                if ((c.includes('24, 144') || c.includes('22, 119') || c.includes('64, 158')) ||
                    (!c.includes('0, 0, 0') && !c.includes('0,0,0'))) {
                  highlightScore += 15; reasons.push('blue-glow'); break
                }
              }
            }
            if (highlightScore === 0 && bs !== 'none') { highlightScore += 5; reasons.push('shadow') }
          }
          
          // B. 特殊边框颜色
          const bc = s.borderTopColor || ''
          if ((bc !== '' && !bc.includes('rgb(0, 0, 0)') && bc.length > 5) &&
              (bc.includes('rgb(') && !bc.includes('217, 217') && !bc.includes('255, 255') && !bc.includes('95, 99, 104'))) {
            highlightScore += 12; reasons.push('color-border')
          }
          
          // C. outline
          const ol = s.outline || ''
          if (ol !== 'none' && ol.length > 8 && !ol.includes('rgb(255, 255, 255)') && !ol.includes('rgb(95, 99, 104)')) {
            highlightScore += 8; reasons.push('outline')
          }
          
          // D. z-index
          const zi = parseInt(s.zIndex || '0')
          if (zi >= 999) { highlightScore += 6; reasons.push(`z:${zi}`) }
          if (zi >= 2000) { highlightScore += 4 }
          
          // E. 文本内容匹配
          const text = (el.textContent||'').trim()
          if (/新增|申请|授权|开始|下一步|完成|取票|同步|确认|提交|保存/i.test(text)) {
            highlightScore += 5; reasons.push('action-text')
          }
          
          // F. primary 按钮
          if (el.classList.contains('ant-btn-primary')) { highlightScore += 4; reasons.push('primary-btn') }
          
          // G. 彩色背景
          if (s.backgroundColor && !s.backgroundColor.includes('0, 0, 0') && s.backgroundColor.includes('rgb(')) {
            highlightScore += 2; reasons.push('colored-bg')
          }

          if (highlightScore >= 8) {
            if (!targetBtn || highlightScore > targetBtn.score) {
              targetBtn = { score: highlightScore, reasons, tag: el.tagName, text: text.substring(0,40), class: String(el.className).substring(0,50), pos: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
            }
          }
        }

        return { active: hasGuideMask || !!targetBtn || !!bubbleInfo, mask: hasGuideMask, bubble: bubbleInfo, target: targetBtn ? { tag: targetBtn.tag, text: targetBtn.text, class: targetBtn.class, score: targetBtn.score, reasons: targetBtn.reasons, pos: targetBtn.pos } : null }
      })
      
      if (!state.active) {
        // 详细诊断
        console.log(`  ⚠️ 无引导信号`)
        
        // 显示 iframe 内所有可见元素
        const debugEls = await iframe.evaluate(() => {
          const items = []
          const allEls = document.querySelectorAll('button, [role="button"], .ant-btn, a, div[onclick], span[style*="cursor"], div, span')
          for (const el of allEls) {
            if (!(el instanceof HTMLElement)) continue
            const s = window.getComputedStyle(el)
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue
            const r = el.getBoundingClientRect()
            if (r.width < 15 || r.height < 10) continue
            if (items.length >= 30) break
            items.push({ tag: el.tagName, text: (el.textContent||'').trim().substring(0,25), cls: String(el.className).substring(0,50), pos: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, shadow: s.boxShadow?.substring(0,40) })
          }
          return items.slice(0, 30)
        })
        console.log(`  🔍 iframe 可见元素(${debugEls.length}个):`)
        for (const el of debugEls) {
          console.log(`     <${el.tag}> "${el.text}" @${el.pos} .${el.cls.substring(0,35)} shadow:${(el.shadow||'-').substring(0,30)}`)
        }
        
        results.push({ iter: iteration, status: 'ended', reason: 'inactive' })
        break
      }
      
      const key = state.target ? `${state.target.text}|${state.target.pos?.x},${state.target.pos?.y}` : state.bubble?.text || 'unknown'
      
      if (key === lastKey) staleCount++
      else { staleCount = 0; lastKey = key }
      
      if (staleCount >= MAX_STALE) {
        console.log(`  ⏹️ ${MAX_STALE}次无变化 -> 结束`)
        results.push({ iter: iteration, status: 'ended', reason: 'stale' })
        break
      }
      
      // 输出详细信息
      console.log(state.mask ? '  ✅ 有遮罩层' : '')
      if (state.bubble) console.log(`  📝 气泡: "${state.bubble.text}" @(${state.bubble.pos?.x},${state.bubble.pos?.y})`)
      if (state.target) {
        console.log(`  🎯 目标! <${state.target.tag}> "${state.target.text}" [${state.target.score}pt] ${state.target.reasons?.join(',')}`)
        console.log(`     位置: (${state.target.pos?.x}, ${state.target.pos?.y}) ${state.target.pos?.w}x${state.target.pos?.h}`)
      }
      
      // 截图
      await page.screenshot({ path: path.join(outputDir, `v7_${String(iteration).padStart(2,'0')}_before.png`), fullPage: true })
      
      // 在 iframe 中点击目标
      const clickResult = await iframe.evaluate(() => {
        // 使用与上面完全一致的评分逻辑
        const allBtns2 = document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled]), .ant-btn:not([disabled]), a[class*="btn"], div[onclick], span[style*="cursor"]')
        const candidates = []
        
        for (const el of allBtns2) {
          if (!(el instanceof HTMLElement)) continue
          if (el.closest('[class*="DemoMap"], [class*="map"], footer, [class*="footer"], [class*="error"]')) continue
          const s = window.getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden') continue
          const r = el.getBoundingClientRect()
          if (r.width < 30 || r.height < 25 || r.width > 500 || r.y > window.innerHeight - 200 || r.y < -50) continue
          
          const text = (el.textContent||'').trim()
          if (/重新加载|Reload|Details?|详情/i.test(text)) continue
          
          let score = 0
          const reasons = []
          const bs = s.boxShadow || ''
          
          if (bs !== 'none' && bs.length > 20) {
            if (/rgba?\((?!0,\s*0,\s*0)[^)]+\)/i.test(bs)) { score += 15; reasons.push('glow') }
            else { score += 5; reasons.push('shadow') }
          }
          
          const bc = s.borderTopColor || s.borderColor || ''
          if (bc.includes('rgb(') && !bc.includes('0, 0, 0') && !bc.includes('217, 217') && !bc.includes('255, 255') && !bc.includes('95, 99') && !/1\d{2},\s*1\d{2}/.test(bc) && !/15\d,\s*16\d/.test(bc)) {
            score += 12; reasons.push('color-border')
          }
          
          const ol = s.outline || ''
          if (ol !== 'none' && ol.length > 8 && !ol.includes('255, 255, 255') && !ol.includes('95, 99, 104') && !/1\d{2},\s*1\d{2}/.test(ol)) {
            score += 8; reasons.push('outline')
          }
          
          const zi = parseInt(s.zIndex || '0')
          if (zi >= 999) { score += 5; reasons.push(`z:${zi}`) }
          
          if (/新增|申请|授权|取票|同步|下一步|确认|提交|开始/i.test(text)) {
            score += 4; reasons.push('action-text')
          }
          
          if (el.classList.contains('ant-btn-primary')) { score += 5; reasons.push('primary') }
          
          const bg = s.backgroundColor || ''
          if (bg.includes('rgb(') && !bg.includes('0, 0, 0') && !bg.includes('255, 255, 255') && bg.length > 12) {
            score += 2; reasons.push('colored-bg')
          }

          if (score >= 8) {
            candidates.push({ el, score, text: text.substring(0,30), tag: el.tagName, reasons })
          }
        }
        
        candidates.sort((a, b) => b.score - a.score)
        
        if (candidates.length > 0) {
          const best = candidates[0]
          best.el.click()
          return { success: true, info: `<${best.tag}> "${best.text}" [${best.score}pt] ${best.reasons.join(',')}` }
        }
        
        // 兜底
        for (const el of allBtns2) {
          if (!(el instanceof HTMLElement)) continue
          if (el.closest('[class*="DemoMap"], [class*="error"]')) continue
          const r = el.getBoundingClientRect()
          if (r.width > 30 && r.height > 20 && r.y < window.innerHeight - 200) {
            const key = `${el.tagName}:${(el.textContent||'').trim().substring(0,20)}`
            if (!window._clickedSet?.has(key)) {
              el.click()
              if (!window._clickedSet) window._clickedSet = new Set()
              window._clickedSet.add(key)
              return { success: true, info: `fallback: "${(el.textContent||'').trim().substring(0,25)}"` }
            }
          }
        }
        
        return { success: false, error: 'No target found' }
      })
      
      if (clickResult.success) {
        console.log(`  ✅ ${clickResult.info}`)
        await page.waitForTimeout(1500)
        await page.screenshot({ path: path.join(outputDir, `v7_${String(iteration).padStart(2,'0')}_after.png`), fullPage: true })
        results.push({ iter: iteration, status: 'success', info: clickResult.info })
      } else {
        console.log(`  ❌ ${clickResult.error}`)
        results.push({ iter: iteration, status: 'failed', error: clickResult.error })
      }
      
      await page.waitForTimeout(800)
    }

    // 结果汇总
    console.log('\n' + '='.repeat(70))
    console.log(`  完成! 共${iteration}轮 | ✅${results.filter(r=>r.status==='success').length} ❌${results.filter(r=>r.status==='failed').length}`)
    for (const r of results) {
      const icon = r.status==='success'?'✅':r.status==='failed'?'❌':'⏹️'
      console.log(`    ${icon} #${r.iter}: ${r.info||r.error||r.reason}`)
    }
    
    console.log('\n[Step 5] 最终截图...')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(outputDir, 'v7_final.png'), fullPage: true })
    console.log('   test-output/v7_final.png')
    
  } catch(err) {
    console.error('Error:', err.message)
    try { await page.screenshot({ path: path.join(outputDir, 'v7_error.png'), fullPage: true }) } catch(e) {}
  } finally {
    await page.waitForTimeout(2000)
    await browser.close()
  }
}
main().catch(console.error)
