'use client'

import { Form, Input, Select, Row, Col, Button, Space, Typography, Divider, Switch } from 'antd'
import type { FormInstance } from 'antd'
import { PlusOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'
import { TestStep, TestStepType, ElementSelector, ExecutionStrategy } from '@/types'
import { STEP_TYPES, STRATEGIES } from '@/app/constants'
import { cleanSelector, cleanCondition } from '@/app/utils/step-helpers'

const { Option } = Select
const { Text } = Typography

export interface FormValues {
  type: TestStepType
  description: string
  selector?: ElementSelector
  strategy?: ExecutionStrategy
  value?: string
  condition?: {
    type?: string
    selector?: ElementSelector
    value?: string
  }
}

type FormType = FormInstance<FormValues>

interface StepEditorProps {
  editingStepId: string | null
  defaultStrategy: ExecutionStrategy
  useHeadful: boolean
  editForm: FormType
  addForm: FormType
  onAddStep: (values: FormValues) => void
  onSaveEditedStep: (values: FormValues) => void
  onCancelEdit: () => void
  onStrategyChange: (strategy: ExecutionStrategy) => void
  onHeadfulChange: (headful: boolean) => void
}

function SelectorFields({ prefix, form }: { prefix: string; form: FormType }) {
  return (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name={`${prefix}.id`} label="元素 ID">
            <Input placeholder="例如：start-button" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.className`} label="Class 名称">
            <Input placeholder="例如：btn-start" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.classPrefix`} label="Class 前缀">
            <Input placeholder="例如：Demo_start" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name={`${prefix}.text`} label="文本内容">
            <Input placeholder="例如：开始演示" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.css`} label="CSS 选择器">
            <Input placeholder="例如：.btn-primary" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.xpath`} label="XPath">
            <Input placeholder="例如：//button[text()='开始演示']" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name={`${prefix}.testId`} label="测试 ID">
            <Input placeholder="例如：start-demo" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.name`} label="Name 属性">
            <Input placeholder="例如：username" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name={`${prefix}.containsText`} label="包含文本">
            <Input placeholder="例如：提交" />
          </Form.Item>
        </Col>
      </Row>
    </>
  )
}

function ConditionFields({ form }: { form: FormType }) {
  return (
    <div style={{ marginTop: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
      <Text strong style={{ marginBottom: 8, display: 'block' }}>条件配置</Text>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="condition.type" label="条件类型">
            <Select placeholder="选择条件类型">
              <Option value="elementExists">元素存在</Option>
              <Option value="elementVisible">元素可见</Option>
              <Option value="textMatch">文本匹配</Option>
              <Option value="attributeMatch">属性匹配</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item name="conditionValue" label="匹配值（可选）">
            <Input placeholder="例如：aaa（文本匹配时填写）" />
          </Form.Item>
        </Col>
      </Row>
      <SelectorFields prefix="condition.selector" form={form} />
      <Text type="secondary">条件满足/不满足时的子步骤暂不支持在表单中编辑</Text>
    </div>
  )
}

function StepFormFields({
  form,
  defaultStrategy,
  isEdit,
}: {
  form: FormType
  defaultStrategy: ExecutionStrategy
  isEdit: boolean
}) {
  const stepType = Form.useWatch('type', form)
  const strategy = Form.useWatch('strategy', form)
  const isCondition = stepType === 'condition'
  const showSelector = strategy === 'selector' && !isCondition

  return (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="type" label="操作类型" rules={[{ required: true }]}>
            <Select placeholder="选择操作">
              {STEP_TYPES.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item
            name="description"
            label={isCondition ? '条件描述' : (defaultStrategy === 'ai' ? 'AI 描述 (详细描述要操作的元素)' : '操作描述')}
            rules={[{ required: true }]}
          >
            <Input placeholder={
              isCondition
                ? '例如：如果能找到元素A且展示文案是"aaa"'
                : (defaultStrategy === 'ai'
                    ? '例如：点击页面中央的蓝色"开始演示"按钮'
                    : '描述要执行的操作')
            } />
          </Form.Item>
        </Col>
      </Row>

      {isCondition && <ConditionFields form={form} />}

      {!isCondition && (
        <>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="value" label="值 (URL/输入内容/等待毫秒)">
                <Input placeholder="根据操作类型填写" />
              </Form.Item>
            </Col>
          </Row>

          {showSelector && (
            <div style={{ marginTop: 8, padding: 12, background: '#f9f0ff', borderRadius: 8 }}>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>选择器配置</Text>
              <SelectorFields prefix="selector" form={form} />
            </div>
          )}

          {strategy === 'ai' && !isCondition && (
            <div style={{ marginTop: 8, padding: 12, background: '#fff7e6', borderRadius: 8 }}>
              <Text type="secondary">
                💡 提示：AI 描述越详细，识别准确率越高。建议包含元素的位置、颜色、文本内容等信息。
              </Text>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default function StepEditor({
  editingStepId,
  defaultStrategy,
  useHeadful,
  editForm,
  addForm,
  onAddStep,
  onSaveEditedStep,
  onCancelEdit,
  onStrategyChange,
  onHeadfulChange,
}: StepEditorProps) {
  const handleAddSubmit = (values: FormValues) => {
    const processed = processFormValues(values, defaultStrategy)
    onAddStep(processed)
    addForm.resetFields()
  }

  const handleEditSubmit = (values: FormValues) => {
    const processed = processFormValues(values, defaultStrategy)
    onSaveEditedStep(processed)
  }

  return (
    <div style={{
      padding: 16,
      background: '#fafafa',
      borderRadius: 8,
      marginBottom: 16,
      maxHeight: 'calc(100vh - 300px)',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16, flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <Text>浏览器:</Text>
          <Switch
            checked={useHeadful}
            onChange={onHeadfulChange}
            checkedChildren="有头"
            unCheckedChildren="无头"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <Text>执行策略:</Text>
          <Select value={defaultStrategy} onChange={onStrategyChange} style={{ width: 200 }}>
            {STRATEGIES.map(s => (
              <Option key={s.value} value={s.value}>{s.label}</Option>
            ))}
          </Select>
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {editingStepId ? (
        <Form key={editingStepId} form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <StepFormFields form={editForm} defaultStrategy={defaultStrategy} isEdit={true} />
          <Space>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit">保存</Button>
            <Button icon={<CloseOutlined />} onClick={onCancelEdit}>取消</Button>
          </Space>
        </Form>
      ) : (
        <Form form={addForm} layout="vertical" onFinish={handleAddSubmit}>
          <StepFormFields form={addForm} defaultStrategy={defaultStrategy} isEdit={false} />
          <Button type="dashed" icon={<PlusOutlined />} htmlType="submit" block>
            添加步骤
          </Button>
        </Form>
      )}
    </div>
  )
}

function processFormValues(values: FormValues, defaultStrategy: ExecutionStrategy): FormValues {
  const result: FormValues = {
    type: values.type,
    description: values.description,
    strategy: defaultStrategy,
  }

  if (values.type === 'condition') {
    result.condition = {
      type: values.condition?.type || 'elementExists',
      selector: cleanSelector(values.condition?.selector),
      value: (values as any).conditionValue || values.condition?.value,
    }
  } else {
    if (values.value) result.value = values.value
    if (defaultStrategy === 'selector') {
      result.selector = cleanSelector(values.selector)
    }
  }

  return result
}
