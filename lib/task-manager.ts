interface RunningTask {
  testId: string
  aborted: boolean
  abortReason?: string
  stagehand: any
  closePromise?: Promise<void>
}

const runningTasks = new Map<string, RunningTask>()

export function registerTask(testId: string, stagehand: any): void {
  runningTasks.set(testId, { testId, aborted: false, stagehand })
  console.log(`[TaskManager] 任务已注册: ${testId}`)
}

export function unregisterTask(testId: string): void {
  runningTasks.delete(testId)
  console.log(`[TaskManager] 任务已注销: ${testId}`)
}

export function abortTask(testId: string, reason: string = '用户终止'): boolean {
  const task = runningTasks.get(testId)
  if (task) {
    task.aborted = true
    task.abortReason = reason
    console.log(`[TaskManager] 终止信号已发送: ${testId}, 原因: ${reason}`)
    
    forceCloseBrowser(testId)
    
    return true
  }
  return false
}

async function forceCloseBrowser(testId: string): Promise<void> {
  const task = runningTasks.get(testId)
  if (!task || !task.stagehand || task.closePromise) return
  
  console.log(`[TaskManager] 正在关闭浏览器: ${testId}`)
  
  task.closePromise = (async () => {
    try {
      if (task.stagehand && typeof task.stagehand.close === 'function') {
        await Promise.race([
          task.stagehand.close(),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ])
        console.log(`[TaskManager] 浏览器已关闭: ${testId}`)
      }
    } catch (e) {
      console.error(`[TaskManager] 关闭浏览器失败: ${testId}`, e)
      
      try {
        const context = task.stagehand?.context
        if (context) {
          await context.close().catch(() => {})
        }
      } catch (e2) {
        console.error(`[TaskManager] 强制关闭上下文失败`, e2)
      }
    }
  })()
  
  try {
    await task.closePromise
  } catch (e) {
    console.error(`[TaskManager] 关闭浏览器异常`, e)
  }
}

export function isTaskAborted(testId: string): boolean {
  const task = runningTasks.get(testId)
  return task?.aborted || false
}

export function getAbortReason(testId: string): string | undefined {
  return runningTasks.get(testId)?.abortReason
}

export function getRunningTask(testId: string): RunningTask | undefined {
  return runningTasks.get(testId)
}

export function hasRunningTasks(): boolean {
  return runningTasks.size > 0
}

export function checkAndThrowIfAborted(testId: string): void {
  if (isTaskAborted(testId)) {
    const reason = getAbortReason(testId)
    throw new Error(`TASK_ABORTED: ${reason || '用户终止'}`)
  }
}
