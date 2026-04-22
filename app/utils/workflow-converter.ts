import { OperationType, ExecuteStrategy, WorkflowConfig, WorkflowNode } from '@/lib/workflow/types'
import { TestStep, ExecutionStrategy } from '@/types'

export function convertWorkflowConfigToSteps(config: WorkflowConfig): TestStep[] {
  if (!config || !config.nodes || config.nodes.length === 0) {
    return []
  }

  const steps: TestStep[] = []
  let currentId = config.startNodeId
  const visited = new Set<string>()
  const nodeIdToStepId = new Map<string, string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const node = config.nodes.find(n => n.id === currentId)
    if (!node) break

    const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    nodeIdToStepId.set(node.id, stepId)

    const step = convertNodeToStep(node, stepId)
    steps.push(step)

    if (node.type === OperationType.CONDITION) {
      break
    }

    currentId = node.nextNodeId || ''
  }

  return steps
}

function convertNodeToStep(node: WorkflowNode, stepId: string): TestStep {
  const baseStep: TestStep = {
    id: stepId,
    type: 'click',
    description: node.name,
    strategy: (node.strategy?.toLowerCase() || 'auto') as ExecutionStrategy,
  }

  switch (node.type) {
    case OperationType.OPEN_PAGE:
      return {
        ...baseStep,
        type: 'goto',
        value: node.params?.url || '',
        description: node.name || '打开页面',
      }

    case OperationType.CLICK:
      return {
        ...baseStep,
        type: 'click',
        description: node.name || `点击元素${node.params?.aiDescription ? `: ${node.params.aiDescription}` : ''}${node.params?.selector ? ` (${node.params.selector})` : ''}`,
        selector: node.params?.selector ? { css: node.params.selector } : undefined,
        loop: node.params?.loop || false,
        maxLoopIterations: node.params?.maxLoopIterations || 10,
      }

    case OperationType.FORM_FILL:
      return {
        ...baseStep,
        type: 'fill',
        description: node.name || '填写表单',
        fields: node.params?.fields || [],
        value: node.params?.value || '',
      }

    case OperationType.SCROLL:
      return {
        ...baseStep,
        type: 'scroll',
        description: node.name || '滚动页面',
        value: node.params?.direction || 'down',
      }

    case OperationType.HOVER:
      return {
        ...baseStep,
        type: 'hover',
        description: node.name || '悬停元素',
        selector: node.params?.selector ? { css: node.params.selector } : undefined,
      }

    case OperationType.WAIT:
      return {
        ...baseStep,
        type: 'wait',
        description: node.name || '等待',
        value: String(node.params?.duration || 3000),
      }

    case OperationType.SCREENSHOT:
      return {
        ...baseStep,
        type: 'screenshot',
        description: node.name || '截图',
        value: node.params?.filename || `screenshot-${Date.now()}.png`,
      }

    case OperationType.SCRIPT_EXEC:
      if (node.params?.selector) {
        return {
          ...baseStep,
          type: 'js',
          description: node.name || '执行脚本',
          value: node.params?.script || '',
          selector: { css: node.params.selector },
          strategy: 'selector',
        }
      }
      return {
        ...baseStep,
        type: 'js',
        description: node.name || '执行脚本',
        value: node.params?.script || '',
      }

    case OperationType.AI_TASK:
      return {
        ...baseStep,
        type: 'click',
        description: node.name || 'AI 任务',
        strategy: 'ai',
      }

    case OperationType.CONDITION:
      return {
        ...baseStep,
        type: 'condition',
        description: node.name || '条件判断',
        condition: node.params?.condition || 'EXIST',
        value: node.params?.value || '',
      }

    default:
      return {
        ...baseStep,
        type: 'click',
        description: node.name || '未知操作',
      }
  }
}
