'use client'

import {
  Card,
  Tag,
  Typography,
  Space,
  Button,
  Tooltip,
  Empty,
  Divider,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { TestStep, TestStepType } from '@/types'
import { getStepTypeLabel } from '@/app/constants'

const { Text } = Typography

interface StepListProps {
  steps: TestStep[]
  isRunning: boolean
  onEditStep: (step: TestStep) => void
  onRemoveStep: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
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
  }
  return colors[type] || '#999'
}

export default function StepList({
  steps,
  isRunning,
  onEditStep,
  onRemoveStep,
  onExport,
  onImport,
}: StepListProps) {
  if (steps.length === 0) {
    return (
      <>
        <Empty description="暂无步骤，请添加测试步骤" />
        <ImportExportButtons onExport={onExport} onImport={onImport} stepsCount={0} />
      </>
    )
  }

  return (
    <>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {steps.map((item, index) => {
          if (item.type === 'condition') {
            const conditionStep = item as any
            return (
              <Card
                key={item.id}
                size="small"
                style={{ marginBottom: 8, borderLeft: `3px solid #1890ff` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ whiteSpace: 'nowrap', overflowX: 'auto' }}>
                      <Space size={4}>
                        <Text type="secondary">{index + 1}.</Text>
                        <Tag color="blue">{getStepTypeLabel(item.type)}</Tag>
                        <Text>{item.description}</Text>
                      </Space>
                    </div>
                    <div style={{ marginTop: 4, marginLeft: 24, whiteSpace: 'nowrap', overflowX: 'auto' }}>
                      <Text type="secondary">条件: {conditionStep.condition?.type || 'elementExists'}</Text>
                      {conditionStep.condition?.value && (
                        <Text type="secondary" style={{ marginLeft: 12 }}>匹配值: {conditionStep.condition.value}</Text>
                      )}
                      <Text type="secondary" style={{ marginLeft: 12 }}>
                        满足时 {conditionStep.thenSteps?.length || 0} 步
                      </Text>
                      {conditionStep.elseSteps && conditionStep.elseSteps.length > 0 && (
                        <Text type="secondary" style={{ marginLeft: 12 }}>
                          不满足时 {conditionStep.elseSteps.length} 步
                        </Text>
                      )}
                    </div>
                  </div>
                  <Space size={4}>
                    <Tooltip title="编辑">
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEditStep(item)} disabled={isRunning} />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemoveStep(item.id)} disabled={isRunning} />
                    </Tooltip>
                  </Space>
                </div>
              </Card>
            )
          }

          return (
            <Card
              key={item.id}
              size="small"
              style={{ marginBottom: 8, borderLeft: `3px solid ${getStepBorderColor(item.type)}` }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflowX: 'auto' }}>
                  <Space size={4}>
                    <Text type="secondary">{index + 1}.</Text>
                    <Tag>{getStepTypeLabel(item.type)}</Tag>
                    <Text>{item.description}</Text>
                    {item.value && <Text type="secondary">→ {item.value}</Text>}
                    {item.selector && <Tag color="purple">选择器</Tag>}
                  </Space>
                </div>
                <Space size={4}>
                  <Tooltip title="编辑">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEditStep(item)} disabled={isRunning} />
                  </Tooltip>
                  <Tooltip title="删除">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemoveStep(item.id)} disabled={isRunning} />
                  </Tooltip>
                </Space>
              </div>
            </Card>
          )
        })}
      </div>

      <Divider />
      <ImportExportButtons onExport={onExport} onImport={onImport} stepsCount={steps.length} />
    </>
  )
}

function ImportExportButtons({
  onExport,
  onImport,
  stepsCount,
}: {
  onExport: () => void
  onImport: (file: File) => void
  stepsCount: number
}) {
  return (
    <Space>
      <Button icon={<DownloadOutlined />} onClick={onExport} disabled={stepsCount === 0}>
        导出步骤
      </Button>
      <label style={{ cursor: 'pointer' }}>
        <input
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
          }}
        />
        <Button icon={<UploadOutlined />}>导入步骤</Button>
      </label>
    </Space>
  )
}
