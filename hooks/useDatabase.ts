'use client'

import { useState, useEffect, useCallback } from 'react'
import { TestTask, TestResult, TestStep, ExecutionRecord } from '@/types'

// IndexedDB 数据库名称和版本
const DB_NAME = 'StagehandTestDB'
const DB_VERSION = 1

interface DBSchema {
  tasks: TestTask
  results: TestResult
  executionRecords: ExecutionRecord & { taskId: string }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // 创建任务存储
      if (!db.objectStoreNames.contains('tasks')) {
        const taskStore = db.createObjectStore('tasks', { keyPath: 'id' })
        taskStore.createIndex('name', 'name', { unique: false })
        taskStore.createIndex('createdAt', 'createdAt', { unique: false })
        taskStore.createIndex('status', 'status', { unique: false })
      }
      
      // 创建执行结果存储
      if (!db.objectStoreNames.contains('results')) {
        const resultStore = db.createObjectStore('results', { keyPath: 'id' })
        resultStore.createIndex('taskId', 'taskId', { unique: false })
        resultStore.createIndex('executedAt', 'executedAt', { unique: false })
      }
      
      // 创建执行记录存储
      if (!db.objectStoreNames.contains('executionRecords')) {
        const recordStore = db.createObjectStore('executionRecords', { keyPath: 'id', autoIncrement: true })
        recordStore.createIndex('taskId', 'taskId', { unique: false })
      }
    }
  })
}

function transaction<T>(
  storeName: string, 
  mode: IDBTransactionMode
): Promise<[IDBDatabase, IDBObjectStore]> {
  return new Promise((resolve, reject) => {
    openDB().then(db => {
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      resolve([db, store])
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

  // 加载所有任务
  const loadTasks = useCallback(async () => {
    try {
      const [, store] = await transaction('tasks', 'readonly')
      const request = store.getAll()
      
      return new Promise<TestTask[]>((resolve, reject) => {
        request.onsuccess = () => {
          const allTasks = (request.result as TestTask[])
          // 按创建时间倒序
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

  // 加载任务结果
  const loadTaskResults = useCallback(async (taskId: string): Promise<TestResult[]> => {
    try {
      const [, store] = await transaction('results', 'readonly')
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

  // 初始化加载
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
    
    const [, store] = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add(task)
      request.onsuccess = () => {
        setTasks(prev => [task, ...prev])
        resolve(task)
      }
      request.onerror = () => reject(request.error)
    })
  }, [])

  // 更新任务
  const updateTask = useCallback(async (task: TestTask): Promise<void> => {
    const updatedTask = { ...task, updatedAt: new Date().toISOString() }
    
    const [, store] = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put(updatedTask)
      request.onsuccess = () => {
        setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t))
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }, [])

  // 删除任务
  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    const [, store] = await transaction('tasks', 'readwrite')
    
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

  // 保存执行结果
  const saveResult = useCallback(async (result: TestResult): Promise<void> => {
    const [, store] = await transaction('results', 'readwrite')
    
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
      const importedTasks: TestTask[] = JSON.parse(jsonData)
      
      if (!Array.isArray(importedTasks)) {
        // 单个任务
        const task = importedTasks as TestTask
        if (!task.id || !task.name || !Array.isArray(task.steps)) {
          throw new Error('无效的任务数据格式')
        }
        
        // 重新生成 ID 以避免冲突
        const newTask: TestTask = {
          ...task,
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        
        const [, store] = await transaction('tasks', 'readwrite')
        return new Promise((resolve, reject) => {
          const request = store.add(newTask)
          request.onsuccess = () => {
            setTasks(prev => [newTask, ...prev])
            resolve([newTask])
          }
          request.onerror = () => reject(request.error)
        })
      }
      
      // 批量导入
      const now = new Date().toISOString()
      const newTasks: TestTask[] = importedTasks.map(task => ({
        ...task,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      }))
      
      const [, store] = await transaction('tasks', 'readwrite')
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
