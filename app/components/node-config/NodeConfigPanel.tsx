'use client'

import { Form, Input, Select, InputNumber, Button, Space, Card, Typography, Divider, Tag } from 'antd'
import { WorkflowNode, OperationType, ExecuteStrategy } from '@/lib/workflow/types'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const getTypeLabel = (type: OperationType): string => {
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
    [OperationType.WAIT]: '等待',
  }
  return labels[type] || type
}

interface NodeConfigPanelProps {
  node: WorkflowNode
  allNodes: WorkflowNode[]
  isNewNode?: boolean
  lastSelectedType?: OperationType | null
  onUpdate: (updates: Partial<WorkflowNode>) => void
  onSave?: () => void
  onClose: () => void
}

export default function NodeConfigPanel({
  node,
  allNodes,
  isNewNode = false,
  lastSelectedType,
  onUpdate,
  onSave,
}: NodeConfigPanelProps) {
  const [form] = Form.useForm()

  // 使用基于实际节点列表的连续编号
  const getNodeIndex = (nodeId: string): number => {
    return allNodes.findIndex(n => n.id === nodeId) + 1
  }

  const getNodeDisplayLabel = (n: WorkflowNode): string => {
    const typeLabels: Record<OperationType, string> = {
      [OperationType.OPEN_PAGE]: '打开页面',
      [OperationType.CLICK]: '点击元素',
      [OperationType.CONDITION]: '条件判断',
      [OperationType.FORM_FILL]: '表单填写',
      [OperationType.SCROLL]: '滚动页面',
      [OperationType.HOVER]: '悬停元素',
      [OperationType.SCRIPT_EXEC]: '执行脚本',
      [OperationType.NODE_SELECT]: '选择节点',
      [OperationType.SCREENSHOT]: '页面截取',
      [OperationType.AI_TASK]: 'AI任务',
      [OperationType.WAIT]: '等待',
    }
    
    const nodeIndex = getNodeIndex(n.id)
    const typeName = typeLabels[n.type] || n.type
    let desc = ''
    
    if (n.type === OperationType.OPEN_PAGE && n.params.url) {
      desc = n.params.url.length > 25 ? n.params.url.slice(0, 25) + '...' : n.params.url
    } else if (n.type === OperationType.SCREENSHOT) {
      desc = n.params.filename || '截图'
    } else if (n.type === OperationType.AI_TASK && n.params.taskDescription) {
      desc = n.params.taskDescription.length > 25 ? n.params.taskDescription.slice(0, 25) + '...' : n.params.taskDescription
    } else if (n.params.aiDescription) {
      desc = n.params.aiDescription.length > 25 ? n.params.aiDescription.slice(0, 25) + '...' : n.params.aiDescription
    } else if (n.params.selector) {
      desc = n.params.selector.length > 25 ? n.params.selector.slice(0, 25) + '...' : n.params.selector
    }
    
    return `#${nodeIndex} ${n.name || typeName}${desc ? ` - ${desc}` : ''}`
  }

  const handleValuesChange = (changedValues: any) => {
    onUpdate(changedValues)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      console.log('[NodeConfigPanel] 保存的数据:', values)
      onUpdate(values)
      onSave?.()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const renderTypeSpecificParams = () => {
    switch (node.type) {
      case OperationType.OPEN_PAGE:
        return (
          <Form.Item label="页面 URL" name={['params', 'url']} rules={[{ required: true, message: '请输入 URL' }]}>
            <Input placeholder="https://example.com" onChange={(e) => onUpdate({ params: { ...node.params, url: e.target.value } })} />
          </Form.Item>
        )

      case OperationType.CLICK:
      case OperationType.HOVER:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item label="选择器 (CSS/XPath)" name={['params', 'selector']}>
              <Input 
                placeholder="#element-id 或 //xpath" 
                onChange={(e) => onUpdate({ params: { ...node.params, selector: e.target.value } })}
              />
            </Form.Item>
            
            <Divider plain>或使用 AI 识别</Divider>
            
            <Form.Item label="AI 描述" name={['params', 'aiDescription']}>
              <TextArea 
                rows={2} 
                placeholder="描述要操作的元素，如：提交按钮、登录表单"
                onChange={(e) => onUpdate({ params: { ...node.params, aiDescription: e.target.value } })}
              />
            </Form.Item>

            {(node.type === OperationType.CLICK) && (
              <Form.Item label="点击后自增变量" name={['params', 'incrementVar']}>
                <Input 
                  placeholder="loopCount"
                  onChange={(e) => onUpdate({ params: { ...node.params, incrementVar: e.target.value } })}
                />
              </Form.Item>
            )}
          </div>
        )

      case OperationType.CONDITION:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item label="条件类型" name={['params', 'checkType']}>
              <Select 
                options={[
                  { value: 'EXIST', label: '元素存在' },
                  { value: 'GT', label: '大于' },
                  { value: 'LT', label: '小于' },
                  { value: 'EQ', label: '等于' },
                ]}
                onChange={(value) => onUpdate({ params: { ...node.params, checkType: value } })}
              />
            </Form.Item>

            {(node.params.checkType === 'EXIST') && (
              <>
                <Form.Item label="元素选择器" name={['params', 'selector']}>
                  <Input 
                    placeholder="#element-id"
                    onChange={(e) => onUpdate({ params: { ...node.params, selector: e.target.value } })}
                  />
                </Form.Item>
                
                <Form.Item label="AI 描述（可选）" name={['params', 'aiDescription']}>
                  <Input 
                    placeholder="提交按钮"
                    onChange={(e) => onUpdate({ params: { ...node.params, aiDescription: e.target.value } })}
                  />
                </Form.Item>
              </>
            )}

            {(node.params.checkType === 'GT' || node.params.checkType === 'LT' || node.params.checkType === 'EQ') && (
              <>
                <Form.Item label="变量名" name={['params', 'varName']}>
                  <Input 
                    placeholder="loopCount"
                    onChange={(e) => onUpdate({ params: { ...node.params, varName: e.target.value } })}
                  />
                </Form.Item>
                
                <Form.Item label="比较值" name={['params', 'value']}>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder={String(5)}
                    onChange={(value: number | null) => onUpdate({ params: { ...node.params, value } })}
                  />
                </Form.Item>
              </>
            )}

            <Divider plain>分支跳转</Divider>
            
            <Form.Item label="条件为真时 →" name="conditionTrueNodeId">
              <Select 
                allowClear
                placeholder="选择节点（可后续添加）"
                showSearch
                optionFilterProp="label"
                options={allNodes.filter(n => n.id !== node.id).map((n) => ({
                  value: n.id,
                  label: getNodeDisplayLabel(n),
                }))}
                onChange={(value) => onUpdate({ conditionTrueNodeId: value || undefined })}
              />
            </Form.Item>

            <Form.Item label="条件为假时 →" name="conditionFalseNodeId">
              <Select 
                allowClear
                placeholder="选择节点（可后续添加）"
                showSearch
                optionFilterProp="label"
                options={allNodes.filter(n => n.id !== node.id).map((n) => ({
                  value: n.id,
                  label: getNodeDisplayLabel(n),
                }))}
                onChange={(value) => onUpdate({ conditionFalseNodeId: value || undefined })}
              />
            </Form.Item>
          </div>
        )

      case OperationType.FORM_FILL:
        return (
          <Card size="small" title="表单字段配置">
            <Text type="secondary">请手动编辑 fields 数组配置每个字段</Text>
            
            <Form.Item name={['params', 'fields']} noStyle>
              <Input.TextArea 
                rows={6}
                placeholder={`[\n  { "selector": "#username", "value": "admin" },\n  { "selector": "#password", "value": "123456" }\n]`}
                style={{ marginTop: 8, fontFamily: 'monospace' }}
                onChange={(e) => {
                  try {
                    const fields = JSON.parse(e.target.value)
                    onUpdate({ params: { ...node.params, fields } })
                  } catch {}
                }}
              />
            </Form.Item>
          </Card>
        )

      case OperationType.SCROLL:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item label="滚动方向" name={['params', 'direction']}>
              <Select 
                options={[
                  { value: 'up', label: '向上 ↑' },
                  { value: 'down', label: '向下 ↓' },
                  { value: 'top', label: '顶部 ↑↑' },
                  { value: 'bottom', label: '底部 ↓↓' },
                ]}
                onChange={(value) => onUpdate({ params: { ...node.params, direction: value } })}
              />
            </Form.Item>
            
            <Form.Item label="滚动距离 (px)" name={['params', 'amount']}>
              <InputNumber 
                style={{ width: '100%' }}
                min={100}
                max={5000}
                step={100}
                onChange={(value) => onUpdate({ params: { ...node.params, amount: value || 500 } })}
              />
            </Form.Item>
          </div>
        )

      case OperationType.SCRIPT_EXEC:
        return (
          <Form.Item label="JavaScript 代码" name={['params', 'script']}>
            <TextArea 
              rows={6}
              placeholder="// 输入 JavaScript 代码\ndocument.title"
              style={{ fontFamily: 'monospace' }}
              onChange={(e) => onUpdate({ params: { ...node.params, script: e.target.value } })}
            />
          </Form.Item>
        )

      case OperationType.NODE_SELECT:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item label="选择器" name={['params', 'selector']}>
              <Input 
                placeholder="#element-id"
                onChange={(e) => onUpdate({ params: { ...node.params, selector: e.target.value } })}
              />
            </Form.Item>
            
            <Form.Item label="存储为变量" name={['params', 'storeAs']}>
              <Input 
                placeholder="selectedElement"
                onChange={(e) => onUpdate({ params: { ...node.params, storeAs: e.target.value } })}
              />
            </Form.Item>
          </div>
        )

      case OperationType.SCREENSHOT:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item label="文件名（可选）" name={['params', 'filename']}>
              <Input 
                placeholder="screenshot-1.png"
                onChange={(e) => onUpdate({ params: { ...node.params, filename: e.target.value } })}
              />
            </Form.Item>
            
            <Form.Item label="截图类型" name={['params', 'screenshotType']}>
              <Select 
                options={[
                  { value: 'fullpage', label: '全页面截图' },
                  { value: 'viewport', label: '视口截图' },
                  { value: 'element', label: '元素截图' },
                ]}
                onChange={(value) => onUpdate({ params: { ...node.params, screenshotType: value } })}
              />
            </Form.Item>

            {(node.params.screenshotType === 'element') && (
              <Form.Item label="元素选择器" name={['params', 'selector']}>
                <Input 
                  placeholder="#element-id 或 //xpath"
                  onChange={(e) => onUpdate({ params: { ...node.params, selector: e.target.value } })}
                />
              </Form.Item>
            )}

            <div style={{ padding: 12, background: '#f6f8fa', borderRadius: 4, fontSize: 12, color: '#666' }}>
              📸 基于Playwright的截图功能，支持全页面、视口或指定元素截图
            </div>
          </div>
        )

      case OperationType.AI_TASK:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Form.Item 
              label="任务描述" 
              name={['params', 'taskDescription']} 
              rules={[{ required: true, message: '请输入AI任务描述' }]}
            >
              <TextArea 
                rows={4}
                placeholder="描述你希望AI执行的任务，例如：&#10;- 点击登录按钮并填写表单&#10;- 搜索商品并添加到购物车&#10;- 提交订单并确认"
                onChange={(e) => onUpdate({ params: { ...node.params, taskDescription: e.target.value } })}
              />
            </Form.Item>
            
            <Form.Item label="超时时间(秒)" name={['params', 'timeout']}>
              <InputNumber 
                style={{ width: '100%' }}
                min={10}
                max={300}
                defaultValue={60}
                onChange={(value) => onUpdate({ params: { ...node.params, timeout: value || 60 } })}
              />
            </Form.Item>

            <div style={{ padding: 12, background: '#f0f5ff', borderRadius: 4, fontSize: 12, color: '#666' }}>
              🤖 AI将根据你的描述自动执行任务，无需配置选择器。基于Stagehand的act()方法实现。
              <br/><br/>
              执行结果：成功返回 ✅，失败返回 ❌
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const currentNodeIndex = getNodeIndex(node.id)
  const nextSequentialNode = allNodes[currentNodeIndex]

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        type: node.type,
        strategy: node.strategy,
        nextNodeId: node.nextNodeId,
        conditionTrueNodeId: node.conditionTrueNodeId,
        conditionFalseNodeId: node.conditionFalseNodeId,
        params: node.params,
      }}
      onValuesChange={handleValuesChange}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
        {/* 节点基本信息 - 精简版 */}
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 14 }}>
            #{currentNodeIndex} {node.name || node.type}
          </Text>
          <Paragraph copyable={{ text: node.id }} style={{ marginBottom: 0, fontSize: 11, color: '#999' }}>
            ID: {node.id.slice(0, 12)}...
          </Paragraph>
        </div>

        <Form.Item label="操作类型" name="type">
          <Select
            disabled={isNewNode}
            options={[
              { value: OperationType.CONDITION, label: '条件判断' },
              { value: OperationType.CLICK, label: '点击元素' },
              { value: OperationType.OPEN_PAGE, label: '打开页面' },
              { value: OperationType.FORM_FILL, label: '表单填写' },
              { value: OperationType.SCROLL, label: '滚动页面' },
              { value: OperationType.NODE_SELECT, label: '选择节点' },
              { value: OperationType.SCRIPT_EXEC, label: '执行脚本' },
              { value: OperationType.HOVER, label: '悬停元素' },
              { value: OperationType.SCREENSHOT, label: '页面截取' },
              { value: OperationType.AI_TASK, label: 'AI任务' },
            ]}
            onChange={(value) => onUpdate({ type: value as OperationType })}
          />
        </Form.Item>
        {isNewNode && (
          <div style={{ 
            padding: '8px 12px', 
            background: '#f6f8fa', 
            borderRadius: 4, 
            fontSize: 11, 
            color: '#666',
            marginBottom: 8
          }}>
            ℹ️ 当前节点类型为新建时选择的「{getTypeLabel(node.type)}」，如需修改请保存后重新编辑
          </div>
        )}

        <Form.Item label="执行策略" name="strategy">
          <Select 
            options={[
              { value: ExecuteStrategy.AUTO, label: '自动选择 (AUTO)' },
              { value: ExecuteStrategy.AI, label: 'AI 识别 (AI)' },
              { value: ExecuteStrategy.SELECTOR, label: '选择器 (SELECTOR)' },
            ]}
            onChange={(value) => onUpdate({ strategy: value as ExecuteStrategy })}
          />
        </Form.Item>

        <Form.Item 
          label="下一个节点 →" 
          name="nextNodeId"
          tooltip={
            <div>
              <div>• 留空：自动连接到顺序上的下一个节点</div>
              <div>• 选择：手动指定要跳转到的节点</div>
              <div>• 支持创建循环和条件跳转</div>
            </div>
          }
        >
          <Select 
            allowClear
            placeholder="留空则自动连接下一节点"
            showSearch
            optionFilterProp="label"
            options={allNodes.filter(n => n.id !== node.id).map((n) => {
              const targetIndex = getNodeIndex(n.id)
              const isSequentialNext = targetIndex === currentNodeIndex + 1
              
              return {
                value: n.id,
                label: (
                  <span>
                    {getNodeDisplayLabel(n)}
                    {isSequentialNext && (
                      <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>
                        顺序下一
                      </Tag>
                    )}
                  </span>
                ),
              }
            })}
            onChange={(value) => {
              console.log('[NodeConfig] 选择下一个节点:', { 
                nodeId: node.id, 
                selectedNextNodeId: value,
                nodeName: node.name 
              })
              onUpdate({ nextNodeId: value || '' })
            }}
            onSelect={(value) => {
              console.log('[NodeConfig] 确认选择:', value)
              onUpdate({ nextNodeId: value as string })
            }}
          />
        </Form.Item>

        {/* 显示当前连接状态 - 精简版 */}
        {!node.nextNodeId && currentNodeIndex < allNodes.length && (
          <div style={{ 
            padding: '8px 12px', 
            background: '#f6f8fa', 
            borderRadius: 4, 
            fontSize: 11, 
            color: '#666',
          }}>
            ℹ️ 自动连接到: #{currentNodeIndex + 1} {nextSequentialNode?.name}
          </div>
        )}

        {node.nextNodeId && (() => {
          const targetNode = allNodes.find(n => n.id === node.nextNodeId)
          return targetNode ? (
            <div style={{ 
              padding: '8px 12px', 
              background: '#e6f7ff', 
              borderRadius: 4, 
              fontSize: 11, 
              color: '#1890ff',
              border: '1px solid #91d5ff'
            }}>
              ✓ 已连接到: #{getNodeIndex(targetNode.id)} {targetNode.name}
            </div>
          ) : null
        })()}

        <Divider plain>参数配置</Divider>
        
        {renderTypeSpecificParams()}

        <Divider />
        
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          block
        >
          保存节点配置
        </Button>
      </div>
    </Form>
  )
}
