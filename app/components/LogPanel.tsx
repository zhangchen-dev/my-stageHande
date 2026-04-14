'use client'

import { useRef, useEffect } from 'react'
import { Card, Typography, Badge, Button, Space } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { LogEntry } from '@/types'

const { Text } = Typography

interface LogPanelProps {
  logs: LogEntry[]
  isRunning: boolean
  onClear: () => void
}

export default function LogPanel({ logs, isRunning, onClear }: LogPanelProps) {
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
        logs.length > 0 && (
          <Button type="text" size="small" onClick={onClear}>
            清空
          </Button>
        )
      }
      style={{ height: '100%' }}
    >
      <div
        style={{
          height: 'calc(100vh - 200px)',
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
            等待开始测试...
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
