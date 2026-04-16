import { Page } from 'playwright'
import { OperationType, WorkflowNode, WorkflowContext, ExecutionResult } from './types'
import { ElementResolver } from './resolvers'

export interface NodeExecutor {
  execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult>
}

export class ConditionExecutor implements NodeExecutor {
  private elementResolver = new ElementResolver()

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    const { params } = node
    const checkType = params.checkType

    try {
      let conditionResult: boolean

      switch (checkType) {
        case 'EXIST':
          conditionResult = await this.checkExist(context, node)
          break
        case 'GT':
          conditionResult = await this.checkGreaterThan(context, params)
          break
        case 'LT':
          conditionResult = await this.checkLessThan(context, params)
          break
        case 'EQ':
          conditionResult = await this.checkEquals(context, params)
          break
        default:
          return {
            success: false,
            error: `不支持的条件类型: ${checkType}`,
          }
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: `条件判断 ${checkType} 结果: ${conditionResult}`,
      })

      return {
        success: true,
        data: conditionResult,
        nextNodeId: conditionResult ? node.conditionTrueNodeId : node.conditionFalseNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `条件判断失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }

  private async checkExist(
    context: WorkflowContext,
    node: WorkflowNode
  ): Promise<boolean> {
    if (node.params.selector) {
      const element = await context.page.$(node.params.selector)
      if (element) {
        return await element.isVisible()
      }
      return false
    }

    if (node.params.aiDescription) {
      const result = await this.elementResolver.resolve(
        context,
        node.strategy,
        node.params
      )
      return result.success
    }

    throw new Error('EXIST 条件需要提供 selector 或 aiDescription')
  }

  private async checkGreaterThan(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<boolean> {
    const varName = params.varName
    const value = params.value
    
    if (!varName) {
      throw new Error('GT 条件需要提供 varName')
    }

    const variableValue = context.variables.get(varName) || 0
    return Number(variableValue) > Number(value)
  }

  private async checkLessThan(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<boolean> {
    const varName = params.varName
    const value = params.value
    
    if (!varName) {
      throw new Error('LT 条件需要提供 varName')
    }

    const variableValue = context.variables.get(varName) || 0
    return Number(variableValue) < Number(value)
  }

  private async checkEquals(
    context: WorkflowContext,
    params: Record<string, any>
  ): Promise<boolean> {
    const varName = params.varName
    const value = params.value
    
    if (!varName) {
      throw new Error('EQ 条件需要提供 varName')
    }

    const variableValue = context.variables.get(varName)
    return variableValue === value
  }
}

export class ClickExecutor implements NodeExecutor {
  private elementResolver = new ElementResolver()

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const resolveResult = await this.elementResolver.resolve(
        context,
        node.strategy,
        node.params
      )

      if (!resolveResult.success) {
        context.logs.push({
          nodeId: node.id,
          timestamp: Date.now(),
          success: false,
          msg: `元素定位失败: ${resolveResult.error}`,
        })
        
        return {
          success: false,
          error: resolveResult.error,
        }
      }

      if (resolveResult.element) {
        await resolveResult.element.click()
      } else {
        if (node.params.selector) {
          await context.page.click(node.params.selector)
        } else if (node.params.aiDescription) {
          await context.stagehand.act({
            action: `click ${node.params.aiDescription}`,
            page: context.page,
          })
        }
      }

      if (node.params.incrementVar) {
        const currentVal = context.variables.get(node.params.incrementVar) || 0
        context.variables.set(node.params.incrementVar, currentVal + 1)
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: '点击操作成功',
      })

      return {
        success: true,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `点击失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class OpenPageExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const url = node.params.url
      
      if (!url) {
        return {
          success: false,
          error: 'OPEN_PAGE 需要提供 URL',
        }
      }

      await context.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      await context.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: `页面打开成功: ${url}`,
      })

      return {
        success: true,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `打开页面失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class FormFillExecutor implements NodeExecutor {
  private elementResolver = new ElementResolver()

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const { selector, value, fields } = node.params

      if (fields && Array.isArray(fields)) {
        for (const field of fields) {
          const fieldResolve = await this.elementResolver.resolve(
            context,
            node.strategy,
            { selector: field.selector, aiDescription: field.aiDescription }
          )

          if (fieldResolve.success && fieldResolve.element) {
            await fieldResolve.element.fill(field.value)
          } else if (field.selector) {
            await context.page.fill(field.selector, field.value)
          }
        }
      } else if (selector && value) {
        const resolveResult = await this.elementResolver.resolve(
          context,
          node.strategy,
          node.params
        )

        if (resolveResult.success && resolveResult.element) {
          await resolveResult.element.fill(value)
        } else if (selector) {
          await context.page.fill(selector, value)
        }
      } else {
        return {
          success: false,
          error: 'FORM_FILL 需要提供 fields 或 selector + value',
        }
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: '表单填写成功',
      })

      return {
        success: true,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `表单填写失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class ScrollExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const direction = node.params.direction || 'down'
      const amount = node.params.amount || 500
      
      switch (direction) {
        case 'up':
          await context.page.evaluate((amt: number) => {
            window.scrollBy(0, -amt)
          }, amount)
          break
        case 'down':
          await context.page.evaluate((amt: number) => {
            window.scrollBy(0, amt)
          }, amount)
          break
        case 'top':
          await context.page.evaluate(() => {
            window.scrollTo(0, 0)
          })
          break
        case 'bottom':
          await context.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight)
          })
          break
        default:
          await context.page.evaluate((amt: number) => {
            window.scrollBy(0, amt)
          }, amount)
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: `滚动操作成功: ${direction} ${amount}px`,
      })

      return {
        success: true,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `滚动失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class NodeSelectExecutor implements NodeExecutor {
  private elementResolver = new ElementResolver()

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const resolveResult = await this.elementResolver.resolve(
        context,
        node.strategy,
        node.params
      )

      if (!resolveResult.success) {
        return {
          success: false,
          error: resolveResult.error,
        }
      }

      if (resolveResult.element && node.params.storeAs) {
        context.variables.set(node.params.storeAs, resolveResult.element)
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: `节点选择成功`,
      })

      return {
        success: true,
        data: resolveResult.element,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `节点选择失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class ScriptExecExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const script = node.params.script
      
      if (!script) {
        return {
          success: false,
          error: 'SCRIPT_EXEC 需要提供脚本代码',
        }
      }

      const result = await context.page.evaluate((code: string) => {
        try {
          return eval(code)
        } catch (e) {
          throw e
        }
      }, script)

      if (node.params.storeAs) {
        context.variables.set(node.params.storeAs, result)
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: `脚本执行成功`,
      })

      return {
        success: true,
        data: result,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `脚本执行失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class HoverExecutor implements NodeExecutor {
  private elementResolver = new ElementResolver()

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<ExecutionResult> {
    try {
      const resolveResult = await this.elementResolver.resolve(
        context,
        node.strategy,
        node.params
      )

      if (!resolveResult.success) {
        return {
          success: false,
          error: resolveResult.error,
        }
      }

      if (resolveResult.element) {
        await resolveResult.element.hover()
      } else if (node.params.selector) {
        await context.page.hover(node.params.selector)
      }

      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: true,
        msg: '悬停操作成功',
      })

      return {
        success: true,
        nextNodeId: node.nextNodeId,
      }
    } catch (error: any) {
      context.logs.push({
        nodeId: node.id,
        timestamp: Date.now(),
        success: false,
        msg: `悬停失败: ${error.message}`,
      })
      
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

export class NodeExecutorFactory {
  static getExecutor(operationType: OperationType): NodeExecutor {
    switch (operationType) {
      case OperationType.CONDITION:
        return new ConditionExecutor()
      case OperationType.CLICK:
        return new ClickExecutor()
      case OperationType.OPEN_PAGE:
        return new OpenPageExecutor()
      case OperationType.FORM_FILL:
        return new FormFillExecutor()
      case OperationType.SCROLL:
        return new ScrollExecutor()
      case OperationType.NODE_SELECT:
        return new NodeSelectExecutor()
      case OperationType.SCRIPT_EXEC:
        return new ScriptExecExecutor()
      case OperationType.HOVER:
        return new HoverExecutor()
      default:
        throw new Error(`不支持的操作类型: ${operationType}`)
    }
  }
}
