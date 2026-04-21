import { TestStep, ExecutionStrategy, StepExecutionRecord } from '@/types'
import { PATHS } from '@/utils/file'
import path from 'path'
import fs from 'fs'
import { isTaskAborted, getAbortReason } from '../task-manager'

export interface WorkflowContext {
  stagehand: any
  page: any
  testId: string
  strategy: ExecutionStrategy
  screenshotDir: string
  variables: Map<string, any>
  iterationCount: Map<string, number>
  taskId?: string
}

export interface WorkflowNode {
  step: TestStep
  onSuccess?: string  // 成功时跳转到的步骤ID
  onFailure?: string  // 失败时跳转到的步骤ID
}

/**
 * 工作流执行引擎
 * 支持条件分支和循环的工作流执行
 */
export class WorkflowEngine {
  private context: WorkflowContext
  private records: StepExecutionRecord[] = []
  private stepMap: Map<string, TestStep> = new Map()
  private onLog?: (message: string) => void

  constructor(context: WorkflowContext, onLog?: (message: string) => void) {
    this.context = context
    this.onLog = onLog
  }

  /**
   * 安全调用 stagehand.observe，带重试和详细日志
   */
  private async safeObserve(instruction: string, options?: { page?: any }, maxRetries = 1): Promise<any[]> {
    const { stagehand, page } = this.context
    const actualOptions = options || { page }

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        this.onLog?.(`[观察] 正在分析: ${instruction.substring(0, 50)}... (尝试 ${attempt}/${maxRetries + 1})`)
        const result = await stagehand.observe(instruction, actualOptions)
        this.onLog?.(`[观察] 成功，找到 ${Array.isArray(result) ? result.length : 0} 个元素`)
        return result || []
      } catch (e: any) {
        const errorMsg = e?.message || String(e)
        this.onLog?.(`[观察] 失败: ${errorMsg.substring(0, 100)}`)

        if (attempt <= maxRetries) {
          this.onLog?.(`[观察] 等待 1.5 秒后重试...`)
          await new Promise(resolve => setTimeout(resolve, 1500))
        } else {
          throw new Error(`Stagehand observe 失败: ${errorMsg}`)
        }
      }
    }
    return []
  }

  /**
   * 安全调用 stagehand.act，带重试和详细日志
   */
  private async safeAct(instruction: string, options?: { page?: any }, maxRetries = 1): Promise<any> {
    const { stagehand, page } = this.context
    const actualOptions = options || { page }

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        this.onLog?.(`[操作] 正在执行: ${instruction.substring(0, 50)}... (尝试 ${attempt}/${maxRetries + 1})`)
        const result = await stagehand.act(instruction, actualOptions)
        this.onLog?.(`[操作] ${result?.success ? '成功' : '失败'}`)
        return result
      } catch (e: any) {
        const errorMsg = e?.message || String(e)
        this.onLog?.(`[操作] 失败: ${errorMsg.substring(0, 100)}`)

        if (attempt <= maxRetries) {
          this.onLog?.(`[操作] 等待 1.5 秒后重试...`)
          await new Promise(resolve => setTimeout(resolve, 1500))
        } else {
          throw new Error(`Stagehand act 失败: ${errorMsg}`)
        }
      }
    }
    return { success: false, message: 'Unknown error' }
  }

  /**
   * 构建步骤映射表
   */
  private buildStepMap(steps: TestStep[]): void {
    this.stepMap.clear()
    for (const step of steps) {
      this.stepMap.set(step.id, step)
      // 递归处理子步骤
      if (step.thenSteps) {
        this.buildStepMap(step.thenSteps)
      }
      if (step.loopSteps) {
        this.buildStepMap(step.loopSteps)
      }
      // 处理 conditionLoop 的条件步骤
      if (step.conditionStep) {
        this.stepMap.set(step.conditionStep.id, step.conditionStep)
      }
    }
  }

  /**
   * 执行完整工作流
   */
  async execute(steps: TestStep[]): Promise<{
    success: boolean
    records: StepExecutionRecord[]
    error?: string
    aborted?: boolean
  }> {
    this.buildStepMap(steps)
    this.records = []

    // 确保截图目录存在
    if (!fs.existsSync(this.context.screenshotDir)) {
      fs.mkdirSync(this.context.screenshotDir, { recursive: true })
    }

    try {
      // 使用索引执行，支持 gotoStep 跳转
      let currentIndex = 0
      const maxIterations = 1000 // 防止无限循环
      let iterationCount = 0

      while (currentIndex < steps.length && iterationCount < maxIterations) {
        iterationCount++
        const step = steps[currentIndex]
        
        if (this.context.taskId && isTaskAborted(this.context.taskId)) {
          console.log(`[工作流] 检测到终止信号，停止执行: ${getAbortReason(this.context.taskId)}`)
          return {
            success: false,
            records: this.records,
            error: `任务被终止: ${getAbortReason(this.context.taskId)}`,
            aborted: true
          }
        }
        
        console.log(`[工作流] 执行步骤 ${currentIndex + 1}/${steps.length}: ${step.type} - ${step.description}`)

        const result = await this.executeStepWithFlow(step, currentIndex + 1, steps.length)
        
        if (!result.success) {
          return {
            success: false,
            records: this.records,
            error: result.error
          }
        }

        // 检查是否是 gotoStep 类型
        if (step.type === 'gotoStep' && step.targetStepId) {
          const targetIndex = steps.findIndex(s => s.id === step.targetStepId)
          if (targetIndex !== -1) {
            console.log(`[工作流] 跳转到步骤 ${targetIndex + 1}: ${steps[targetIndex].description}`)
            currentIndex = targetIndex
            continue
          } else {
            console.warn(`[工作流] 目标步骤 ${step.targetStepId} 不存在，继续执行下一步`)
          }
        }

        currentIndex++
      }

      if (iterationCount >= maxIterations) {
        console.warn(`[工作流] 达到最大迭代次数 ${maxIterations}，可能存在无限循环`)
      }

      return { success: true, records: this.records }
    } catch (error) {
      const errorMessage = (error as Error).message
      const isAborted = errorMessage.startsWith('TASK_ABORTED:')
      
      return {
        success: false,
        records: this.records,
        error: isAborted ? errorMessage.replace('TASK_ABORTED:', '').trim() : errorMessage,
        aborted: isAborted
      }
    }
  }

  /**
   * 使用 observe 预先观察工作流中的所有可执行元素
   * 这是 Stagehand 推荐的模式，比逐个调用 act() 快 2-3 倍
   */
  private async observeWorkflow(steps: TestStep[]): Promise<any[]> {
    const actions: any[] = []
    
    for (const step of steps) {
      if (step.type === 'click' || step.type === 'fill' || step.type === 'hover') {
        try {
          // 使用 safeObserve 查找元素，不进行实际操作
          const observed = await this.safeObserve(
            step.description || `${step.type} action`,
            { page: this.context.page }
          )
          if (observed && observed.length > 0) {
            actions.push({
              stepId: step.id,
              actions: observed
            })
          }
        } catch (e) {
          // observe 失败不影响执行，后续会尝试 act
          console.log(`[观察] 步骤 ${step.id} 观察失败: ${(e as Error).message}`)
        }
      }
    }
    
    return actions
  }

  /**
   * 执行单个步骤并处理流程控制
   */
  private async executeStepWithFlow(
    step: TestStep,
    currentIndex: number,
    totalSteps: number
  ): Promise<{ success: boolean; error?: string }> {
    const logPrefix = `[步骤 ${currentIndex}/${totalSteps}]`
    this.onLog?.(`${logPrefix} 开始执行: ${step.type} - ${step.description}`)

    const record = await this.executeSingleStep(step)
    this.records.push(record)

    if (record.status === 'success') {
      this.onLog?.(`✅ ${step.description} 成功 (策略: ${record.strategy}, 耗时: ${(record.duration || 0) / 1000}s)`)

      // 根据步骤类型处理流程
      switch (step.type) {
        case 'condition':
          // 条件判断步骤：执行成功后执行 thenSteps
          return await this.executeConditionBranch(step, currentIndex, totalSteps)

        case 'conditionLoop':
          // 条件循环步骤：执行成功后执行 loopSteps，然后回到本步骤
          return await this.executeLoopBranch(step, currentIndex, totalSteps)

        default:
          // 普通步骤：继续执行后续
          return { success: true }
      }
    } else {
      this.onLog?.(`❌ ${step.description} 失败: ${record.error}`)
      // 执行失败，执行后续步骤（跳出当前分支）
      return { success: true }
    }
  }

  /**
   * 执行条件分支
   * 条件步骤执行成功后，执行 thenSteps
   */
  private async executeConditionBranch(
    step: TestStep,
    currentIndex: number,
    totalSteps: number
  ): Promise<{ success: boolean; error?: string }> {
    const thenSteps = step.thenSteps || []
    
    if (thenSteps.length === 0) {
      console.log(`[条件判断] 没有配置子步骤，继续执行后续`)
      return { success: true }
    }

    console.log(`[条件判断] 执行 ${thenSteps.length} 个子步骤`)
    
    for (let i = 0; i < thenSteps.length; i++) {
      const result = await this.executeStepWithFlow(
        thenSteps[i],
        currentIndex,
        totalSteps
      )
      if (!result.success) {
        return result
      }
    }
    
    return { success: true }
  }

  /**
   * 执行循环分支
   * 条件循环步骤执行成功后，循环执行 loopSteps，然后回到本步骤重新判断
   * 条件不满足或达到最大次数后，退出循环执行后续步骤
   */
  private async executeLoopBranch(
    step: TestStep,
    currentIndex: number,
    totalSteps: number
  ): Promise<{ success: boolean; error?: string }> {
    const loopSteps = step.loopSteps || []
    const maxIterations = step.maxIterations || 10
    const conditionStep = step.conditionStep
    
    if (loopSteps.length === 0) {
      console.log(`[条件循环] 没有配置循环体步骤，继续执行后续`)
      return { success: true }
    }

    console.log(`[条件循环] 开始执行，最大循环次数：${maxIterations}，循环体步骤数：${loopSteps.length}`)

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      console.log(`[条件循环] 第 ${iteration} 次迭代`)

      // 首先判断条件：执行条件步骤
      if (conditionStep) {
        const conditionRecord = await this.executeSingleStep(conditionStep)
        this.records.push(conditionRecord)

        if (conditionRecord.status !== 'success') {
          console.log(`[条件循环] 条件不满足，退出循环`)
          break
        }
        console.log(`[条件循环] 条件满足，执行循环体`)
      }

      // 执行循环体内的所有步骤
      for (let i = 0; i < loopSteps.length; i++) {
        const result = await this.executeStepWithFlow(
          loopSteps[i],
          currentIndex,
          totalSteps
        )
        if (!result.success) {
          return result
        }
      }

      // 等待页面稳定
      await this.waitForDomSettle(2000)
      
      console.log(`[条件循环] 第 ${iteration} 次循环体执行完成`)
    }

    console.log(`[条件循环] 循环结束，执行后续步骤`)
    return { success: true }
  }

  /**
   * 执行单个步骤
   */
  private async executeSingleStep(step: TestStep): Promise<StepExecutionRecord> {
    const record: StepExecutionRecord = {
      stepId: step.id,
      stepType: step.type,
      description: step.description,
      strategy: step.strategy || this.context.strategy,
      status: 'running',
      startTime: new Date().toISOString(),
    }

    try {
      // 非 goto 步骤等待页面稳定（优化：从8秒减少到3秒）
      if (step.type !== 'goto') {
        await this.waitForDomSettle(3000)
      }

      switch (step.type) {
        case 'goto':
          await this.executeGoto(step, record)
          break
        case 'click':
        case 'fill':
        case 'hover':
          await this.executeInteraction(step, record)
          break
        case 'wait':
          await this.executeWait(step, record)
          break
        case 'screenshot':
          await this.executeScreenshot(step, record)
          break
        case 'scroll':
          await this.executeScroll(step, record)
          break
        case 'clear':
          await this.executeClear(step, record)
          break
        case 'js':
          await this.executeJs(step, record)
          break
        case 'extract':
          await this.executeExtract(step, record)
          break
        case 'followGuide':
          await this.executeFollowGuide(step, record)
          break
        case 'assert':
          await this.executeAssert(step, record)
          break
        case 'condition':
          await this.executeConditionStep(step, record)
          break
        case 'conditionLoop':
          await this.executeConditionStep(step, record)
          break
        case 'gotoStep':
          // gotoStep 只是跳转标记，不需要执行具体操作
          record.status = 'success'
          console.log(`[节点跳转] 准备跳转到步骤 ID: ${step.targetStepId}`)
          break
        default:
          throw new Error(`不支持的步骤类型：${step.type}`)
      }

      record.endTime = new Date().toISOString()
      record.duration = this.calculateDuration(record)
    } catch (error) {
      record.status = 'failed'
      record.endTime = new Date().toISOString()
      record.duration = this.calculateDuration(record)
      record.error = (error as Error).message
    }

    return record
  }

  /**
   * 执行条件/循环步骤本身
   * 条件/循环步骤本身就是一个普通步骤，需要执行其操作
   * 执行成功 = 条件满足，执行失败 = 条件不满足
   */
  private async executeConditionStep(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { stagehand, page, strategy } = this.context
    const stepStrategy = step.strategy || strategy

    if (stepStrategy === 'selector' && step.selector) {
      // 精确选择器模式：查找元素是否存在
      const selectorStr = this.buildSelectorString(step.selector)
      if (!selectorStr) {
        throw new Error('条件步骤未提供有效的选择器')
      }

      const exists = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel)
        return el !== null && (el as HTMLElement).offsetParent !== null
      }, selectorStr)

      if (exists) {
        record.status = 'success'
        record.selectorUsed = step.selector
        console.log(`[条件步骤] 选择器 ${selectorStr} 找到可见元素，条件满足`)
      } else {
        record.status = 'failed'
        record.error = `选择器 ${selectorStr} 未找到可见元素，条件不满足`
        console.log(`[条件步骤] 选择器 ${selectorStr} 未找到可见元素，条件不满足`)
        return
      }
    } else {
      // AI 或自动模式：使用 safeObserve 检测元素是否存在
      try {
        const observed = await this.safeObserve(
          step.description || 'check if element exists',
          { page }
        )

        if (observed && observed.length > 0) {
          record.status = 'success'
          console.log(`[条件步骤] AI 检测到元素，条件满足`)
        } else {
          record.status = 'failed'
          record.error = 'AI 未检测到目标元素，条件不满足'
          console.log(`[条件步骤] AI 未检测到目标元素，条件不满足`)
          return
        }
      } catch (e) {
        record.status = 'failed'
        record.error = `条件检测失败: ${(e as Error).message}`
        console.log(`[条件步骤] 条件检测失败: ${(e as Error).message}`)
        return
      }
    }

    await this.takeScreenshot(step, record, 'condition')
  }

  /**
   * 构建选择器字符串
   */
  private buildSelectorString(selector: import('@/types').ElementSelector): string {
    if (selector.css) return selector.css
    if (selector.id) return `#${selector.id}`
    if (selector.className) return `.${selector.className.split(' ').join('.')}`
    if (selector.classPrefix) return `[class*="${selector.classPrefix}"]`
    if (selector.name) return `[name="${selector.name}"]`
    if (selector.testId) return `[data-testid="${selector.testId}"]`
    if (selector.xpath) return selector.xpath
    return ''
  }

  /**
   * 执行页面跳转
   */
  private async executeGoto(step: TestStep, record: StepExecutionRecord): Promise<void> {
    if (!step.value) throw new Error('Goto 步骤必须提供 URL')

    console.log(`[Goto] 开始导航到: ${step.value.substring(0, 80)}...`)

    await this.context.page.goto(step.value, {
      waitUntil: 'networkidle',
      timeout: 60000
    })

    console.log('[Goto] 页面网络请求已完成，开始等待DOM稳定...')
    await this.waitForDomSettle(10000)

    console.log('[Goto] 使用 Stagehand observe 确认页面就绪...')
    if (this.context.stagehand?.observe) {
      try {
        await this.safeObserve(
          'page loaded and ready for interaction',
          { page: this.context.page }
        )
        console.log('[Goto] Stagehand 确认页面已就绪')
      } catch (e) {
        console.warn('[Goto] Stagehand observe 失败，继续执行:', (e as Error).message)
      }
    }

    console.log(`[Goto] 导航完成，总耗时准备就绪`)
    record.status = 'success'
  }

  /**
   * 执行滚动操作
   */
  private async executeScroll(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { stagehand, page, strategy } = this.context
    const scrollValue = step.value || 'down'
    
    if (strategy === 'selector' && step.selector) {
      // 精确选择器模式：滚动到指定元素
      const selectorStr = this.buildSelectorString(step.selector)
      if (selectorStr) {
        const element = page.locator(selectorStr).first()
        await element.scrollIntoViewIfNeeded()
        console.log(`[滚动] 已滚动到元素：${selectorStr}`)
        record.status = 'success'
        return
      }
    }

    // AI 或自动模式：使用自然语言描述滚动
    try {
      let instruction = step.description
      if (scrollValue === 'up') {
        instruction = instruction || 'scroll up the page'
      } else if (scrollValue === 'down') {
        instruction = instruction || 'scroll down the page'
      } else if (scrollValue === 'top') {
        instruction = instruction || 'scroll to top of the page'
      } else if (scrollValue === 'bottom') {
        instruction = instruction || 'scroll to bottom of the page'
      }

      const result = await this.safeAct(instruction, { page })

      if (!result.success) {
        // 如果 AI 模式失败，回退到 JavaScript 滚动
        await page.evaluate((value: string) => {
          if (value === 'top') {
            window.scrollTo(0, 0)
          } else if (value === 'bottom') {
            window.scrollTo(0, document.body.scrollHeight)
          } else if (value === 'up') {
            window.scrollBy(0, -500)
          } else {
            window.scrollBy(0, 500)
          }
        }, scrollValue)
      }

      record.status = 'success'
      console.log(`[滚动] 执行完成：${instruction}`)
    } catch (e) {
      // 最终回退：使用 JavaScript 滚动
      await page.evaluate((value: string) => {
        if (value === 'top') {
          window.scrollTo(0, 0)
        } else if (value === 'bottom') {
          window.scrollTo(0, document.body.scrollHeight)
        } else if (value === 'up') {
          window.scrollBy(0, -500)
        } else {
          window.scrollBy(0, 500)
        }
      }, scrollValue)
      record.status = 'success'
      console.log(`[滚动] 使用 JS 回退完成`)
    }
  }

  /**
   * 执行清除操作（清除 cookies、localStorage 等）
   */
  private async executeClear(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { page } = this.context

    try {
      // 清除 cookies
      await page.context().clearCookies()
      
      // 清除 localStorage 和 sessionStorage
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
        
        // 清除 IndexedDB
        if (indexedDB.databases) {
          indexedDB.databases().then(dbs => {
            dbs.forEach(db => {
              if (db.name) indexedDB.deleteDatabase(db.name)
            })
          })
        }
      })

      record.status = 'success'
      console.log(`[清除] 已清除所有浏览器数据`)
    } catch (e) {
      throw new Error(`清除数据失败: ${(e as Error).message}`)
    }
  }

  /**
   * 执行跟随引导操作（用于处理引导式 UI）
   */
  private async executeFollowGuide(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { stagehand, page } = this.context
    
    try {
      // 查找引导元素（通常是高亮、tooltip、modal 等）
      const observed = await this.safeObserve(
        step.description || 'find guide elements like tooltips, highlights, or next buttons',
        { page }
      )

      if (observed && observed.length > 0) {
        // 执行第一个可用的引导动作
        for (const action of observed) {
          try {
            const result = await this.safeAct(action, { page })
            if (result.success) {
              record.status = 'success'
              console.log(`[引导] 成功执行引导动作`)
              await this.takeScreenshot(step, record, 'guide-success')
              return
            }
          } catch (e) {
            console.log(`[引导] 动作失败，尝试下一个: ${(e as Error).message}`)
          }
        }
      }

      // 如果没有找到引导元素，尝试点击"下一步"、"关闭"等常见按钮
      const commonButtons = ['next', 'close', 'got it', 'start', 'begin', 'ok', 'done']
      for (const buttonText of commonButtons) {
        try {
          const result = await this.safeAct(`click ${buttonText} button`, { page })
          if (result.success) {
            record.status = 'success'
            console.log(`[引导] 点击了 "${buttonText}" 按钮`)
            return
          }
        } catch {}
      }

      // 如果所有方法都失败，等待一段时间让引导自动消失
      await page.waitForTimeout(2000)
      record.status = 'success'
      console.log(`[引导] 等待引导自动消失`)
    } catch (e) {
      throw new Error(`跟随引导失败: ${(e as Error).message}`)
    }
  }

  /**
   * 执行断言验证
   */
  private async executeAssert(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { stagehand, page, strategy } = this.context

    if (!step.value) {
      throw new Error('Assert 步骤必须提供验证条件')
    }

    try {
      let assertResult = false

      if (strategy === 'selector' && step.selector) {
        // 选择器模式：验证元素存在或包含特定文本
        const selectorStr = this.buildSelectorString(step.selector)
        if (selectorStr) {
          const element = page.locator(selectorStr).first()
          const count = await element.count()
          
          if (count > 0) {
            // 验证文本内容（如果提供了）
            if (step.value && step.value !== 'exists') {
              const text = await element.textContent()
              assertResult = text?.includes(step.value) || false
              console.log(`[断言] 元素文本: "${text}", 包含 "${step.value}": ${assertResult}`)
            } else {
              assertResult = true
              console.log(`[断言] 元素存在: ${selectorStr}`)
            }
          } else {
            assertResult = false
            console.log(`[断言] 元素不存在: ${selectorStr}`)
          }
        }
      } else {
        // AI 模式：使用 safeObserve 验证条件
        const observed = await this.safeObserve(
          step.description || 'verify condition',
          { page }
        )

        if (observed && observed.length > 0) {
          assertResult = true
          console.log(`[断言] AI 验证通过: ${step.description}`)
        } else {
          assertResult = false
          console.log(`[断言] AI 验证失败: ${step.description}`)
        }
      }

      if (assertResult) {
        record.status = 'success'
        console.log(`✅ 断言通过: ${step.description}`)
      } else {
        record.status = 'failed'
        record.error = `断言失败: ${step.value}`
        console.log(`❌ 断言失败: ${step.value}`)
        throw new Error(`断言验证失败: ${step.value}`)
      }

      await this.takeScreenshot(step, record, 'assert')
    } catch (e) {
      if (record.status !== 'failed') {
        record.status = 'failed'
        record.error = (e as Error).message
      }
      throw e
    }
  }

  /**
   * 执行交互操作（click/fill/hover）
   * 支持循环模式：当 step.loop=true 时，会持续尝试直到成功或达到最大次数
   * 使用 observe + act 模式，比逐个调用 act() 快 2-3 倍
   */
  private async executeInteraction(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { stagehand, page, strategy, taskId } = this.context

    if (taskId && isTaskAborted(taskId)) {
      throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
    }

    const isLoopMode = step.loop === true
    const maxIterations = isLoopMode ? (step.maxLoopIterations || 10) : 1

    this.onLog?.(`[交互] ${isLoopMode ? '🔄 循环模式' : '单次模式'}，最大迭代: ${maxIterations}次`)

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (taskId && isTaskAborted(taskId)) {
        throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
      }

      if (isLoopMode) {
        this.onLog?.(`[交互] 第 ${iteration}/${maxIterations} 次迭代`)
      }

      let observedActions: any[] = []
      try {
        observedActions = await this.safeObserve(
          step.description || 'find interactive elements',
          { page }
        )
      } catch (e) {
        this.onLog?.(`[交互] 观察失败: ${(e as Error).message.substring(0, 100)}`)

        if (!isLoopMode) {
          console.log(`[交互] observe 失败，直接尝试 act: ${(e as Error).message}`)
        }
      }

      if (taskId && isTaskAborted(taskId)) {
        throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
      }

      let success = false

      if (observedActions && observedActions.length > 0) {
        this.onLog?.(`[交互] 观察到 ${observedActions.length} 个可执行动作`)

        for (const action of observedActions) {
          if (taskId && isTaskAborted(taskId)) {
            throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
          }

          try {
            const result = await this.safeAct(action, { page })
            if (result.success) {
              record.status = 'success'
              await this.takeScreenshot(step, record, 'success')
              this.onLog?.(`[交互] ✅ 成功 (第${iteration}次)`)
              return
            }
          } catch (e) {
            this.onLog?.(`[交互] 动作失败: ${(e as Error).message.substring(0, 100)}`)
          }
        }
      }

      this.onLog?.(`[交互] 使用直接 act 模式`)

      let instruction = step.description
      if (step.type === 'fill' && step.value) {
        instruction = `type "${step.value}" into ${step.description}`
      }

      try {
        const result = await this.safeAct(instruction, { page })

        if (result.success) {
          record.status = 'success'
          await this.takeScreenshot(step, record, 'success')
          this.onLog?.(`[交互] ✅ 直接act成功 (第${iteration}次)`)
          return
        }
      } catch (e) {
        this.onLog?.(`[交互] 直接act失败: ${(e as Error).message.substring(0, 100)}`)
      }

      if (!isLoopMode) {
        throw new Error('交互操作失败')
      }

      if (iteration < maxIterations) {
        const waitTime = Math.min(2000, step.maxWaitTime ? step.maxWaitTime / maxIterations : 1000)
        this.onLog?.(`[交互] 等待 ${waitTime}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    if (isLoopMode) {
      this.onLog?.(`[交互] ⚠️ 循环结束，未找到可点击元素（这是正常的，可能引导已完成）`)
      record.status = 'success'
      record.result = `循环执行${maxIterations}次后结束`
    } else {
      throw new Error('交互操作失败')
    }
  }

  /**
   * 执行等待
   */
  private async executeWait(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const waitMs = parseInt(step.value || '3000', 10)
    await this.context.page.waitForTimeout(waitMs)
    record.status = 'success'
  }

  /**
   * 执行截图
   */
  private async executeScreenshot(step: TestStep, record: StepExecutionRecord): Promise<void> {
    await this.takeScreenshot(step, record, 'screenshot')
    record.status = 'success'
  }

  /**
   * 执行 JavaScript
   * 支持选择器模式：如果有 selector，先定位元素再执行操作
   */
  private async executeJs(step: TestStep, record: StepExecutionRecord): Promise<void> {
    const { page } = this.context

    if (step.selector) {
      this.onLog?.(`[JS] 检测到选择器模式，使用选择器定位元素`)

      const selectorStr = this.buildSelectorString(step.selector)
      if (!selectorStr) {
        throw new Error('JS 步骤的选择器无效')
      }

      try {
        const element = page.locator(selectorStr).first()
        const count = await element.count()

        if (count === 0) {
          throw new Error(`未找到元素: ${selectorStr}`)
        }

        this.onLog?.(`[JS] 找到元素: ${selectorStr}，准备点击`)

        await element.click({
          timeout: 10000,
          force: true
        })

        record.result = `成功点击元素: ${selectorStr}`
        record.selectorUsed = step.selector
        record.status = 'success'
        this.onLog?.(`[JS] ✅ 点击成功`)
        return
      } catch (e) {
        this.onLog?.(`[JS] 选择器点击失败: ${(e as Error).message}`)
        throw e
      }
    }

    if (!step.value) {
      throw new Error('JS 步骤必须提供 JavaScript 代码或选择器')
    }

    this.onLog?.(`[JS] 执行 JavaScript 代码`)
    const result = await page.evaluate((code: string) => {
      try {
        return eval(code)
      } catch (e) {
        throw e
      }
    }, step.value)

    record.result = JSON.stringify(result)
    record.status = 'success'
    this.onLog?.(`[JS] ✅ 执行完成`)
  }

  /**
   * 执行数据提取
   */
  private async executeExtract(step: TestStep, record: StepExecutionRecord): Promise<void> {
    if (!step.value) {
      throw new Error('Extract 步骤必须提供提取指令')
    }

    const result = await this.context.stagehand.extract(step.value, { 
      page: this.context.page 
    })
    
    record.extractedData = JSON.stringify(result)
    record.status = 'success'
  }

  /**
   * 截图
   */
  private async takeScreenshot(
    step: TestStep, 
    record: StepExecutionRecord, 
    suffix: string
  ): Promise<void> {
    const screenshotName = `${this.context.testId}_${step.id}_${suffix}_${Date.now()}.png`
    const screenshotPath = path.join(this.context.screenshotDir, screenshotName)
    await this.context.page.screenshot({ path: screenshotPath, fullPage: true })
    record.screenshot = `/screenshots/${screenshotName}`
  }

  /**
   * 等待页面稳定
   */
  private async waitForDomSettle(timeout: number = 10000): Promise<void> {
    const { page, taskId } = this.context
    
    if (taskId && isTaskAborted(taskId)) {
      throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
    }
    
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 5000) })
    } catch {}

    if (taskId && isTaskAborted(taskId)) {
      throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    } catch {}

    if (taskId && isTaskAborted(taskId)) {
      throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
    }

    try {
      await page.waitForFunction(() => document.readyState === 'complete', {}, { timeout: Math.min(timeout, 3000) })
    } catch {}
    
    if (taskId && isTaskAborted(taskId)) {
      throw new Error(`TASK_ABORTED: ${getAbortReason(taskId) || '用户终止'}`)
    }
  }

  /**
   * 计算执行时长
   */
  private calculateDuration(record: StepExecutionRecord): number {
    if (record.endTime && record.startTime) {
      return new Date(record.endTime).getTime() - new Date(record.startTime).getTime()
    }
    return 0
  }
}

/**
 * 执行测试的便捷函数
 */
export async function executeWorkflow(
  stagehand: any,
  page: any,
  steps: TestStep[],
  testId: string,
  strategy: ExecutionStrategy = 'auto',
  onLog?: (message: string) => void,
  customScreenshotDir?: string,
  taskId?: string
): Promise<{
  success: boolean
  records: StepExecutionRecord[]
  error?: string
  aborted?: boolean
}> {
  const context: WorkflowContext = {
    stagehand,
    page,
    testId,
    strategy,
    screenshotDir: customScreenshotDir || PATHS.SCREENSHOTS,
    variables: new Map(),
    iterationCount: new Map(),
    taskId
  }

  const engine = new WorkflowEngine(context, onLog)
  return engine.execute(steps)
}
