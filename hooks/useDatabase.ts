'use client'

import { useState, useEffect, useCallback } from 'react'
import { TestTask, TestResult, TestStep, ExecutionRecord } from '@/types'
import { OperationType, ExecuteStrategy } from '@/lib/workflow/types'

const DB_NAME = 'StagehandTestDB'
const DB_VERSION = 2

interface DBSchema {
  tasks: TestTask
  results: TestResult
  executionRecords: ExecutionRecord & { taskId: string }
}

let dbInstance: IDBDatabase | null = null
let dbInitPromise: Promise<IDBDatabase> | null = null
let dbClosed = false

function openDB(): Promise<IDBDatabase> {
  if (dbInstance && !dbClosed) {
    return Promise.resolve(dbInstance)
  }
  
  if (dbInitPromise) {
    return dbInitPromise
  }
  
  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      dbInitPromise = null
      reject(request.error)
    }
    
    request.onsuccess = () => {
      dbInstance = request.result
      dbInitPromise = null
      dbClosed = false
      
      dbInstance.onclose = () => {
        dbInstance = null
        dbClosed = true
      }
      dbInstance.onerror = () => {
        dbInstance = null
        dbClosed = true
      }
      
      resolve(dbInstance)
    }
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      if (oldVersion < 2) {
        if (db.objectStoreNames.contains('tasks')) db.deleteObjectStore('tasks')
        if (db.objectStoreNames.contains('results')) db.deleteObjectStore('results')
        if (db.objectStoreNames.contains('executionRecords')) db.deleteObjectStore('executionRecords')
      }
      
      const taskStore = db.createObjectStore('tasks', { keyPath: 'id' })
      taskStore.createIndex('name', 'name', { unique: false })
      taskStore.createIndex('createdAt', 'createdAt', { unique: false })
      taskStore.createIndex('status', 'status', { unique: false })
      
      const resultStore = db.createObjectStore('results', { keyPath: 'id' })
      resultStore.createIndex('taskId', 'taskId', { unique: false })
      resultStore.createIndex('executedAt', 'executedAt', { unique: false })
      
      const recordStore = db.createObjectStore('executionRecords', { keyPath: 'id', autoIncrement: true })
      recordStore.createIndex('taskId', 'taskId', { unique: false })
    }
  })
  
  return dbInitPromise
}

function transaction<T>(
  storeName: string, 
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    openDB().then(db => {
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      resolve(store)
    }).catch(reject)
  })
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function useDatabase() {
  const [tasks, setTasks] = useState<TestTask[]>([])
  const [results, setResults] = useState<Map<string, TestResult[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  const loadTasks = useCallback(async () => {
    try {
      const store = await transaction('tasks', 'readonly')
      const request = store.getAll()
      
      return new Promise<TestTask[]>((resolve, reject) => {
        request.onsuccess = () => {
          const allTasks = (request.result as TestTask[])
          allTasks.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          resolve(allTasks)
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error('加载任务失败:', error)
      return []
    }
  }, [])

  const loadTaskResults = useCallback(async (taskId: string): Promise<TestResult[]> => {
    try {
      const store = await transaction('results', 'readonly')
      const index = store.index('taskId')
      const request = index.getAll(taskId)
      
      return new Promise<TestResult[]>((resolve, reject) => {
        request.onsuccess = () => {
          const taskResults = request.result as TestResult[]
          taskResults.sort((a, b) => 
            new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
          )
          resolve(taskResults)
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error('加载执行结果失败:', error)
      return []
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        await openDB() // 确保数据库已初始化
        const allTasks = await loadTasks()
        setTasks(allTasks)
        
        // 加载每个任务的最新结果
        const resultsMap = new Map<string, TestResult[]>()
        for (const task of allTasks) {
          const taskResults = await loadTaskResults(task.id)
          if (taskResults.length > 0) {
            resultsMap.set(task.id, taskResults)
          }
        }
        setResults(resultsMap)
      } catch (error) {
        console.error('初始化数据库失败:', error)
      }
      setIsLoading(false)
    }
    init()
  }, [loadTasks, loadTaskResults])

  // 创建任务
  const createTask = useCallback(async (
    name: string,
    description?: string,
    steps?: TestStep[],
    tags?: string[]
  ): Promise<TestTask> => {
    console.log('[createTask] 开始创建任务')
    console.log('[createTask] 参数 - name:', name)
    console.log('[createTask] 参数 - description:', description)
    console.log('[createTask] 参数 - steps 数量:', steps?.length)
    console.log('[createTask] 参数 - steps 列表:', steps?.map(s => `${s.id}: ${s.type}`))
    console.log('[createTask] 参数 - tags:', tags)

    const now = new Date().toISOString()
    const task: TestTask = {
      id: generateId(),
      name,
      description,
      steps: steps || [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      tags,
    }

    console.log('[createTask] 创建的任务对象:', task)
    console.log('[createTask] 任务步骤数:', task.steps.length)

    const store = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add(task)
      request.onsuccess = () => {
        console.log('[createTask] ✅ 任务已保存到 IndexedDB')
        console.log('[createTask] 更新任务列表，当前任务数:', tasks.length + 1)
        setTasks(prev => [task, ...prev])
        resolve(task)
      }
      request.onerror = () => {
        console.error('[createTask] ❌ 保存失败:', request.error)
        reject(request.error)
      }
    })
  }, [])

  const updateTask = useCallback(async (task: TestTask): Promise<void> => {
    const updatedTask = { ...task, updatedAt: new Date().toISOString() }
    
    const store = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put(updatedTask)
      request.onsuccess = () => {
        setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t))
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }, [])

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    const store = await transaction('tasks', 'readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.delete(taskId)
      request.onsuccess = () => {
        setTasks(prev => prev.filter(t => t.id !== taskId))
        setResults(prev => {
          const newMap = new Map(prev)
          newMap.delete(taskId)
          return newMap
        })
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }, [])

  const saveResult = useCallback(async (result: TestResult): Promise<void> => {
    const store = await transaction('results', 'readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.add(result)
      request.onsuccess = () => {
        setResults(prev => {
          const newMap = new Map(prev)
          const taskResults = newMap.get(result.taskId) || []
          newMap.set(result.taskId, [result, ...taskResults])
          return newMap
        })
        
        // 更新任务状态
        const taskIndex = tasks.findIndex(t => t.id === result.taskId)
        if (taskIndex >= 0) {
          const updatedTask = {
            ...tasks[taskIndex],
            status: result.status === 'success' ? 'completed' : 
                    result.status === 'partial' ? 'completed' : 'failed',
            updatedAt: new Date().toISOString(),
          } as TestTask
          store.put(updatedTask)
          setTasks(prev => prev.map(t => t.id === result.taskId ? updatedTask : t))
        }
        
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }, [tasks])

  // 获取任务的最新结果
  const getLatestResult = useCallback((taskId: string): TestResult | null => {
    const taskResults = results.get(taskId)
    return taskResults && taskResults.length > 0 ? taskResults[0] : null
  }, [results])

  // 导入任务（从 JSON）
  const importTasks = useCallback(async (jsonData: string): Promise<TestTask[]> => {
    try {
      const importedData = JSON.parse(jsonData)
      
      if (!Array.isArray(importedData)) {
        // 单个任务或工作流
        return await importSingleTask(importedData)
      }
      
      // 多个任务
      const now = new Date().toISOString()
      const newTasks: TestTask[] = []
      
      for (const task of importedData) {
        const processedTask = await processImportedTask(task, now)
        if (processedTask) {
          newTasks.push(processedTask)
        }
      }
      
      if (newTasks.length === 0) {
        throw new Error('没有有效的任务数据')
      }
      
      const store = await transaction('tasks', 'readwrite')
      return new Promise((resolve, reject) => {
        let added = 0
        newTasks.forEach(task => {
          const request = store.add(task)
          request.onsuccess = () => {
            added++
            if (added === newTasks.length) {
              setTasks(prev => [...newTasks, ...prev])
              resolve(newTasks)
            }
          }
          request.onerror = () => reject(request.error)
        })
      })
    } catch (error) {
      throw new Error(`导入失败: ${(error as Error).message}`)
    }
  }, [])

  // 处理单个导入的任务
  const importSingleTask = async (task: any): Promise<TestTask[]> => {
    const processedTask = await processImportedTask(task, new Date().toISOString())
    if (!processedTask) {
      throw new Error('无效的任务数据格式')
    }
    
    const store = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add(processedTask)
      request.onsuccess = () => {
        setTasks(prev => [processedTask!, ...prev])
        resolve([processedTask!])
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 处理导入的任务数据（支持传统步骤和工作流配置）
  const processImportedTask = async (task: any, timestamp: string): Promise<TestTask | null> => {
    try {
      // 验证基本字段
      if (!task || typeof task !== 'object') {
        console.warn('[导入] 无效的任务数据:', task)
        return null
      }

      // 支持工作流类型任务
      if (task.workflowConfig && task.workflowConfig.nodes && Array.isArray(task.workflowConfig.nodes)) {
        console.log('[导入] 检测到工作流配置任务:', task.name)
        
        // 验证工作流配置的有效性
        const workflowConfig = validateAndFixWorkflowConfig(task.workflowConfig)
        
        const newTask: TestTask = {
          id: generateId(),
          name: task.name || '未命名工作流',
          type: 'workflow',
          description: task.description,
          workflowConfig: workflowConfig,
          status: 'draft',
          tags: task.tags,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        
        console.log('[导入] 工作流任务处理完成:', { 
          id: newTask.id, 
          name: newTask.name, 
          nodesCount: workflowConfig.nodes.length 
        })
        
        return newTask
      }
      
      // 支持传统步骤类型任务
      if (Array.isArray(task.steps)) {
        console.log('[导入] 检测到传统步骤任务:', task.name)
        
        const newTask: TestTask = {
          ...task,
          id: generateId(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        
        // 确保必要字段存在
        if (!newTask.status) newTask.status = 'draft'
        
        return newTask
      }
      
      // 如果既没有 workflowConfig 也没有 steps，尝试转换
      console.warn('[导入] 任务缺少必要数据，尝试修复:', task.name)
      
      if (task.name && (task.type === 'workflow' || !task.type)) {
        // 尝试创建空的工作流任务
        const startNodeId = `node_${Date.now()}_import`
        const newTask: TestTask = {
          id: generateId(),
          name: task.name || '导入的任务',
          type: 'workflow',
          description: task.description || '从文件导入',
          workflowConfig: {
            startNodeId: startNodeId,
            nodes: [{
              id: startNodeId,
              name: '开始节点',
              type: OperationType.OPEN_PAGE,
              strategy: ExecuteStrategy.AUTO,
              params: { url: '' },
              nextNodeId: '',
            }],
          },
          status: 'draft',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        
        return newTask
      }
      
      console.error('[导入] 无法识别的任务格式:', task)
      return null
      
    } catch (error) {
      console.error('[导入] 处理任务失败:', error, task)
      return null
    }
  }

  // 验证并修复工作流配置
  const validateAndFixWorkflowConfig = (config: any): any => {
    if (!config || !config.nodes || !Array.isArray(config.nodes)) {
      // 返回默认的空工作流配置
      const startNodeId = `node_${Date.now()}_fixed`
      return {
        startNodeId: startNodeId,
        nodes: [{
          id: startNodeId,
          name: '开始节点',
          type: OperationType.OPEN_PAGE,
          strategy: ExecuteStrategy.AUTO,
          params: { url: '' },
          nextNodeId: '',
        }],
      }
    }
    
    // 过滤掉无效节点，保留有效节点
    const validNodes = config.nodes.filter((node: any) => 
      node && node.id && node.type
    ).map((node: any, index: number) => ({
      ...node,
      // 确保必要字段存在
      id: node.id || `node_${Date.now()}_${index}`,
      name: node.name || `节点 ${index + 1}`,
      type: node.type || OperationType.SCRIPT_EXEC,
      strategy: node.strategy || ExecuteStrategy.AUTO,
      params: node.params || {},
      // 清理无效引用
      nextNodeId: node.nextNodeId || '',
      conditionTrueNodeId: node.conditionTrueNodeId || undefined,
      conditionFalseNodeId: node.conditionFalseNodeId || undefined,
    }))
    
    // 确保 startNodeId 指向存在的节点
    let startNodeId = config.startNodeId
    if (!startNodeId || !validNodes.find((n: any) => n.id === startNodeId)) {
      startNodeId = validNodes[0]?.id || ''
    }
    
    // 清理无效的节点引用
    const validNodeIds = new Set(validNodes.map((n: any) => n.id))
    validNodes.forEach((node: any) => {
      if (node.nextNodeId && !validNodeIds.has(node.nextNodeId)) {
        node.nextNodeId = ''
      }
      if (node.conditionTrueNodeId && !validNodeIds.has(node.conditionTrueNodeId)) {
        node.conditionTrueNodeId = undefined
      }
      if (node.conditionFalseNodeId && !validNodeIds.has(node.conditionFalseNodeId)) {
        node.conditionFalseNodeId = undefined
      }
    })
    
    console.log('[验证] 工作流配置验证完成:', { 
      originalNodes: config.nodes.length, 
      validNodes: validNodes.length,
      startNodeId 
    })
    
    return {
      startNodeId,
      nodes: validNodes,
    }
  }

  // 导出任务为 JSON
  const exportTask = useCallback((task: TestTask): string => {
    return JSON.stringify(task, null, 2)
  }, [])

  // 导出所有任务
  const exportAllTasks = useCallback((): string => {
    return JSON.stringify(tasks, null, 2)
  }, [tasks])

  return {
    tasks,
    results,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    saveResult,
    getLatestResult,
    loadTasks,
    loadTaskResults,
    importTasks,
    exportTask,
    exportAllTasks,
  }
}
