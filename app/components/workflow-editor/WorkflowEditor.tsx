'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Layout, Button, Space, Card, Typography, Tag, message, Modal, Tooltip, Spin, Alert, Badge, Form, Input } from 'antd'
import {
  SaveOutlined,
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { WorkflowConfig, WorkflowNode, OperationType, ExecuteStrategy } from '@/lib/workflow/types'
import NodeConfigPanel from '../node-config/NodeConfigPanel'
import WorkflowCanvas from '../workflow-canvas/WorkflowCanvas'

const { Header, Content } = Layout
const { Title } = Typography

export default function WorkflowEditor() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const taskId = searchParams.get('taskId')

  const [config, setConfig] = useState<WorkflowConfig>({
    startNodeId: '',
    nodes: [],
  })
  const [originalConfig, setOriginalConfig] = useState<WorkflowConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [showTaskNameModal, setShowTaskNameModal] = useState(false)
  const [taskName, setTaskName] = useState('未命名工作流')
  const [taskForm] = Form.useForm()

  useEffect(() => {
    if (taskId) {
      loadWorkflow(taskId)
    } else {
      createNewWorkflow()
    }
  }, [taskId])

  useEffect(() => {
    if (originalConfig && config.nodes.length > 0) {
      const isChanged = JSON.stringify(originalConfig) !== JSON.stringify(config)
      setHasUnsavedChanges(isChanged)
      if (isChanged) {
        setIsSaved(false)
      }
    }
  }, [config, originalConfig])

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StagehandTestDB', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const loadWorkflow = async (id: string) => {
    setIsLoading(true)
    try {
      const db = await openDB()
      const store = db.transaction('tasks', 'readonly').objectStore('tasks')
      const request = store.get(id)

      request.onsuccess = () => {
        const taskData = request.result as any
        if (taskData && taskData.workflowConfig) {
          setConfig(taskData.workflowConfig)
          setOriginalConfig(taskData.workflowConfig)
          setTaskName(taskData.name || '未命名工作流')
        } else if (taskData && taskData.steps) {
          const convertedConfig = convertLegacyStepsToWorkflow(taskData.steps)
          setConfig(convertedConfig)
          setOriginalConfig(convertedConfig)
          setTaskName(taskData.name || '未命名工作流')
        } else {
          message.error('任务数据不存在或格式错误')
          router.push('/')
        }
      }

      request.onerror = () => {
        message.error('加载失败')
        router.push('/')
      }
    } catch (error) {
      console.error('加载工作流失败:', error)
      message.error('加载失败')
      router.push('/')
    } finally {
      setIsLoading(false)
    }
  }

  const createNewWorkflow = () => {
    const startNodeId = `node_${Date.now()}`
    const newConfig: WorkflowConfig = {
      startNodeId: startNodeId,
      nodes: [
        {
          id: startNodeId,
          name: '开始节点',
          type: OperationType.OPEN_PAGE,
          strategy: ExecuteStrategy.AUTO,
          params: { url: '' },
          nextNodeId: '',
        },
      ],
    }
    
    console.log('[createNewWorkflow] 创建新工作流:', { startNodeId, nodes: newConfig.nodes })
    setConfig(newConfig)
    setOriginalConfig(null)
    setTaskName('新工作流')
    setShowTaskNameModal(true)
    setIsLoading(false)
  }

  const convertLegacyStepsToWorkflow = (steps: any[]): WorkflowConfig => {
    let nodeIdCounter = 1
    const nodes: WorkflowNode[] = []
    let prevNodeId: string | null = null

    steps.forEach((step, index) => {
      const nodeId = `node_${nodeIdCounter++}`
      
      let nodeType: OperationType
      switch (step.type) {
        case 'goto':
          nodeType = OperationType.OPEN_PAGE
          break
        case 'click':
          nodeType = OperationType.CLICK
          break
        case 'fill':
          nodeType = OperationType.FORM_FILL
          break
        case 'scroll':
          nodeType = OperationType.SCROLL
          break
        case 'hover':
          nodeType = OperationType.HOVER
          break
        default:
          nodeType = OperationType.SCRIPT_EXEC
      }

      const node: WorkflowNode = {
        id: nodeId,
        name: `${getTypeLabel(nodeType)} #${nodeIdCounter - 1}`,
        type: nodeType,
        strategy: (step.strategy?.toUpperCase() as ExecuteStrategy) || ExecuteStrategy.AUTO,
        params: {
          ...(step.selector ? { selector: step.selector.css || step.selector.id } : {}),
          ...(step.value ? { value: step.value } : {}),
          ...(step.description ? { description: step.description } : {}),
        },
        nextNodeId: index < steps.length - 1 ? `node_${nodeIdCounter}` : '',
      }

      if (prevNodeId) {
        const prevNode = nodes.find(n => n.id === prevNodeId)
        if (prevNode) {
          prevNode.nextNodeId = nodeId
        }
      }

      nodes.push(node)
      prevNodeId = nodeId
    })

    return {
      startNodeId: nodes[0]?.id || '',
      nodes,
    }
  }

  const saveWorkflow = async () => {
    setIsSaving(true)
    try {
      const workflowId = taskId || `workflow_${Date.now()}`
      
      const taskData = {
        id: workflowId,
        name: taskName,
        type: 'workflow',
        workflowConfig: config,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      console.log('[saveWorkflow] 保存工作流:', { 
        id: workflowId, 
        name: taskName, 
        nodesCount: config.nodes.length,
      })

      const db = await openDB()
      const store = db.transaction('tasks', 'readwrite').objectStore('tasks')
      const request = store.put(taskData)

      request.onsuccess = () => {
        setOriginalConfig({ ...config })
        setHasUnsavedChanges(false)
        setIsSaved(true)
        
        message.success({
          content: `✓ 工作流已保存 (${config.nodes.length} 节点)`,
          icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
        })

        setTimeout(() => setIsSaved(false), 3000)

        if (!taskId) {
          const params = new URLSearchParams()
          params.set('taskId', workflowId)
          router.replace(`/workflow?${params.toString()}`)
        }
      }

      request.onerror = () => {
        message.error('保存失败')
      }
    } catch (error) {
      console.error('保存工作流失败:', error)
      message.error('保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const addNode = (type: OperationType, afterNodeId?: string) => {
    const newNodeId = `node_${Date.now()}`
    const nodeIndex = config.nodes.length + 1
    const newNode: WorkflowNode = {
      id: newNodeId,
      name: `${getTypeLabel(type)} #${nodeIndex}`,
      type,
      strategy: ExecuteStrategy.AUTO,
      params: getDefaultParams(type),
      nextNodeId: '',
    }

    const updatedNodes = [...config.nodes]

    if (afterNodeId) {
      const afterIndex = updatedNodes.findIndex(n => n.id === afterNodeId)
      if (afterIndex !== -1) {
        const oldNextNodeId = updatedNodes[afterIndex].nextNodeId
        updatedNodes[afterIndex].nextNodeId = newNodeId
        newNode.nextNodeId = oldNextNodeId
        updatedNodes.splice(afterIndex + 1, 0, newNode)
      } else {
        updatedNodes.push(newNode)
      }
    } else {
      if (updatedNodes.length > 0) {
        const lastNode = updatedNodes[updatedNodes.length - 1]
        lastNode.nextNodeId = newNodeId
      }
      updatedNodes.push(newNode)
    }

    setConfig({
      ...config,
      nodes: updatedNodes,
    })

    setSelectedNode(newNodeId)
    message.success(`已添加 ${getTypeLabel(type)} 节点`)
  }

  const addNodeAsChild = (parentId: string, branch: 'true' | 'false', type: OperationType) => {
    const newNodeId = `node_${Date.now()}`
    const nodeIndex = config.nodes.length + 1
    const newNode: WorkflowNode = {
      id: newNodeId,
      name: `${getTypeLabel(type)} #${nodeIndex}`,
      type,
      strategy: ExecuteStrategy.AUTO,
      params: getDefaultParams(type),
      nextNodeId: '',
    }

    const updatedNodes = [...config.nodes]
    const parentIndex = updatedNodes.findIndex(n => n.id === parentId)
    
    if (parentIndex !== -1) {
      updatedNodes.push(newNode)
      
      if (branch === 'true') {
        updatedNodes[parentIndex].conditionTrueNodeId = newNodeId
      } else {
        updatedNodes[parentIndex].conditionFalseNodeId = newNodeId
      }
      
      setConfig({
        ...config,
        nodes: updatedNodes,
      })
      
      setSelectedNode(newNodeId)
      message.success(`已添加 ${getTypeLabel(type)} 子节点到「${branch === 'true' ? '是' : '否'}」分支`)
    }
  }

  const removeNode = (nodeId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个节点吗？相关的连接也会被删除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        const updatedNodes = config.nodes.filter(n => n.id !== nodeId)
        
        updatedNodes.forEach(node => {
          if (node.nextNodeId === nodeId) {
            node.nextNodeId = ''
          }
          if (node.conditionTrueNodeId === nodeId) {
            node.conditionTrueNodeId = ''
          }
          if (node.conditionFalseNodeId === nodeId) {
            node.conditionFalseNodeId = ''
          }
        })

        if (config.startNodeId === nodeId) {
          setConfig({
            ...config,
            startNodeId: updatedNodes[0]?.id || '',
            nodes: updatedNodes,
          })
        } else {
          setConfig({
            ...config,
            nodes: updatedNodes,
          })
        }

        if (selectedNode === nodeId) {
          setSelectedNode(null)
        }

        message.success('节点已删除')
      },
    })
  }

  const updateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
    console.log('[updateNode] 更新节点:', { nodeId, updates, currentStartNodeId: config.startNodeId })
    const updatedNodes = config.nodes.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    )

    const newConfig = {
      ...config,
      nodes: updatedNodes,
    }
    
    console.log('[updateNode] 更新后的config:', { 
      startNodeId: newConfig.startNodeId, 
      nodesCount: newConfig.nodes.length,
      firstNodeId: newConfig.nodes[0]?.id 
    })
    
    setConfig(newConfig)
  }

  const handleBack = () => {
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '未保存的更改',
        icon: <WarningOutlined style={{ color: '#faad14' }} />,
        content: '您有未保存的更改。确定要离开吗？',
        okText: '离开',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => router.push('/'),
      })
    } else {
      router.push('/')
    }
  }

  const handleExecute = () => {
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '执行前保存',
        icon: <WarningOutlined style={{ color: '#faad14' }} />,
        content: '您有未保存的更改。建议先保存再执行。',
        okText: '保存并执行',
        cancelText: '直接执行',
        onOk: async () => {
          await saveWorkflow()
          executeWorkflow()
        },
        onCancel: () => {
          executeWorkflow()
        },
      })
    } else {
      executeWorkflow()
    }
  }

  const executeWorkflow = () => {
    if (config.nodes.length === 0) {
      message.warning('请先添加节点')
      return
    }

    if (!taskId) {
      Modal.warning({
        title: '请先保存工作流',
        content: '执行前请先保存工作流配置',
      })
      return
    }

    const params = new URLSearchParams()
    params.set('run', taskId)
    router.push(`/?${params.toString()}`)
  }

  if (isLoading) {
    return (
      <Layout style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载工作流中..." />
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Space>
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
            style={{ color: 'white' }}
          >
            返回
          </Button>
          <Title level={3} style={{ color: 'white', margin: 0 }}>
            {taskName}
          </Title>
          <Tag color="blue">DAG 工作流</Tag>
          {hasUnsavedChanges && (
            <Badge status="warning" text={<span style={{ color: '#fff', fontSize: 12 }}>未保存</span>} />
          )}
          {isSaved && (
            <Badge status="success" text={<span style={{ color: '#fff', fontSize: 12 }}>已保存</span>} />
          )}
        </Space>

        <Space>
          <Tooltip title="编辑名称">
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setShowTaskNameModal(true)}
              style={{ color: 'white' }}
            />
          </Tooltip>
          <Button
            icon={<SaveOutlined />}
            onClick={saveWorkflow}
            loading={isSaving}
            type="primary"
          >
            保存工作流
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleExecute}
            disabled={config.nodes.length === 0}
          >
            执行工作流
          </Button>
        </Space>
      </Header>

      {hasUnsavedChanges && (
        <Alert
          message="您有未保存的更改"
          description="请记得在离开前保存您的工作流配置。"
          type="warning"
          showIcon
          closable
          style={{ margin: '16px 24px 0' }}
        />
      )}

      <Content style={{ padding: '24px', background: '#f5f5f5', display: 'flex', gap: '16px', height: 'calc(100vh - 120px)' }}>
        <Card
          title={
            <Space>
              <span>工作流节点 ({config.nodes.length})</span>
            </Space>
          }
          style={{ flex: 2, overflow: 'auto' }}
          extra={
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => addNode(OperationType.OPEN_PAGE)}
                size="small"
              >
                添加节点
              </Button>
            </Space>
          }
        >
          <WorkflowCanvas
            config={config}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            onAddNode={addNode}
            onAddNodeAsChild={addNodeAsChild}
            onRemoveNode={removeNode}
            onUpdateNode={updateNode}
          />
        </Card>

        {selectedNode && (
          <Card
            title="节点配置"
            style={{ flex: 1, maxWidth: '500px', overflow: 'auto' }}
            extra={
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeNode(selectedNode)}
                size="small"
              >
                删除
              </Button>
            }
          >
            <NodeConfigPanel
              node={config.nodes.find(n => n.id === selectedNode)!}
              allNodes={config.nodes}
              onUpdate={(updates: Partial<WorkflowNode>) => updateNode(selectedNode, updates)}
              onSave={() => {
                const currentNode = config.nodes.find(n => n.id === selectedNode)
                console.log('[保存节点配置] 节点数据:', currentNode)
                console.log('[保存节点配置] 所有节点:', config.nodes)
                console.log('[保存节点配置] startNodeId:', config.startNodeId)
                message.success('节点配置已保存')
              }}
              onClose={() => setSelectedNode(null)}
            />
          </Card>
        )}
      </Content>

      <Modal
        title="编辑工作流名称"
        open={showTaskNameModal}
        onCancel={() => setShowTaskNameModal(false)}
        onOk={() => {
          taskForm.validateFields().then(values => {
            setTaskName(values.name)
            setShowTaskNameModal(false)
          })
        }}
      >
        <Form form={taskForm} layout="vertical" initialValues={{ name: taskName }}>
          <Form.Item
            name="name"
            label="工作流名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="输入工作流名称" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}

function getDefaultParams(type: OperationType): Record<string, any> {
  switch (type) {
    case OperationType.OPEN_PAGE:
      return { url: '' }
    case OperationType.CLICK:
    case OperationType.HOVER:
      return { selector: '', aiDescription: '' }
    case OperationType.FORM_FILL:
      return { fields: [] }
    case OperationType.SCROLL:
      return { direction: 'down', amount: 500 }
    case OperationType.CONDITION:
      return { checkType: 'EXIST', selector: '', value: 5 }
    case OperationType.SCRIPT_EXEC:
      return { script: '' }
    case OperationType.NODE_SELECT:
      return { selector: '', storeAs: '' }
    case OperationType.SCREENSHOT:
      return { filename: '', screenshotType: 'fullpage' }
    case OperationType.AI_TASK:
      return { taskDescription: '', timeout: 60 }
    default:
      return {}
  }
}

function getTypeLabel(type: OperationType): string {
  const labels: Record<OperationType, string> = {
    [OperationType.CONDITION]: '条件判断',
    [OperationType.CLICK]: '点击元素',
    [OperationType.OPEN_PAGE]: '打开页面',
    [OperationType.FORM_FILL]: '表单填写',
    [OperationType.SCROLL]: '滚动页面',
    [OperationType.NODE_SELECT]: '选择节点',
    [OperationType.SCRIPT_EXEC]: '执行脚本',
    [OperationType.HOVER]: '悬停元素',
    [OperationType.SCREENSHOT]: '页面截取',
    [OperationType.AI_TASK]: 'AI任务',
  }
  return labels[type] || type
}
