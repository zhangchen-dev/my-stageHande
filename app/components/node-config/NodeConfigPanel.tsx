'use client'

import { Form, Input, Select, InputNumber, Button, Space, Card, Typography, Divider, Switch } from 'antd'
import { WorkflowNode, OperationType, ExecuteStrategy } from '@/lib/workflow/types'
import { DeleteOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface NodeConfigPanelProps {
  node: WorkflowNode
  allNodes: WorkflowNode[]
  onUpdate: (updates: Partial<WorkflowNode>) => void
  onClose: () => void
}

export default function NodeConfigPanel({
  node,
  allNodes,
  onUpdate,
  onClose,
}: NodeConfigPanelProps) {
  const [form] = Form.useForm()

  const handleValuesChange = (changedValues: any) => {
    onUpdate(changedValues)
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
                placeholder="选择节点"
                options={allNodes.filter(n => n.id !== node.id).map(n => ({
                  value: n.id,
                  label: `${n.type} - ${n.id.slice(0, 12)}...`,
                }))}
                onChange={(value) => onUpdate({ conditionTrueNodeId: value || undefined })}
              />
            </Form.Item>

            <Form.Item label="条件为假时 →" name="conditionFalseNodeId">
              <Select 
                allowClear
                placeholder="选择节点"
                options={allNodes.filter(n => n.id !== node.id).map(n => ({
                  value: n.id,
                  label: `${n.type} - ${n.id.slice(0, 12)}...`,
                }))}
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
          <Text strong>节点 ID:</Text>
          <Paragraph copyable style={{ marginBottom: 0 }}>{node.id}</Paragraph>
        </div>

        <Form.Item label="操作类型" name="type">
          <Select disabled options={[
            { value: OperationType.CONDITION, label: '条件判断' },
            { value: OperationType.CLICK, label: '点击元素' },
            { value: OperationType.OPEN_PAGE, label: '打开页面' },
            { value: OperationType.FORM_FILL, label: '表单填写' },
            { value: OperationType.SCROLL, label: '滚动页面' },
            { value: OperationType.NODE_SELECT, label: '选择节点' },
            { value: OperationType.SCRIPT_EXEC, label: '执行脚本' },
            { value: OperationType.HOVER, label: '悬停元素' },
          ]} />
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

        {node.type !== OperationType.CONDITION && (
          <Form.Item label="下一个节点 →" name="nextNodeId">
            <Select 
              allowClear
              placeholder="选择下一个节点（留空表示结束）"
              options={allNodes.filter(n => n.id !== node.id).map(n => ({
                value: n.id,
                label: `${n.type} - ${n.id.slice(0, 12)}...`,
              }))}
              onChange={(value) => onUpdate({ nextNodeId: value || undefined })}
            />
          </Form.Item>
        )}

        <Divider plain>参数配置</Divider>
        
        {renderTypeSpecificParams()}
      </Space>
    </Form>
  )
}
