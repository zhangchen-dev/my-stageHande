'use client'

import React, { useState } from 'react'
import {
  Card,
  Tag,
  Typography,
  Space,
  Button,
  Tooltip,
  Empty,
  Divider,
  Form,
  Input,
  Select,
  Row,
  Col,
  InputNumber,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  CloseOutlined,
  SaveOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { TestStep, TestStepType, ExecutionStrategy, ElementSelector } from '@/types'
import { STEP_TYPES, getStepTypeLabel } from '@/app/constants'
import { cleanSelector } from '@/app/utils/step-helpers'

const { Text } = Typography
const { Option } = Select

interface SubStepFormValues {
  type: TestStepType
  description: string
  value?: string
  selector?: ElementSelector
}

interface StepListProps {
  steps: TestStep[]
  isRunning: boolean
  onEditStep: (step: TestStep) => void
  onRemoveStep: (id: string) => void
  onUpdateSteps: (steps: TestStep[]) => void
  defaultStrategy: ExecutionStrategy
}

function getStepBorderColor(type: TestStepType): string {
  const colors: Record<string, string> = {
    goto: '#1890ff',
    click: '#52c41a',
    fill: '#faad14',
    hover: '#722ed1',
    screenshot: '#13c2c2',
    wait: '#999',
    scroll: '#eb2f96',
    js: '#fa541c',
    clear: '#999',
    followGuide: '#2f54eb',
    condition: '#1890ff',
    conditionLoop: '#52c41a',
    gotoStep: '#fa8c16',
  }
  return colors[type] || '#999'
}

export default function StepList({
  steps,
  isRunning,
  onEditStep,
  onRemoveStep,
  onUpdateSteps,
  defaultStrategy,
}: StepListProps) {
  if (steps.length === 0) {
    return <Empty description="暂无步骤，请使用上方表单添加测试步骤" />
  }

  return (
    <div style={{ maxHeight: 500, overflowY: 'auto', padding: '8px 0' }}>
      {steps.map((item, index) => (
        <StepCard
          key={item.id}
          step={item}
          index={index}
          isRunning={isRunning}
          onEdit={onEditStep}
          onRemove={onRemoveStep}
          onUpdateStep={(updatedStep) => {
            const newSteps = [...steps]
            newSteps[index] = updatedStep
            onUpdateSteps(newSteps)
          }}
          defaultStrategy={defaultStrategy}
          allSteps={steps}
        />
      ))}
    </div>
  )
}

interface StepCardProps {
  step: TestStep
  index: number
  isRunning: boolean
  onEdit: (step: TestStep) => void
  onRemove: (id: string) => void
  onUpdateStep: (step: TestStep) => void
  defaultStrategy: ExecutionStrategy
  allSteps: TestStep[] // 所有步骤（用于 gotoStep 查找目标）
}

function StepCard({ step, index, isRunning, onEdit, onRemove, onUpdateStep, defaultStrategy, allSteps }: StepCardProps) {
  const [expanded, setExpanded] = useState(false)

  const isCondition = step.type === 'condition'
  const isConditionLoop = step.type === 'conditionLoop'
  const isGotoStep = step.type === 'gotoStep'

  const hasSubSteps = isCondition || isConditionLoop

  const findTargetStepInfo = (targetId: string | undefined, allSteps: TestStep[]) => {
    if (!targetId) return null
    const targetIndex = allSteps.findIndex(s => s.id === targetId)
    if (targetIndex === -1) return null
    return { index: targetIndex + 1, step: allSteps[targetIndex] }
  }

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        borderLeft: `3px solid ${getStepBorderColor(step.type)}`,
        background: hasSubSteps ? '#f9f9f9' : isGotoStep ? '#fff7e6' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={4} wrap>
            <Text type="secondary">{index + 1}.</Text>
            <Tag color={isCondition ? 'blue' : isConditionLoop ? 'green' : isGotoStep ? 'orange' : undefined}>
              {getStepTypeLabel(step.type)}
            </Tag>
            <Text strong>{step.description}</Text>
            {step.value && <Text type="secondary">→ {step.value}</Text>}
            {isGotoStep && (() => {
              const targetInfo = findTargetStepInfo(step.targetStepId, allSteps)
              return targetInfo ? (
                <Tag color="processing">→ 跳转到第 {targetInfo.index} 步: {targetInfo.step.description || targetInfo.step.type}</Tag>
              ) : (
                <Tag color="warning">未选择目标</Tag>
              )
            })()}
            {hasSubSteps && (
              <Button
                type="link"
                size="small"
                icon={expanded ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setExpanded(!expanded)}
                style={{ padding: 0, height: 'auto' }}
              >
                {expanded ? '收起' : '展开'} 
                {isCondition && ` (${step.thenSteps?.length || 0} 个子步骤)`}
                {isConditionLoop && ` (${step.loopSteps?.length || 0} 个循环步骤)`}
              </Button>
            )}
          </Space>

          {isGotoStep && step.targetStepId && (
            <div style={{ marginTop: 4, marginLeft: 24, padding: '4px 8px', background: '#fffbe6', borderRadius: 4, display: 'inline-block' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                🎯 执行后将跳转到目标步骤继续执行
              </Text>
            </div>
          )}

          {expanded && hasSubSteps && (
            <SubStepManager
              step={step}
              defaultStrategy={defaultStrategy}
              onUpdateStep={onUpdateStep}
              isRunning={isRunning}
            />
          )}
        </div>

        {!expanded && (
          <Space size={4}>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(step)}
                disabled={isRunning}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onRemove(step.id)}
                disabled={isRunning}
              />
            </Tooltip>
          </Space>
        )}
      </div>
    </Card>
  )
}

interface SubStepManagerProps {
  step: TestStep
  defaultStrategy: ExecutionStrategy
  onUpdateStep: (step: TestStep) => void
  isRunning: boolean
}

function SubStepManager({ step, defaultStrategy, onUpdateStep, isRunning }: SubStepManagerProps) {
  const [addForm] = Form.useForm<SubStepFormValues>()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm] = Form.useForm<SubStepFormValues>()

  const isCondition = step.type === 'condition'
  const subSteps = isCondition ? (step.thenSteps || []) : (step.loopSteps || [])
  const subStepField = isCondition ? 'thenSteps' : 'loopSteps'

  const handleAddSubStep = () => {
    const values = addForm.getFieldsValue()
    if (!values.type || !values.description) {
      message.warning('请填写操作类型和描述')
      return
    }

    const newSubStep: TestStep = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: values.type,
      description: values.description,
      value: values.value || undefined,
      selector: defaultStrategy === 'selector' ? cleanSelector(values.selector) : undefined,
      strategy: defaultStrategy,
    }

    if (values.type === 'condition') {
      newSubStep.thenSteps = []
    } else if (values.type === 'conditionLoop') {
      newSubStep.maxIterations = 10
      newSubStep.loopSteps = []
    }

    onUpdateStep({
      ...step,
      [subStepField]: [...subSteps, newSubStep],
    })
    addForm.resetFields()
  }

  const handleDeleteSubStep = (subIndex: number) => {
    const newSubSteps = [...subSteps]
    newSubSteps.splice(subIndex, 1)
    onUpdateStep({
      ...step,
      [subStepField]: newSubSteps,
    })
  }

  const handleStartEdit = (subIndex: number, subStep: TestStep) => {
    editForm.setFieldsValue({
      type: subStep.type,
      description: subStep.description,
      value: subStep.value,
    })
    setEditingIndex(subIndex)
  }

  const handleSaveEdit = (subIndex: number) => {
    const values = editForm.getFieldsValue()
    if (!values.type || !values.description) {
      message.warning('请填写操作类型和描述')
      return
    }

    const newSubSteps = [...subSteps]
    newSubSteps[subIndex] = {
      ...newSubSteps[subIndex],
      type: values.type,
      description: values.description,
      value: values.value || undefined,
      selector: defaultStrategy === 'selector' ? cleanSelector(values.selector) : undefined,
    }
    
    onUpdateStep({
      ...step,
      [subStepField]: newSubSteps,
    })
    setEditingIndex(null)
  }

  return (
    <div style={{ marginTop: 12, marginLeft: 24, padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #d9d9d9' }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        {isCondition ? '📋 条件满足时执行的子步骤' : '🔄 循环体内执行的步骤'}
      </Text>

      {subSteps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {subSteps.map((subStep, idx) => (
            <div key={subStep.id} style={{ marginBottom: 8, padding: '6px 8px', background: '#f5f5f5', borderRadius: 4 }}>
              {editingIndex === idx ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <Form form={editForm} layout="vertical" size="small">
                    <Row gutter={8}>
                      <Col span={8}>
                        <Form.Item name="type" rules={[{ required: true }]}>
                          <Select size="small" placeholder="类型">
                            {STEP_TYPES.map(t => (
                              <Option key={t.value} value={t.value}>{t.label}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="description" rules={[{ required: true }]}>
                          <Input size="small" placeholder="描述" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item name="value">
                          <Input size="small" placeholder="值" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Space size="small">
                      <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => handleSaveEdit(idx)}>
                        保存
                      </Button>
                      <Button size="small" onClick={() => setEditingIndex(null)}>取消</Button>
                    </Space>
                  </Form>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={4}>
                    <Text type="secondary">{idx + 1}.</Text>
                    <Tag>{getStepTypeLabel(subStep.type)}</Tag>
                    <Text>{subStep.description}</Text>
                    {subStep.value && <Text type="secondary">({subStep.value})</Text>}
                  </Space>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleStartEdit(idx, subStep)}
                      disabled={isRunning}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteSubStep(idx)}
                      disabled={isRunning}
                    />
                  </Space>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Divider style={{ margin: '8px 0' }} />

      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>➕ 添加子步骤：</Text>
      
      <Form form={addForm} layout="vertical" size="small">
        <Row gutter={8}>
          <Col span={8}>
            <Form.Item name="type" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <Select placeholder="操作类型">
                {STEP_TYPES.map(t => (
                  <Option key={t.value} value={t.value}>{t.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="description" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <Input placeholder="操作描述" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item name="value" style={{ marginBottom: 8 }}>
              <Input placeholder="值（可选）" />
            </Form.Item>
          </Col>
        </Row>
        
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddSubStep}
          block
          size="small"
          disabled={isRunning}
        >
          添加子步骤
        </Button>
      </Form>

      {step.type === 'conditionLoop' && (
        <div style={{ marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 4 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>⚙️ 循环条件配置</Text>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            最大循环次数：<Text strong>{step.maxIterations || 10}</Text>
          </Text>
          {step.conditionStep ? (
            <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 4 }}>
              <Space>
                <Tag color="orange">条件步骤</Tag>
                <Text>{step.conditionStep.description || '未配置描述'}</Text>
                <Button
                  size="small"
                  danger
                  onClick={() => onUpdateStep({ ...step, conditionStep: undefined })}
                >
                  删除条件
                </Button>
              </Space>
            </div>
          ) : (
            <Text type="warning" style={{ display: 'block', marginTop: 4 }}>
              ⚠️ 未配置循环条件步骤，请在上方编辑器中配置
            </Text>
          )}
        </div>
      )}
    </div>
  )
}
