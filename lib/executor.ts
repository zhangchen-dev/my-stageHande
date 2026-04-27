/**
 * @file executor.ts
 * @description 测试执行器主入口 - 协调测试流程的执行和管理
 * @module 测试执行引擎
 * 
 * 职责：
 * - 提供统一的测试执行接口 executeTest()
 * - 调用工作流引擎执行测试步骤
 * - 管理执行记录和结果
 * - 处理任务中止逻辑
 * 
 * 执行流程：
 * 1. 接收 TestStep[] 数组
 * 2. 调用 executor/workflow-engine.ts 中的 executeWorkflow
 * 3. 返回执行结果和记录
 * 
 * 依赖：
 * - ./executor/workflow-engine (工作流引擎)
 * - ./task-manager (任务管理器)
 * 
 * 注意：
 * - 这是实际使用的执行引擎入口
 * - lib/workflow/ 目录中的代码仅用于类型定义，不参与执行
 */

import { TestStep, ExecutionStrategy, StepExecutionRecord } from '@/types'
import { executeWorkflow } from './executor/workflow-engine'
import { isTaskAborted } from './task-manager'

export { executeWorkflow }
export { toExecutionRecord } from './executor/step-executor'

/**
 * 执行测试任务
 * 
 * @param stagehand - Stagehand 实例
 * @param page - Playwright 页面对象
 * @param steps - 测试步骤数组
 * @param testId - 测试 ID
 * @param strategy - 执行策略（默认 auto）
 * @param onLog - 日志回调函数
 * @param customScreenshotDir - 自定义截图目录
 * @param taskId - 任务 ID
 * @param stepInterval - 步骤间隔时间（毫秒）
 * @returns 执行结果，包含成功状态、执行记录和错误信息
 */
export async function executeTest(
  stagehand: any,
  page: any,
  steps: TestStep[],
  testId: string,
  strategy: ExecutionStrategy = 'auto',
  onLog?: (message: string) => void,
  customScreenshotDir?: string,
  taskId?: string,
  stepInterval?: number
): Promise<{
  success: boolean
  records: StepExecutionRecord[]
  error?: string
  aborted?: boolean
}> {
  return executeWorkflow(stagehand, page, steps, testId, strategy, onLog, customScreenshotDir, taskId, stepInterval)
}
