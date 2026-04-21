// 测试脚本：导入 test-task.json 并执行
// 在浏览器控制台中运行此脚本

async function importAndTestTask() {
  try {
    // 1. 导入 test-task.json
    const response = await fetch('/test-task.json')
    const taskData = await response.json()

    console.log('[Test] 导入的任务数据:', taskData)

    // 2. 保存到 IndexedDB
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('StagehandTestDB', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: 'id' })
        }
      }
    })

    const taskToSave = Array.isArray(taskData) ? taskData[0] : taskData

    // 确保 startNodeId 有效
    if (!taskToSave.workflowConfig?.startNodeId && taskToSave.workflowConfig?.nodes?.length > 0) {
      taskToSave.workflowConfig.startNodeId = taskToSave.workflowConfig.nodes[0].id
      console.log('[Test] 自动设置 startNodeId:', taskToSave.workflowConfig.startNodeId)
    }

    await new Promise((resolve, reject) => {
      const store = db.transaction('tasks', 'readwrite').objectStore('tasks')
      const request = store.put(taskToSave)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    console.log('[Test] 任务已保存到 IndexedDB, ID:', taskToSave.id)
    console.log('[Test] startNodeId:', taskToSave.workflowConfig?.startNodeId)
    console.log('[Test] 节点数:', taskToSave.workflowConfig?.nodes?.length)

    // 3. 跳转到执行页面
    window.location.href = `/?run=${taskToSave.id}`

  } catch (error) {
    console.error('[Test] 导入失败:', error)
  }
}

console.log('[Test] 准备导入并测试任务...')
console.log('[Test] 运行 importAndTestTask() 开始测试')
window.importAndTestTask = importAndTestTask
