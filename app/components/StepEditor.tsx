'use client'

import { useState, useEffect } from 'react'
import { Form, Input, Select, Row, Col, Button, Space, Typography, Divider, Switch, Card, message, Tag } from 'antd'
import type { FormInstance } from 'antd'
import { PlusOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'
import { TestStep, TestStepType, ElementSelector, ExecutionStrategy } from '@/types'
import { STEP_TYPES, STRATEGIES, getStepTypeLabel } from '@/app/constants'
import { cleanSelector } from '@/app/utils/step-helpers'

const { Option } = Select
const { Text } = Typography

export interface FormValues {
  type: TestStepType
  description: string
  selector?: ElementSelector
  strategy?: ExecutionStrategy
  value?: string
  maxIterations?: number
  thenSteps?: TestStep[]
  loopSteps?: TestStep[]
  conditionStep?: TestStep
  targetStepId?: string // gotoStep 特有：目标步骤 ID
}

type FormType = FormInstance<FormValues>

interface StepEditorProps {
  editingStepId: string | null
  defaultStrategy: ExecutionStrategy
  useHeadful: boolean
  editForm: FormType
  addForm: FormType
  steps: TestStep[] // 当前任务的所有步骤（用于 gotoStep 选择）
  onAddStep: (values: FormValues) => void
  onSaveEditedStep: (values: FormValues) => void
  onCancelEdit: () => void
  onStrategyChange: (strategy: ExecutionStrategy) => void
  onHeadfulChange: (headful: boolean) => void
}

function SelectorFields({ prefix }: { prefix: string; form: FormType }) {
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

function StepFormFields({
  form,
  defaultStrategy,
  steps,
}: {
  form: FormType
  defaultStrategy: ExecutionStrategy
  steps: TestStep[]
}) {
  const stepType = Form.useWatch('type', form)
  const showSelector = defaultStrategy === 'selector'
  const isGotoStep = stepType === 'gotoStep'
  const targetStepId = Form.useWatch('targetStepId', form)

  useEffect(() => {
    if (isGotoStep && targetStepId) {
      const targetIndex = steps.findIndex(s => s.id === targetStepId)
      if (targetIndex !== -1) {
        const targetStep = steps[targetIndex]
        const autoDescription = `跳转到第 ${targetIndex + 1} 步: ${targetStep.description || targetStep.type}`
        form.setFieldsValue({ description: autoDescription })
      }
    }
  }, [isGotoStep, targetStepId, steps, form])

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
          {!isGotoStep ? (
            <Form.Item
              name="description"
              label={defaultStrategy === 'ai' ? 'AI 描述 (详细描述要操作的元素)' : '操作描述'}
              rules={[{ required: true }]}
            >
              <Input placeholder={
                defaultStrategy === 'ai'
                  ? '例如：点击页面中央的蓝色"开始演示"按钮'
                  : '描述要执行的操作'
              } />
            </Form.Item>
          ) : (
            <Form.Item name="description" style={{ marginBottom: 0 }}>
              <Input 
                disabled 
                placeholder="选择目标步骤后自动生成" 
                style={{ background: '#f5f5f5' }}
              />
            </Form.Item>
          )}
        </Col>
      </Row>

      {!isGotoStep && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="value" label="值 (URL/输入内容/等待毫秒)">
              <Input placeholder="根据操作类型填写" />
            </Form.Item>
          </Col>
        </Row>
      )}

      {showSelector && (
        <div style={{ marginTop: 8, padding: 12, background: '#f9f0ff', borderRadius: 8 }}>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>选择器配置</Text>
          <SelectorFields prefix="selector" form={form} />
        </div>
      )}

      {isGotoStep && steps.length > 0 && (
        <div style={{ marginTop: 8, padding: 12, background: '#fff7e6', borderRadius: 8 }}>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>🔗 选择要跳转到的步骤</Text>
          <Form.Item 
            name="targetStepId" 
            label="目标步骤" 
            rules={[{ required: true, message: '请选择要跳转的目标步骤' }]}
          >
            <Select 
              placeholder="选择一个步骤作为跳转目标"
              showSearch
              optionFilterProp="label"
            >
              {steps.map((step, index) => (
                <Option 
                  key={step.id} 
                  value={step.id}
                  label={`${index + 1}. ${step.description || step.type}`}
                >
                  <Space>
                    <Text type="secondary">{index + 1}.</Text>
                    <Tag>{getStepTypeLabel(step.type)}</Tag>
                    <Text>{step.description || '未命名步骤'}</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            💡 执行到此步骤时，将跳转到选定的步骤继续执行。可用于实现循环或条件跳转。
          </Text>
        </div>
      )}

      {isGotoStep && steps.length === 0 && (
        <div style={{ marginTop: 8, padding: 12, background: '#fff1f0', borderRadius: 8 }}>
          <Text type="warning">
            ⚠️ 当前没有可用的步骤，请先添加其他步骤后再使用节点选择功能
          </Text>
        </div>
      )}

      {(stepType === 'condition' || stepType === 'conditionLoop') && (
        <div style={{ marginTop: 8, padding: 12, background: '#e6f7ff', borderRadius: 8 }}>
          <Text type="secondary">
            💡 提示：此类型的步骤支持子步骤。保存后可在下方步骤列表中展开并管理子步骤。
          </Text>
        </div>
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
  steps,
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
        <Card 
          size="small" 
          title={`编辑步骤 #${editingStepId.slice(-6)}`}
          extra={
            <Button type="link" danger onClick={onCancelEdit}>
              取消编辑
            </Button>
          }
        >
          <Form key={editingStepId} form={editForm} layout="vertical" onFinish={handleEditSubmit}>
            <StepFormFields form={editForm} defaultStrategy={defaultStrategy} steps={steps} />
            <Space>
              <Button type="primary" icon={<SaveOutlined />} htmlType="submit">保存修改</Button>
            </Space>
          </Form>
        </Card>
      ) : (
        <Card size="small" title="➕ 添加新步骤（顶层）">
          <Form form={addForm} layout="vertical" onFinish={handleAddSubmit}>
            <StepFormFields form={addForm} defaultStrategy={defaultStrategy} steps={steps} />
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit" block>
              添加步骤
            </Button>
          </Form>
        </Card>
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

  if (values.value) result.value = values.value

  if (defaultStrategy === 'selector') {
    result.selector = cleanSelector(values.selector)
  }

  if (values.type === 'condition') {
    result.thenSteps = []
  } else if (values.type === 'conditionLoop') {
    result.maxIterations = values.maxIterations || 10
    result.loopSteps = []
  } else if (values.type === 'gotoStep') {
    result.targetStepId = values.targetStepId
  }

  return result
}
