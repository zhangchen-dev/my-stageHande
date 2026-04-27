'use client'

import React from 'react'
import { Card, Tag, Typography, Space, Button, Tooltip, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  PlayCircleOutlined,
  StopOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  SaveOutlined,
  HistoryOutlined,
  ExportOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { TestTask, TestResult } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/app/constants'

const { Text } = Typography

interface TaskCardProps {
  task: TestTask
  isRunning: boolean
  isTerminated?: boolean
  latestResult: TestResult | null
  onRun: () => void
  onStop: () => void
  onEdit: () => void
  onDelete: () => void
  onViewResult: (result: TestResult) => void
  onSaveAsTemplate: () => void
  onExportTask?: () => void
  onViewLogs?: () => void
  isDisabled?: boolean
}

export default function TaskCard({
  task,
  isRunning,
  isTerminated = false,
  latestResult,
  onRun,
  onStop,
  onEdit,
  onDelete,
  onViewResult,
  onSaveAsTemplate,
  onExportTask,
  onViewLogs,
  isDisabled = false,
}: TaskCardProps) {
  const items: MenuProps['items'] = [
    {
      key: 'template',
      icon: <SaveOutlined />,
      label: '保存为模板',
      onClick: onSaveAsTemplate,
      disabled: isDisabled,
    },
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '导出任务',
      onClick: onExportTask,
      disabled: isDisabled,
    },
    {
      key: 'logs',
      icon: <FileTextOutlined />,
      label: '查看日志',
      onClick: onViewLogs,
    },
    latestResult ? {
      key: 'result',
      icon: <HistoryOutlined />,
      label: '查看最新结果',
      onClick: () => onViewResult(latestResult),
    } : null,
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除任务',
      danger: true,
      onClick: onDelete,
      disabled: isDisabled || isRunning,
    },
  ].filter(Boolean) as MenuProps['items']

  return (
    <Card
      hoverable={!isRunning && !isDisabled && !isTerminated}
      style={{
        borderLeft: `4px solid ${(isRunning && !isTerminated) ? '#faad14' : isDisabled ? '#d9d9d9' : isTerminated ? STATUS_COLORS['ready'] : STATUS_COLORS[task.status]}`,
        opacity: isDisabled ? 0.5 : (isRunning && !isTerminated) ? 0.8 : 1,
        pointerEvents: isDisabled ? 'none' : 'auto',
      }}
      styles={{
        body: { padding: '12px 16px' }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text strong ellipsis style={{ fontSize: 15, flex: 1 }}>
              {task.name}
            </Text>
            <Tag color={isRunning ? 'processing' : isTerminated ? STATUS_COLORS['ready'] : STATUS_COLORS[task.status]}>
              {isRunning ? '执行中' : isTerminated ? STATUS_LABELS['ready'] : STATUS_LABELS[task.status]}
            </Tag>
          </div>
          
          {task.description && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }} ellipsis>
              {task.description}
            </Text>
          )}
          
          <Space size={4} wrap>
            <Tag>{(task as any).workflowConfig?.nodes?.length || task.steps?.length || 0} 步骤</Tag>
            {latestResult && (
              <Tag color={latestResult.status === 'success' ? 'success' : 'error'}>
                {latestResult.status === 'success' ? '✓ 通过' : '✗ 失败'}
              </Tag>
            )}
            {task.tags?.map(tag => (
              <Tag key={tag} color="blue">{tag}</Tag>
            ))}
          </Space>
        </div>
        
        <Space size={4}>
          {(isRunning && !isTerminated) ? (
            <Button
              type="primary"
              danger
              size="small"
              icon={<StopOutlined />}
              onClick={onStop}
            >
              终止
            </Button>
          ) : (
            <>
              <Tooltip title={isDisabled ? '其他任务正在执行' : '执行任务'}>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={onRun}
                  disabled={isDisabled || (!((task as any).workflowConfig?.nodes?.length > 0) && (!task.steps || task.steps.length === 0))}
                />
              </Tooltip>
              <Tooltip title={isDisabled ? '其他任务正在执行' : '编辑任务'}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={onEdit}
                  disabled={isDisabled}
                />
              </Tooltip>
              <Dropdown menu={{ items }} trigger={['click']} disabled={isDisabled}>
                <Button size="small" icon={<MoreOutlined />} disabled={isDisabled} />
              </Dropdown>
            </>
          )}
        </Space>
      </div>
    </Card>
  )
}
