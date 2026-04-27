import { Suspense } from 'react'
import { Spin, Layout } from 'antd'
import WorkflowEditor from '@/app/components/workflow-editor/WorkflowEditor'

export default function WorkflowPage() {
  return (
    <Suspense fallback={
      <Layout style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载工作流编辑器..." />
      </Layout>
    }>
      <WorkflowEditor />
    </Suspense>
  )
}
