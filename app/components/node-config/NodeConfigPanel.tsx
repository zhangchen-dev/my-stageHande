'use client'

import { Form, Input, Select, InputNumber, Button, Space, Card, Typography, Divider, Switch } from 'antd'
import { WorkflowNode, OperationType, ExecuteStrategy } from '@/lib/workflow/types'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface NodeConfigPanelProps {
  node: WorkflowNode
  allNodes: WorkflowNode[]
  onUpdate: (updates: Partial<WorkflowNode>) => void
  onSave?: () => void
  onClose: () => void
}

export default function NodeConfigPanel({
  node,
  allNodes,
  onUpdate,
  onSave,
  onClose,
}: NodeConfigPanelProps) {
  const [form] = Form.useForm()

  const getNodeDisplayLabel = (n: WorkflowNode, index?: number) => {
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
    }
    
    const nodeIndex = index !== undefined ? index : allNodes.indexOf(n) + 1
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
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
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
          </Space>
        )

      case OperationType.CONDITION:
        return (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
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
                options={allNodes.filter(n => n.id !== node.id).map((n) => {
                  const actualIndex = allNodes.indexOf(n) + 1
                  return {
                    value: n.id,
                    label: getNodeDisplayLabel(n, actualIndex),
                  }
                })}
                onChange={(value) => onUpdate({ conditionTrueNodeId: value || undefined })}
              />
            </Form.Item>

            <Form.Item label="条件为假时 →" name="conditionFalseNodeId">
              <Select 
                allowClear
                placeholder="选择节点（可后续添加）"
                showSearch
                optionFilterProp="label"
                options={allNodes.filter(n => n.id !== node.id).map((n) => {
                  const actualIndex = allNodes.indexOf(n) + 1
                  return {
                    value: n.id,
                    label: getNodeDisplayLabel(n, actualIndex),
                  }
                })}
                onChange={(value) => onUpdate({ conditionFalseNodeId: value || undefined })}
              />
            </Form.Item>
          </Space>
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
          <Space direction="vertical" style={{ width: '100%' }}>
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
          </Space>
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
          <Space direction="vertical" style={{ width: '100%' }}>
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
          </Space>
        )

      case OperationType.SCREENSHOT:
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
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
          </Space>
        )

      case OperationType.AI_TASK:
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
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
          </Space>
        )

      default:
        return null
    }
  }

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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>节点信息:</Text>
          <Paragraph copyable style={{ marginBottom: 0 }}>
            <Text type="secondary">{node.name || node.id}</Text>
          </Paragraph>
        </div>

        <div>
          <Text strong>节点 ID:</Text>
          <Paragraph copyable style={{ marginBottom: 0 }}>{node.id}</Paragraph>
        </div>

        <Form.Item label="操作类型" name="type">
          <Select 
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

        <Form.Item label="下一个节点 →" name="nextNodeId">
          <Select 
            allowClear
            placeholder="选择下一个节点（留空则自动连接下一节点）"
            showSearch
            optionFilterProp="label"
            options={allNodes.filter(n => n.id !== node.id).map((n, idx) => {
              const actualIndex = allNodes.indexOf(n) + 1
              return {
                value: n.id,
                label: getNodeDisplayLabel(n, actualIndex),
              }
            })}
            onChange={(value) => onUpdate({ nextNodeId: value || undefined })}
          />
        </Form.Item>

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
      </Space>
    </Form>
  )
}
