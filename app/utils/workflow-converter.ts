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

  if (!workflowConfig.nodes || workflowConfig.nodes.length === 0) {
    console.warn('[convertWorkflowConfigToSteps] 工作流配置为空')
    return steps
  }

  // 确保 startNodeId 有效
  let currentNodeId = workflowConfig.startNodeId
  if (!currentNodeId || !workflowConfig.nodes.find(n => n.id === currentNodeId)) {
    currentNodeId = workflowConfig.nodes[0].id
    console.log('[convertWorkflowConfigToSteps] 使用第一个节点作为起始节点:', currentNodeId)
  }

  const nodeMap = new Map(workflowConfig.nodes.map((n) => [n.id, n]))
  const visitedNodes = new Set<string>()

  while (currentNodeId && !visitedNodes.has(currentNodeId)) {
    visitedNodes.add(currentNodeId)
    const node = nodeMap.get(currentNodeId)
    if (!node) {
      console.warn(`[convertWorkflowConfigToSteps] 未找到节点: ${currentNodeId}`)
      break
    }
    
    let stepType = 'script'
    let stepData: any = {}
    let description = ''
    
    switch (node.type) {
      case 'OPEN_PAGE':
        stepType = 'goto'
        stepData = { value: node.params?.url || '' }
        description = `打开页面 ${node.params?.url || '（未指定URL）'}`
        break
      case 'CLICK':
        stepType = 'click'
        stepData = {
          selector: node.params?.selector ? { css: node.params.selector } : undefined,
          description: node.params?.aiDescription || undefined,
        }
        description = `点击元素${node.params?.aiDescription ? `: ${node.params.aiDescription}` : ''}${node.params?.selector ? ` (${node.params.selector})` : ''}`
        break
      case 'FORM_FILL':
        stepType = 'fill'
        stepData = { fields: node.params?.fields || [] }
        description = `填写表单 (${node.params?.fields?.length || 0} 个字段)`
        break
      case 'SCROLL':
        stepType = 'scroll'
        stepData = { direction: node.params?.direction || 'down', amount: node.params?.amount || 500 }
        description = `滚动页面 (${node.params?.direction || 'down'} ${node.params?.amount || 500}px)`
        break
      case 'HOVER':
        stepType = 'hover'
        stepData = {
          selector: node.params?.selector ? { css: node.params.selector } : undefined,
          description: node.params?.aiDescription || undefined,
        }
        description = `悬停元素${node.params?.aiDescription ? `: ${node.params.aiDescription}` : ''}${node.params?.selector ? ` (${node.params.selector})` : ''}`
        break
      case 'SCRIPT_EXEC':
        stepType = 'script'
        stepData = { script: node.params?.script || '' }
        description = `执行脚本`
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
        description = `条件判断: ${node.params?.checkType || '未知条件'}`
        break
      case 'SCREENSHOT':
        stepType = 'screenshot'
        stepData = {
          filename: node.params?.filename || `screenshot-${Date.now()}.png`,
          screenshotType: node.params?.screenshotType || 'fullpage',
          selector: node.params?.selector,
        }
        description = `页面截取`
        break
      case 'AI_TASK':
        stepType = 'ai_task'
        stepData = {
          taskDescription: node.params?.taskDescription || '',
          timeout: node.params?.timeout || 60,
        }
        description = `AI任务: ${node.params?.taskDescription || '未指定任务'}`
        break
      default:
        stepType = 'script'
        stepData = { script: `// Unknown node type: ${node.type}` }
        description = `未知类型: ${node.type}`
    }
    
    steps.push({
      id: node.id,  // 添加节点ID用于追踪
      type: stepType,
      ...stepData,
      strategy: node.strategy?.toLowerCase() || 'auto',
      description,  // ✅ 添加描述信息
    })
    
    if (node.type === 'CONDITION') {
      currentNodeId = ''
    } else {
      currentNodeId = node.nextNodeId || ''
    }
  }
  
  return steps
}
