'use client'

import { useState } from 'react'
import { Button, Space, Select, Card, Tag, Typography, Empty, Dropdown } from 'antd'
import {
  PlusOutlined,
  CheckSquareOutlined,
  AimOutlined,
  GlobalOutlined,
  EditOutlined,
  VerticalAlignBottomOutlined,
  CodeOutlined,
  DragOutlined,
  CameraOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { WorkflowConfig, WorkflowNode, OperationType, ExecuteStrategy } from '@/lib/workflow/types'

const { Text } = Typography

interface WorkflowCanvasProps {
  config: WorkflowConfig
  selectedNode: string | null
  onSelectNode: (nodeId: string) => void
  onAddNode: (type: OperationType, afterNodeId?: string) => void
  onAddNodeAsChild: (parentId: string, branch: 'true' | 'false', type: OperationType) => void
  onRemoveNode: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void
}

const NODE_TYPES = [
  { value: OperationType.OPEN_PAGE, label: '打开页面', icon: <GlobalOutlined />, color: '#1890ff' },
  { value: OperationType.CLICK, label: '点击元素', icon: <AimOutlined />, color: '#52c41a' },
  { value: OperationType.CONDITION, label: '条件判断', icon: <CheckSquareOutlined />, color: '#faad14' },
  { value: OperationType.FORM_FILL, label: '表单填写', icon: <EditOutlined />, color: '#722ed1' },
  { value: OperationType.SCROLL, label: '滚动页面', icon: <VerticalAlignBottomOutlined />, color: '#13c2c2' },
  { value: OperationType.HOVER, label: '悬停元素', icon: <AimOutlined />, color: '#eb2f96' },
  { value: OperationType.SCRIPT_EXEC, label: '执行脚本', icon: <CodeOutlined />, color: '#fa541c' },
  { value: OperationType.NODE_SELECT, label: '选择节点', icon: <DragOutlined />, color: '#2f54eb' },
  { value: OperationType.SCREENSHOT, label: '页面截取', icon: <CameraOutlined />, color: '#8c8c8c' },
  { value: OperationType.AI_TASK, label: 'AI任务', icon: <RobotOutlined />, color: '#13c2c2' },
]

export default function WorkflowCanvas({
  config,
  selectedNode,
  onSelectNode,
  onAddNode,
  onAddNodeAsChild,
  onRemoveNode,
}: WorkflowCanvasProps) {
  console.log('%c [ config ]-41', 'font-size:13px; background:pink; color:#bf2c9f;', config)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const effectiveConfig = {
    ...config,
    startNodeId: config.startNodeId || (config.nodes.length > 0 ? config.nodes[0].id : ''),
  }

  if (!effectiveConfig.startNodeId || effectiveConfig.nodes.length === 0) {
    return (
      <Empty
        description="暂无节点，请添加开始节点"
        style={{ margin: '100px 0' }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => onAddNode(OperationType.OPEN_PAGE)}
        >
          添加开始节点
        </Button>
      </Empty>
    )
  }

  const getNodeById = (nodeId: string): WorkflowNode | undefined => {
    return effectiveConfig.nodes.find(n => n.id === nodeId)
  }

  const renderNode = (nodeId: string, depth: number = 0): React.ReactNode => {
    const node = getNodeById(nodeId)
    if (!node || depth > 50) return null

    const isSelected = selectedNode === node.id
    const isHovered = hoveredNode === node.id
    const typeInfo = NODE_TYPES.find(t => t.value === node.type)
    
    let nextNodes: React.ReactNode[] = []
    
    if (node.type === OperationType.CONDITION) {
      if (node.conditionTrueNodeId) {
        nextNodes.push(
          <div key={`${node.id}-true`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="success" style={{ marginBottom: 4 }}>✓ 是</Tag>
            {renderNode(node.conditionTrueNodeId, depth + 1)}
          </div>
        )
      } else {
        nextNodes.push(
          <div key={`${node.id}-true-add`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="success" style={{ marginBottom: 4 }}>✓ 是</Tag>
            <Dropdown menu={{ items: NODE_TYPES.map(type => ({
              key: type.value,
              label: (
                <Space>
                  {type.icon}
                  <span>{type.label}</span>
                </Space>
              ),
              onClick: () => onAddNodeAsChild(node.id, 'true', type.value),
            })) }} trigger={['click']}>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                style={{ padding: '0 4px', height: 'auto' }}
                onClick={(e) => e.stopPropagation()}
              >
                添加子节点
              </Button>
            </Dropdown>
          </div>
        )
      }
      
      if (node.conditionFalseNodeId) {
        nextNodes.push(
          <div key={`${node.id}-false`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="error" style={{ marginBottom: 4 }}>✗ 否</Tag>
            {renderNode(node.conditionFalseNodeId, depth + 1)}
          </div>
        )
      } else {
        nextNodes.push(
          <div key={`${node.id}-false-add`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="error" style={{ marginBottom: 4 }}>✗ 否</Tag>
            <Dropdown menu={{ items: NODE_TYPES.map(type => ({
              key: type.value,
              label: (
                <Space>
                  {type.icon}
                  <span>{type.label}</span>
                </Space>
              ),
              onClick: () => onAddNodeAsChild(node.id, 'false', type.value),
            })) }} trigger={['click']}>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                style={{ padding: '0 4px', height: 'auto' }}
                onClick={(e) => e.stopPropagation()}
              >
                添加子节点
              </Button>
            </Dropdown>
          </div>
        )
      }
    } else if (node.nextNodeId) {
      nextNodes.push(
        <div key={`${node.id}-next`} style={{ marginTop: 8 }}>
          <div style={{ 
            width: 2, 
            height: 20, 
            background: '#d9d9d9', 
            marginLeft: 120 
          }} />
          {renderNode(node.nextNodeId, depth + 1)}
        </div>
      )
    }

    const addMenuItems = NODE_TYPES.map(type => ({
      key: type.value,
      label: (
        <Space>
          {type.icon}
          <span>{type.label}</span>
        </Space>
      ),
      onClick: () => onAddNode(type.value, node.id),
    }))

    return (
      <div key={node.id}>
        <Card
          size="small"
          hoverable
          style={{
            borderColor: isSelected ? '#1890ff' : isHovered ? '#91d5ff' : undefined,
            borderWidth: 2,
            background: isSelected ? '#e6f7ff' : isHovered ? '#fff7e6' : undefined,
            maxWidth: 280,
          }}
          onClick={() => onSelectNode(node.id)}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space>
              <span style={{ 
                fontSize: 18, 
                color: typeInfo?.color || '#666',
              }}>
                {typeInfo?.icon}
              </span>
              <Text strong style={{ flex: 1 }}>{node.name || typeInfo?.label || node.type}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                #{effectiveConfig.nodes.indexOf(node) + 1}
              </Text>
            </Space>

            <Text type="secondary" ellipsis style={{ fontSize: 12 }} title={getNodeDescription(node)}>
              {getNodeDescription(node)}
            </Text>

            <Space size={4} wrap>
              <Tag 
                color={getStrategyColor(node.strategy)} 
                style={{ fontSize: 11, margin: 0 }}
              >
                {node.strategy}
              </Tag>
              
              {(node.type === OperationType.CONDITION && node.params.checkType) && (
                <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>
                  {node.params.checkType}
                </Tag>
              )}
            </Space>

            {node.type !== OperationType.CONDITION && (
              <Dropdown menu={{ items: addMenuItems }} trigger={['click']}>
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ padding: '0 4px', height: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  添加后续节点
                </Button>
              </Dropdown>
            )}
          </Space>
        </Card>

        {nextNodes}
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {renderNode(effectiveConfig.startNodeId)}
    </div>
  )
}

function getNodeDescription(node: WorkflowNode): string {
  switch (node.type) {
    case OperationType.OPEN_PAGE:
      return node.params.url || '未设置 URL'
    case OperationType.CLICK:
    case OperationType.HOVER:
      return node.params.selector || node.params.aiDescription || '未设置目标'
    case OperationType.FORM_FILL:
      return `填写表单 (${node.params.fields?.length || 0} 个字段)`
    case OperationType.SCROLL:
      return `${node.params.direction || 'down'} ${node.params.amount || 500}px`
    case OperationType.CONDITION:
      return `${node.params.checkType || '判断条件'}${node.params.selector ? ': ' + node.params.selector : ''}`
    case OperationType.SCRIPT_EXEC:
      return node.params.script ? '执行自定义脚本' : '未设置脚本'
    case OperationType.NODE_SELECT:
      return node.params.selector || '未设置选择器'
    default:
      return '配置中...'
  }
}

function getStrategyColor(strategy: ExecuteStrategy): string {
  switch (strategy) {
    case ExecuteStrategy.AUTO:
      return 'blue'
    case ExecuteStrategy.AI:
      return 'purple'
    case ExecuteStrategy.SELECTOR:
      return 'green'
    default:
      return 'default'
  }
}
