'use client'

import { useRef, useEffect } from 'react'
import { Card, Typography, Badge, Button, Space, Alert } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  StopOutlined,
  ClearOutlined,
} from '@ant-design/icons'
import { LogEntry } from '@/types'

const { Text } = Typography

interface LogPanelProps {
  logs: LogEntry[]
  isRunning: boolean
  onClear: () => void
  onStop?: () => void
  taskName?: string
}

export default function LogPanel({ logs, isRunning, onClear, onStop, taskName }: LogPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          <span>执行日志</span>
          {isRunning && <Badge status="processing" text="运行中" />}
        </Space>
      }
      extra={
        <Space>
          {isRunning && onStop && (
            <Button 
              type="primary" 
              danger 
              size="small" 
              icon={<StopOutlined />}
              onClick={onStop}
            >
              终止执行
            </Button>
          )}
          {logs.length > 0 && (
            <Button 
              type="text" 
              size="small" 
              icon={<ClearOutlined />}
              onClick={onClear}
            >
              清空
            </Button>
          )}
        </Space>
      }
      style={{ height: '100%' }}
    >
      {isRunning && taskName && (
        <Alert
          message={`正在执行: ${taskName}`}
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}
      
      <div
        style={{
          height: 'calc(100vh - 280px)',
          overflowY: 'auto',
          background: '#1e1e1e',
          padding: '16px',
          borderRadius: '8px',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '13px',
        }}
      >
        {logs.length === 0 ? (
          <Text type="secondary" style={{ fontFamily: 'inherit' }}>
            {isRunning ? '等待执行...' : '选择一个任务开始执行，或编辑任务配置步骤'}
          </Text>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '8px' }}>
              <Text type="secondary" style={{ marginRight: '8px', fontFamily: 'inherit' }}>
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </Text>
              {log.level === 'info' && <InfoCircleOutlined style={{ color: '#1890ff', marginRight: '4px' }} />}
              {log.level === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '4px' }} />}
              {log.level === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: '4px' }} />}
              <Text
                style={{
                  color: log.level === 'success' ? '#52c41a' : log.level === 'error' ? '#ff4d4f' : '#fff',
                  fontFamily: 'inherit',
                }}
              >
                {log.message}
              </Text>
              {log.screenshot && (
                <div style={{ marginTop: '8px' }}>
                  <img
                    src={log.screenshot}
                    alt="截图"
                    style={{ maxWidth: '100%', borderRadius: '4px', border: '1px solid #333' }}
                  />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </Card>
  )
}
