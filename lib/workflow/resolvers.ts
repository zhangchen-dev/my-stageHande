import { Page } from 'playwright'
import { ExecuteStrategy, WorkflowContext } from './types'

export interface ElementResolveResult {
  element?: any
  success: boolean
  error?: string
  strategyUsed: ExecuteStrategy
}

export class ElementResolver {
  async resolve(
    context: WorkflowContext,
    strategy: ExecuteStrategy,
    params: Record<string, any>
  ): Promise<ElementResolveResult> {
    switch (strategy) {
      case ExecuteStrategy.AUTO:
        return await this.resolveAuto(context, params)
      case ExecuteStrategy.AI:
        return await this.resolveAI(context, params)
      case ExecuteStrategy.SELECTOR:
        return await this.resolveSelector(context, params)
      default:
        return {
          success: false,
          error: `不支持的执行策略: ${strategy}`,
          strategyUsed: strategy,
        }
    }
  }

  private async resolveAuto(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<ElementResolveResult> {
    if (params.selector) {
      const selectorResult = await this.resolveSelector(context, params)
      if (selectorResult.success) {
        return selectorResult
      }
    }

    if (params.aiDescription || params.prompt) {
      return await this.resolveAI(context, params)
    }

    return {
      success: false,
      error: 'AUTO 策略：未提供 selector 或 aiDescription',
      strategyUsed: ExecuteStrategy.AUTO,
    }
  }

  private async resolveAI(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<ElementResolveResult> {
    try {
      const instruction = params.aiDescription || params.prompt || ''
      
      if (!instruction) {
        return {
          success: false,
          error: 'AI 策略：未提供描述信息',
          strategyUsed: ExecuteStrategy.AI,
        }
      }

      if (params.action) {
        const result = await context.stagehand.act({
          action: `${params.action} ${instruction}`,
          page: context.page,
        })

        if (result && result.success) {
          return {
            success: true,
            strategyUsed: ExecuteStrategy.AI,
          }
        }
      } else {
        const observed = await context.stagehand.observe({
          instruction,
          page: context.page,
        })

        if (observed && observed.length > 0) {
          return {
            element: observed[0],
            success: true,
            strategyUsed: ExecuteStrategy.AI,
          }
        }
      }

      return {
        success: false,
        error: `AI 未找到匹配元素: ${instruction}`,
        strategyUsed: ExecuteStrategy.AI,
      }
    } catch (error: any) {
      return {
        success: false,
        error: `AI 解析失败: ${error.message}`,
        strategyUsed: ExecuteStrategy.AI,
      }
    }
  }

  private async resolveSelector(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<ElementResolveResult> {
    try {
      const selector = params.selector
      
      if (!selector) {
        return {
          success: false,
          error: 'SELECTOR 策略：未提供选择器',
          strategyUsed: ExecuteStrategy.SELECTOR,
        }
      }

      const element = await context.page.$(selector)
      
      if (element) {
        const isVisible = await element.isVisible()
        if (isVisible) {
          return {
            element,
            success: true,
            strategyUsed: ExecuteStrategy.SELECTOR,
          }
        }
        
        return {
          success: false,
          error: `元素存在但不可见: ${selector}`,
          strategyUsed: ExecuteStrategy.SELECTOR,
        }
      }

      return {
        success: false,
        error: `未找到元素: ${selector}`,
        strategyUsed: ExecuteStrategy.SELECTOR,
      }
    } catch (error: any) {
      return {
        success: false,
        error: `选择器解析失败: ${error.message}`,
        strategyUsed: ExecuteStrategy.SELECTOR,
      }
    }
  }

  async checkElementExists(
    context: WorkflowContext,
    strategy: ExecuteStrategy,
    params: Record<string, any>
  ): Promise<boolean> {
    const result = await this.resolve(context, strategy, params)
    return result.success
  }
}
