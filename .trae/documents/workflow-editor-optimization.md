# 工作流编辑器优化计划

## 需求分析

### 需求1：执行时选择浏览器模式
**现状**：
- `app/page.tsx` 主页面有 `useHeadful` 状态控制浏览器模式
- `WorkflowEditor.tsx` 执行工作流时直接跳转，没有提供浏览器模式选择

**目标**：
- 在工作流编辑器点击"执行工作流"按钮时，弹出确认框让用户选择有头/无头浏览器模式
- 将选择的模式传递给执行流程

### 需求2：删除孤立节点
**现状**：
- `WorkflowCanvas.tsx` 检测并显示孤立节点（第327-382行）
- 孤立节点只是显示警告，没有真正从配置中删除
- 导致编排显示的节点数量与实际执行步骤不一致

**目标**：
- 在保存或执行工作流前，自动清理孤立节点
- 确保编排的节点数量和真实步骤一致

---

## 实施步骤

### 步骤1：添加浏览器模式选择功能

**文件**: `app/components/workflow-editor/WorkflowEditor.tsx`

1. 添加状态变量存储用户选择的浏览器模式
2. 修改 `handleExecute` 函数，弹出选择框
3. 修改 `executeWorkflow` 函数，将浏览器模式参数传递到URL

### 步骤2：实现孤立节点清理功能

**文件**: `app/components/workflow-editor/WorkflowEditor.tsx`

1. 添加 `removeIsolatedNodes` 函数，清理孤立节点
2. 在 `saveWorkflow` 函数中调用清理函数
3. 在 `executeWorkflow` 函数中调用清理函数

### 步骤3：更新工作流画布显示

**文件**: `app/components/workflow-canvas/WorkflowCanvas.tsx`

1. 移除孤立节点的显示逻辑（因为会被自动清理）
2. 或者保留警告提示，但添加"一键清理"按钮

---

## 详细代码修改

### 修改1: WorkflowEditor.tsx - 添加浏览器模式选择

```tsx
// 添加状态
const [useHeadful, setUseHeadful] = useState(false)

// 修改 handleExecute 函数
const handleExecute = () => {
  if (config.nodes.length === 0) {
    message.warning('请先添加节点')
    return
  }

  if (!taskId) {
    Modal.warning({
      title: '请先保存工作流',
      content: '执行前请先保存工作流配置',
    })
    return
  }

  Modal.confirm({
    title: '执行工作流',
    content: (
      <div>
        <p>请选择浏览器模式：</p>
        <Radio.Group defaultValue={false} onChange={(e) => setUseHeadful(e.target.value)}>
          <Radio value={false}>无头模式（后台运行）</Radio>
          <Radio value={true}>有头模式（显示浏览器）</Radio>
        </Radio.Group>
      </div>
    ),
    okText: '开始执行',
    cancelText: '取消',
    onOk: async () => {
      if (hasUnsavedChanges) {
        await saveWorkflow()
      }
      executeWorkflow()
    },
  })
}

// 修改 executeWorkflow 函数
const executeWorkflow = () => {
  // 清理孤立节点
  const cleanedConfig = removeIsolatedNodes(config)
  
  const params = new URLSearchParams()
  params.set('run', taskId)
  params.set('useHeadful', String(useHeadful))
  
  try {
    params.set('workflowConfig', JSON.stringify(cleanedConfig))
  } catch (e) {
    console.warn('[executeWorkflow] 序列化配置失败', e)
  }
  
  router.push(`/?${params.toString()}`)
}
```

### 修改2: WorkflowEditor.tsx - 添加孤立节点清理

```tsx
// 添加清理孤立节点的函数
const removeIsolatedNodes = (config: WorkflowConfig): WorkflowConfig => {
  if (!config.nodes || config.nodes.length === 0) {
    return config
  }

  // 收集所有连接的节点
  const connectedNodes = new Set<string>()
  
  const collectConnected = (nodeId: string) => {
    if (connectedNodes.has(nodeId)) return
    const node = config.nodes.find(n => n.id === nodeId)
    if (!node) return
    
    connectedNodes.add(nodeId)
    if (node.nextNodeId) collectConnected(node.nextNodeId)
    if (node.conditionTrueNodeId) collectConnected(node.conditionTrueNodeId)
    if (node.conditionFalseNodeId) collectConnected(node.conditionFalseNodeId)
  }
  
  // 从起始节点开始收集
  if (config.startNodeId) {
    collectConnected(config.startNodeId)
  }
  
  // 过滤出连接的节点
  const validNodes = config.nodes.filter(n => connectedNodes.has(n.id))
  
  const removedCount = config.nodes.length - validNodes.length
  if (removedCount > 0) {
    message.info(`已自动清理 ${removedCount} 个孤立节点`)
  }
  
  return {
    ...config,
    nodes: validNodes,
  }
}
```

### 修改3: app/page.tsx - 接收浏览器模式参数

```tsx
// 在 runWorkflowTask useEffect 中读取参数
const useHeadfulParam = searchParams.get('useHeadful')
if (useHeadfulParam === 'true') {
  setUseHeadful(true)
}
```

---

## 测试验证

1. 测试浏览器模式选择
   - 点击执行按钮，确认弹出选择框
   - 选择有头模式，确认浏览器显示
   - 选择无头模式，确认浏览器隐藏

2. 测试孤立节点清理
   - 创建工作流，删除中间节点产生孤立节点
   - 保存工作流，确认孤立节点被清理
   - 执行工作流，确认只执行连接的节点

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `app/components/workflow-editor/WorkflowEditor.tsx` | 添加浏览器模式选择、孤立节点清理 |
| `app/page.tsx` | 接收并使用浏览器模式参数 |
