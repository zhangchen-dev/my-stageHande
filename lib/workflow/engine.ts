import { Page } from 'playwright'
import { Stagehand } from '@browserbasehq/stagehand'
import {
  OperationType,
  WorkflowConfig,
  WorkflowNode,
  WorkflowContext,
  ExecutionResult,
} from './types'
import { NodeExecutorFactory } from './executors'
import fs from 'fs'
import path from 'path'

export interface EngineConfig {
  headless?: boolean
  screenshotDir?: string
  testId?: string
}

export class WorkflowEngine {
  private config: WorkflowConfig
  private nodeMap: Map<string, WorkflowNode> = new Map()
  private context: WorkflowContext | null = null
  private page: Page | null = null
  private stagehand: any = null
  private engineConfig: EngineConfig

  constructor(config: WorkflowConfig, engineConfig: EngineConfig = {}) {
    this.config = config
    this.engineConfig = engineConfig
    this.buildNodeMap()
  }

  private buildNodeMap(): void {
    this.nodeMap.clear()
    for (const node of this.config.nodes) {
      this.nodeMap.set(node.id, node)
    }
  }

  async initialize(): Promise<void> {
    const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || ''
    const baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1'

    if (!apiKey) {
      throw new Error('未配置 API Key！请在 .env 中设置 SILICONFLOW_API_KEY 或 OPENAI_API_KEY')
    }

    console.log(`[WorkflowEngine] API配置: baseURL=${baseURL}`)

    this.stagehand = new Stagehand({
      env: 'LOCAL',
      model: {
        modelName: 'gpt-4o',
        apiKey,
        baseURL,
      },
      cacheDir: path.join(process.cwd(), '.cache'),
      verbose: 1,
      domSettleTimeout: 5000,
      localBrowserLaunchOptions: {
        headless: this.engineConfig.headless ?? true,
        viewport: { width: 1920, height: 1080 },
      },
    })

    await this.stagehand.init()

    this.page = this.stagehand.context.pages()[0] as Page

    const screenshotDir = this.engineConfig.screenshotDir || path.join(process.cwd(), 'screenshots')
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true })
    }

    this.context = {
      page: this.page,
      stagehand: this.stagehand,
      variables: new Map(),
      logs: [],
      screenshotDir,
      testId: this.engineConfig.testId,
    }

    console.log('[WorkflowEngine] 引擎初始化完成')
  }

  async execute(): Promise<{
    success: boolean
    logs: Array<{ nodeId: string; timestamp: number; success: boolean; msg: string }>
    error?: string
  }> {
    if (!this.context) {
      throw new Error('引擎未初始化，请先调用 initialize()')
    }

    let currentNodeId = this.config.startNodeId
    const maxIterations = 1000
    let iterationCount = 0

    try {
      while (currentNodeId && iterationCount < maxIterations) {
        iterationCount++

        const node = this.nodeMap.get(currentNodeId)
        if (!node) {
          throw new Error(`节点不存在: ${currentNodeId}`)
        }

        console.log(`[WorkflowEngine] 执行节点 ${iterationCount}: ${node.id} (${node.type})`)

        const executor = NodeExecutorFactory.getExecutor(node.type)
        const result: ExecutionResult = await executor.execute(node, this.context)

        if (!result.success) {
          console.error(`[WorkflowEngine] 节点执行失败: ${node.id} - ${result.error}`)
          
          await this.takeErrorScreenshot(node.id, result.error)

          return {
            success: false,
            logs: this.context.logs,
            error: `节点 ${node.id} 执行失败: ${result.error}`,
          }
        }

        if (node.type === OperationType.CONDITION && result.nextNodeId) {
          currentNodeId = result.nextNodeId
        } else if (node.nextNodeId) {
          currentNodeId = node.nextNodeId
        } else {
          currentNodeId = this.getNextNodeById(currentNodeId) || ''
          if (!currentNodeId) {
            console.log('[WorkflowEngine] 工作流执行完成')
            break
          }
        }

        await this.waitForDomSettle()
      }

      if (iterationCount >= maxIterations) {
        console.warn(`[WorkflowEngine] 达到最大迭代次数 ${maxIterations}，可能存在无限循环`)
      }

      return {
        success: true,
        logs: this.context.logs,
      }
    } catch (error: any) {
      console.error(`[WorkflowEngine] 执行异常: ${error.message}`)
      
      return {
        success: false,
        logs: this.context?.logs || [],
        error: error.message,
      }
    }
  }

  private async waitForDomSettle(timeout: number = 1000): Promise<void> {
    if (!this.page) return
    
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout })
    } catch {}
    
    try {
      await this.page.waitForTimeout(500)
    } catch {}
  }

  private getNextNodeById(nodeId: string): string | null {
    const nodeIndex = this.config.nodes.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1 || nodeIndex >= this.config.nodes.length - 1) {
      return null
    }
    
    return this.config.nodes[nodeIndex + 1].id || null
  }

  private async takeErrorScreenshot(nodeId: string, error?: string): Promise<void> {
    if (!this.page || !this.context?.screenshotDir) return

    try {
      const timestamp = Date.now()
      const filename = `error_${nodeId}_${timestamp}.png`
      const filepath = path.join(this.context.screenshotDir, filename)
      
      await this.page.screenshot({
        path: filepath,
        fullPage: true,
      })

      console.log(`[WorkflowEngine] 错误截图已保存: ${filepath}`)
      
      if (error) {
        this.context.logs.push({
          nodeId,
          timestamp: Date.now(),
          success: false,
          msg: `错误截图已保存: ${filename}`,
        })
      }
    } catch (e) {
      console.warn('[WorkflowEngine] 保存错误截图失败:', e)
    }
  }

  getContext(): WorkflowContext | null {
    return this.context
  }

  getLogs(): Array<{ nodeId: string; timestamp: number; success: boolean; msg: string }> {
    return this.context?.logs || []
  }

  getVariables(): Map<string, any> {
    return this.context?.variables || new Map()
  }

  async cleanup(): Promise<void> {
    try {
      if (this.stagehand && typeof this.stagehand.close === 'function') {
        await this.stagehand.close()
      }
    } catch (e) {
      console.warn('[WorkflowEngine] 关闭 Stagehand 失败:', e)
    }

    try {
      if (this.page) {
        await this.page.context().close()
      }
    } catch (e) {
      console.warn('[WorkflowEngine] 关闭浏览器失败:', e)
    }

    this.page = null
    this.stagehand = null
    this.context = null

    console.log('[WorkflowEngine] 资源清理完成')
  }
}

export async function runWorkflow(
  config: WorkflowConfig,
  options: EngineConfig = {}
): Promise<{
  success: boolean
  logs: Array<{ nodeId: string; timestamp: number; success: boolean; msg: string }>
  error?: string
}> {
  const engine = new WorkflowEngine(config, options)
  
  try {
    await engine.initialize()
    const result = await engine.execute()
    return result
  } finally {
    await engine.cleanup()
  }
}
