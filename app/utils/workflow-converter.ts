export interface WorkflowNodeConfig {
  id: string
  type: string
  strategy?: string
  params?: any
  nextNodeId?: string
  conditionTrueNodeId?: string
  conditionFalseNodeId?: string
}

export interface WorkflowConfig {
  startNodeId: string
  nodes: WorkflowNodeConfig[]
}

export function convertWorkflowConfigToSteps(workflowConfig: WorkflowConfig): any[] {
  const steps: any[] = []
  let currentNodeId = workflowConfig.startNodeId
  const nodeMap = new Map(workflowConfig.nodes.map((n) => [n.id, n]))
  
  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId)
    if (!node) break
    
    let stepType = 'script'
    let stepData: any = {}
    
    switch (node.type) {
      case 'OPEN_PAGE':
        stepType = 'goto'
        stepData = { url: node.params?.url || '' }
        break
      case 'CLICK':
        stepType = 'click'
        stepData = {
          selector: node.params?.selector ? { css: node.params.selector } : undefined,
          description: node.params?.aiDescription || undefined,
        }
        break
      case 'FORM_FILL':
        stepType = 'fill'
        stepData = { fields: node.params?.fields || [] }
        break
      case 'SCROLL':
        stepType = 'scroll'
        stepData = { direction: node.params?.direction || 'down', amount: node.params?.amount || 500 }
        break
      case 'HOVER':
        stepType = 'hover'
        stepData = {
          selector: node.params?.selector ? { css: node.params.selector } : undefined,
          description: node.params?.aiDescription || undefined,
        }
        break
      case 'SCRIPT_EXEC':
        stepType = 'script'
        stepData = { script: node.params?.script || '' }
        break
      case 'CONDITION':
        stepType = 'condition'
        stepData = {
          checkType: node.params?.checkType,
          selector: node.params?.selector,
          value: node.params?.value,
          varName: node.params?.varName,
          conditionTrueNodeId: node.conditionTrueNodeId,
          conditionFalseNodeId: node.conditionFalseNodeId,
        }
        break
      case 'SCREENSHOT':
        stepType = 'screenshot'
        stepData = {
          filename: node.params?.filename || `screenshot-${Date.now()}.png`,
          screenshotType: node.params?.screenshotType || 'fullpage',
          selector: node.params?.selector,
        }
        break
      case 'AI_TASK':
        stepType = 'ai_task'
        stepData = {
          taskDescription: node.params?.taskDescription || '',
          timeout: node.params?.timeout || 60,
        }
        break
      default:
        stepType = 'script'
        stepData = { script: `// Unknown node type: ${node.type}` }
    }
    
    steps.push({
      type: stepType,
      ...stepData,
      strategy: node.strategy?.toLowerCase() || 'auto',
    })
    
    if (node.type === 'CONDITION') {
      currentNodeId = ''
    } else {
      currentNodeId = node.nextNodeId || ''
    }
  }
  
  return steps
}
