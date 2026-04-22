import { TestStep, ExecutionStrategy, StepExecutionRecord } from '@/types'
import { executeWorkflow } from './executor/workflow-engine'
import { isTaskAborted } from './task-manager'

export { executeWorkflow }
export { toExecutionRecord } from './executor/step-executor'

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
