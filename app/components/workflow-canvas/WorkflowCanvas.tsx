'use client'

import { useState } from 'react'
import { Button, Select, Card, Tag, Typography, Empty, Dropdown } from 'antd'
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

const START_NODE_TYPE = { value: OperationType.START, label: '开始', icon: <GlobalOutlined />, color: '#52c41a' }
const END_NODE_TYPE = { value: OperationType.END, label: '结束', icon: <CheckSquareOutlined />, color: '#ff4d4f' }

export default function WorkflowCanvas({
  config,
  selectedNode,
  onSelectNode,
  onAddNode,
  onAddNodeAsChild,
}: WorkflowCanvasProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // 获取有效的节点列表（清理无效引用）
  const getValidatedConfig = (): { nodes: WorkflowNode[], startNodeId: string } => {
    if (!config.nodes || config.nodes.length === 0) {
      return { nodes: [], startNodeId: '' }
    }

    const validNodes = config.nodes.filter(node => node && node.id && node.type)
    
    let startNodeId = config.startNodeId
    if (!startNodeId || !validNodes.find(n => n.id === startNodeId)) {
      startNodeId = validNodes[0]?.id || ''
    }

    return { nodes: validNodes, startNodeId }
  }

  const validatedConfig = getValidatedConfig()
  const { nodes: validNodes, startNodeId: validStartNodeId } = validatedConfig

  // 获取节点在列表中的索引（用于显示连续编号）
  const getNodeIndex = (nodeId: string): number => {
    return validNodes.findIndex(n => n.id === nodeId) + 1
  }

  if (!validStartNodeId || validNodes.length === 0) {
    return (
      <Empty
        description="工作流配置错误"
        style={{ margin: '100px 0' }}
      >
        <Text type="secondary">请重新创建工作流</Text>
      </Empty>
    )
  }

  const getNodeById = (nodeId: string): WorkflowNode | undefined => {
    return validNodes.find(n => n.id === nodeId)
  }

  // 检查节点是否被其他节点引用（避免重复渲染）
  const renderedNodes = new Set<string>()

  const renderNode = (nodeId: string, depth: number = 0): React.ReactNode => {
    // 防止无限循环和重复渲染
    if (!nodeId || depth > 50 || renderedNodes.has(nodeId)) {
      console.warn(`[Canvas] 跳过无效/重复/过深节点: ${nodeId}, depth: ${depth}`)
      return null
    }

    const node = getNodeById(nodeId)
    if (!node) {
      console.warn(`[Canvas] 未找到节点: ${nodeId}`)
      return null
    }

    // 标记为已渲染
    renderedNodes.add(nodeId)

    const isSelected = selectedNode === node.id
    const isHovered = hoveredNode === node.id
    
    let typeInfo
    if (node.type === OperationType.START) {
      typeInfo = START_NODE_TYPE
    } else if (node.type === OperationType.END) {
      typeInfo = END_NODE_TYPE
    } else {
      typeInfo = NODE_TYPES.find(t => t.value === node.type)
    }
    
    const nodeIndex = getNodeIndex(node.id)

    let nextNodes: React.ReactNode[] = []

    if (node.type === OperationType.CONDITION) {
      // 条件节点 - 渲染分支
      if (node.conditionTrueNodeId && !renderedNodes.has(node.conditionTrueNodeId)) {
        nextNodes.push(
          <div key={`${node.id}-true`} style={{ marginLeft: 40, marginTop: 12 }}>
            <div style={{
              padding: '6px 12px',
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 4,
              display: 'inline-block',
              marginBottom: 8
            }}>
              <Tag color="success" style={{ margin: 0 }}>✓ 是</Tag>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, color: '#52c41a' }}>
                条件满足时执行
              </Text>
            </div>
            {renderNode(node.conditionTrueNodeId!, depth + 1)}
          </div>
        )
      } else if (!node.conditionTrueNodeId) {
        nextNodes.push(
          <div key={`${node.id}-true-add`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="success">✓ 是</Tag>
            <Dropdown menu={{ items: NODE_TYPES.map(type => ({
              key: type.value,
              label: (
                <span>
                  {type.icon}
                  <span style={{ marginLeft: 4 }}>{type.label}</span>
                </span>
              ),
              onClick: () => onAddNodeAsChild(node.id, 'true', type.value),
            })) }} trigger={['click']}>
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={(e) => e.stopPropagation()}>
                添加子节点
              </Button>
            </Dropdown>
          </div>
        )
      }

      if (node.conditionFalseNodeId && !renderedNodes.has(node.conditionFalseNodeId)) {
        nextNodes.push(
          <div key={`${node.id}-false`} style={{ marginLeft: 40, marginTop: 12 }}>
            <div style={{
              padding: '6px 12px',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 4,
              display: 'inline-block',
              marginBottom: 8
            }}>
              <Tag color="error" style={{ margin: 0 }}>✗ 否</Tag>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, color: '#ff4d4f' }}>
                条件不满足时执行
              </Text>
            </div>
            {renderNode(node.conditionFalseNodeId!, depth + 1)}
          </div>
        )
      } else if (!node.conditionFalseNodeId) {
        nextNodes.push(
          <div key={`${node.id}-false-add`} style={{ marginLeft: 40, marginTop: 8 }}>
            <Tag color="error">✗ 否</Tag>
            <Dropdown menu={{ items: NODE_TYPES.map(type => ({
              key: type.value,
              label: (
                <span>
                  {type.icon}
                  <span style={{ marginLeft: 4 }}>{type.label}</span>
                </span>
              ),
              onClick: () => onAddNodeAsChild(node.id, 'false', type.value),
            })) }} trigger={['click']}>
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={(e) => e.stopPropagation()}>
                添加子节点
              </Button>
            </Dropdown>
          </div>
        )
      }
    } else {
      // 非条件节点 - 渲染下一个节点
      if (node.nextNodeId && !renderedNodes.has(node.nextNodeId)) {
        nextNodes.push(
          <div key={`${node.id}-next`} style={{ marginTop: 8 }}>
            {renderNode(node.nextNodeId!, depth + 1)}
          </div>
        )
      }
    }

    const addMenuItems = NODE_TYPES.map(type => ({
      key: type.value,
      label: (
        <span>
          {type.icon}
          <span style={{ marginLeft: 4 }}>{type.label}</span>
        </span>
      ),
      onClick: () => onAddNode(type.value, node.id),
    }))

    return (
      <div key={node.id} style={{ position: 'relative' }}>
        <Card
          size="small"
          hoverable
          style={{
            borderColor: isSelected ? '#1890ff' : isHovered ? '#91d5ff' : undefined,
            borderWidth: 2,
            background: isSelected ? '#e6f7ff' : isHovered ? '#fff7e6' : undefined,
            maxWidth: 280,
            cursor: 'pointer',
            position: 'relative',
            zIndex: 10,
          }}
          onClick={(e) => {
            e.stopPropagation()
            console.log('[Canvas] 点击节点:', node.id, node.name, `#${nodeIndex}`)
            onSelectNode(node.id)
          }}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {/* 节点标题 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, color: typeInfo?.color || '#666' }}>
                {typeInfo?.icon}
              </span>
              <Text strong style={{ flex: 1, fontSize: 13 }}>
                {node.name || typeInfo?.label || node.type}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                #{nodeIndex}
              </Text>
            </div>

            {/* 节点描述 */}
            <Text 
              type="secondary" 
              ellipsis 
              style={{ fontSize: 11 }} 
              title={getNodeDescription(node)}
            >
              {getNodeDescription(node)}
            </Text>

            {/* 标签组 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Tag 
                color={getStrategyColor(node.strategy)} 
                style={{ fontSize: 10, margin: 0 }}
              >
                {node.strategy}
              </Tag>

              {(node.type === OperationType.CONDITION && node.params.checkType) && (
                <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
                  {node.params.checkType}
                </Tag>
              )}

              {(node.nextNodeId || node.conditionTrueNodeId || node.conditionFalseNodeId) && (
                <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>
                  → 已连接
                </Tag>
              )}
            </div>

            {/* 添加按钮（非条件节点、非结束节点） */}
            {node.type !== OperationType.CONDITION && node.type !== OperationType.END && (
              <Dropdown menu={{ items: addMenuItems }} trigger={['click']}>
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ padding: '0 4px', height: 'auto', fontSize: 11 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  添加后续节点
                </Button>
              </Dropdown>
            )}
          </div>
        </Card>

        {nextNodes}
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f0f5ff', borderRadius: 4, fontSize: 12, color: '#666' }}>
        📊 共 {validNodes.length} 个节点 | 点击节点可编辑配置
      </div>
      
      {renderNode(validStartNodeId)}

      {/* 显示未连接到主流程的孤立节点 */}
      {(() => {
        const connectedNodes = new Set<string>()
        const collectConnected = (nodeId: string) => {
          if (connectedNodes.has(nodeId)) return
          const node = getNodeById(nodeId)
          if (!node) return
          
          connectedNodes.add(nodeId)
          if (node.nextNodeId) collectConnected(node.nextNodeId)
          if (node.conditionTrueNodeId) collectConnected(node.conditionTrueNodeId)
          if (node.conditionFalseNodeId) collectConnected(node.conditionFalseNodeId)
        }
        
        collectConnected(validStartNodeId)
        
        const isolatedNodes = validNodes.filter(n => !connectedNodes.has(n.id))
        
        if (isolatedNodes.length > 0) {
          return (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '2px dashed #ffd591' }}>
              <Text type="warning" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                ⚠️ 发现 {isolatedNodes.length} 个未连接的孤立节点：
              </Text>
              {isolatedNodes.map((node, idx) => {
                const isolatedIndex = getNodeIndex(node.id)
                return (
                  <Card
                    key={node.id}
                    size="small"
                    style={{
                      maxWidth: 280,
                      marginBottom: 8,
                      borderColor: '#ffd591',
                      background: '#fffbe6'
                    }}
                    onClick={() => onSelectNode(node.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ flex: 1, fontSize: 12 }}>
                        #{isolatedIndex} {node.name || node.type}
                      </Text>
                      <Tag color="warning" style={{ fontSize: 10, margin: 0 }}>孤立</Tag>
                    </div>
                    <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
                      {getNodeDescription(node)}
                    </Text>
                  </Card>
                )
              })}
            </div>
          )
        }
        
        return null
      })()}
    </div>
  )
}

function getNodeDescription(node: WorkflowNode): string {
  switch (node.type) {
    case OperationType.START:
      return '工作流起始点'
    case OperationType.END:
      return node.params.output || '工作流终点'
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
