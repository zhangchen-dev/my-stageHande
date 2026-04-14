/**
 * 数据库抽象层
 * 支持 IndexedDB，可轻松扩展为其他数据库（LocalStorage、远程API等）
 * 
 * 使用策略模式：通过 DatabaseAdapter 接口定义统一操作
 * 切换数据库只需实现新的 Adapter
 */

import { TestTask, TestResult, ExecutionRecord } from '@/types'

// ==================== 数据库适配器接口 ====================

/**
 * 数据库适配器接口
 * 定义统一的数据库操作方法
 */
export interface DatabaseAdapter {
  // 任务操作
  createTask(task: TestTask): Promise<string>
  getTask(id: string): Promise<TestTask | null>
  getAllTasks(): Promise<TestTask[]>
  updateTask(task: TestTask): Promise<void>
  deleteTask(id: string): Promise<void>
  
  // 执行结果操作
  saveResult(result: TestResult): Promise<string>
  getResult(id: string): Promise<TestResult | null>
  getResultsByTaskId(taskId: string): Promise<TestResult[]>
  deleteResult(id: string): Promise<void>
  
  // 执行记录操作
  addExecutionRecord(taskId: string, record: ExecutionRecord): Promise<void>
  getExecutionRecords(taskId: string): Promise<ExecutionRecord[]>
}

// ==================== IndexedDB 适配器实现 ====================

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

function transaction<T>(storeName: string, mode: IDBTransactionMode): Promise<[IDBDatabase, IDBObjectStore]> {
  return new Promise((resolve, reject) => {
    openDB().then(db => {
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      resolve([db, store])
    }).catch(reject)
  })
}

export class IndexedDBAdapter implements DatabaseAdapter {
  
  async createTask(task: TestTask): Promise<string> {
    const [, store] = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add(task)
      request.onsuccess = () => resolve(task.id)
      request.onerror = () => reject(request.error)
    })
  }
  
  async getTask(id: string): Promise<TestTask | null> {
    const [, store] = await transaction('tasks', 'readonly')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }
  
  async getAllTasks(): Promise<TestTask[]> {
    const [, store] = await transaction('tasks', 'readonly')
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const tasks = request.result as TestTask[]
        // 按创建时间倒序
        tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        resolve(tasks)
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  async updateTask(task: TestTask): Promise<void> {
    const [, store] = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put(task)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  async deleteTask(id: string): Promise<void> {
    const [, store] = await transaction('tasks', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  async saveResult(result: TestResult): Promise<string> {
    const [, store] = await transaction('results', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add(result)
      request.onsuccess = () => resolve(result.id)
      request.onerror = () => reject(request.error)
    })
  }
  
  async getResult(id: string): Promise<TestResult | null> {
    const [, store] = await transaction('results', 'readonly')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }
  
  async getResultsByTaskId(taskId: string): Promise<TestResult[]> {
    const [, store] = await transaction('results', 'readonly')
    return new Promise((resolve, reject) => {
      const index = store.index('taskId')
      const request = index.getAll(taskId)
      request.onsuccess = () => {
        const results = request.result as TestResult[]
        // 按执行时间倒序
        results.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
        resolve(results)
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  async deleteResult(id: string): Promise<void> {
    const [, store] = await transaction('results', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  async addExecutionRecord(taskId: string, record: ExecutionRecord): Promise<void> {
    const [, store] = await transaction('executionRecords', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.add({ ...record, taskId })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  async getExecutionRecords(taskId: string): Promise<ExecutionRecord[]> {
    const [, store] = await transaction('executionRecords', 'readonly')
    return new Promise((resolve, reject) => {
      const index = store.index('taskId')
      const request = index.getAll(taskId)
      request.onsuccess = () => resolve(request.result as ExecutionRecord[])
      request.onerror = () => reject(request.error)
    })
  }
}

// ==================== LocalStorage 适配器（备选） ====================

/**
 * LocalStorage 适配器 - 适用于简单场景或作为降级方案
 * 注意：LocalStorage 有 5MB 限制，不适合大量数据
 */
export class LocalStorageAdapter implements DatabaseAdapter {
  private prefix = 'stagehand_'
  
  private getKey(key: string) {
    return `${this.prefix}${key}`
  }
  
  async createTask(task: TestTask): Promise<string> {
    const tasks = await this.getAllTasks()
    tasks.push(task)
    localStorage.setItem(this.getKey('tasks'), JSON.stringify(tasks))
    return task.id
  }
  
  async getTask(id: string): Promise<TestTask | null> {
    const tasks = await this.getAllTasks()
    return tasks.find(t => t.id === id) || null
  }
  
  async getAllTasks(): Promise<TestTask[]> {
    const data = localStorage.getItem(this.getKey('tasks'))
    return data ? JSON.parse(data) : []
  }
  
  async updateTask(task: TestTask): Promise<void> {
    const tasks = await this.getAllTasks()
    const index = tasks.findIndex(t => t.id === task.id)
    if (index >= 0) {
      tasks[index] = task
      localStorage.setItem(this.getKey('tasks'), JSON.stringify(tasks))
    }
  }
  
  async deleteTask(id: string): Promise<void> {
    const tasks = await this.getAllTasks()
    const filtered = tasks.filter(t => t.id !== id)
    localStorage.setItem(this.getKey('tasks'), JSON.stringify(filtered))
  }
  
  async saveResult(result: TestResult): Promise<string> {
    const results = await this.getAllResults()
    results.push(result)
    localStorage.setItem(this.getKey('results'), JSON.stringify(results))
    return result.id
  }
  
  async getResult(id: string): Promise<TestResult | null> {
    const results = await this.getAllResults()
    return results.find(r => r.id === id) || null
  }
  
  async getResultsByTaskId(taskId: string): Promise<TestResult[]> {
    const results = await this.getAllResults()
    return results.filter(r => r.taskId === taskId)
  }
  
  async deleteResult(id: string): Promise<void> {
    const results = await this.getAllResults()
    const filtered = results.filter(r => r.id !== id)
    localStorage.setItem(this.getKey('results'), JSON.stringify(filtered))
  }
  
  private async getAllResults(): Promise<TestResult[]> {
    const data = localStorage.getItem(this.getKey('results'))
    return data ? JSON.parse(data) : []
  }
  
  async addExecutionRecord(taskId: string, record: ExecutionRecord): Promise<void> {
    const records = await this.getAllExecutionRecords()
    records.push({ ...record, taskId })
    localStorage.setItem(this.getKey('executionRecords'), JSON.stringify(records))
  }
  
  async getExecutionRecords(taskId: string): Promise<ExecutionRecord[]> {
    const records = await this.getAllExecutionRecords()
    return records.filter(r => r.taskId === taskId)
  }
  
  private async getAllExecutionRecords(): Promise<(ExecutionRecord & { taskId: string })[]> {
    const data = localStorage.getItem(this.getKey('executionRecords'))
    return data ? JSON.parse(data) : []
  }
}

// ==================== 数据库管理器 ====================

let currentAdapter: DatabaseAdapter | null = null

/**
 * 获取当前数据库适配器
 * 可在此切换不同的数据库实现
 */
export function getDatabase(): DatabaseAdapter {
  if (!currentAdapter) {
    // 默认使用 IndexedDB
    currentAdapter = new IndexedDBAdapter()
  }
  return currentAdapter
}

/**
 * 切换数据库适配器
 * @param adapter 新的数据库适配器实例
 */
export function setDatabaseAdapter(adapter: DatabaseAdapter): void {
  currentAdapter = adapter
}

/**
 * 切换到 LocalStorage 适配器
 */
export function useLocalStorage(): void {
  currentAdapter = new LocalStorageAdapter()
}

/**
 * 切换到 IndexedDB 适配器
 */
export function useIndexedDB(): void {
  currentAdapter = new IndexedDBAdapter()
}

// 导出默认实例
export const db = {
  get: getDatabase,
  set: setDatabaseAdapter,
  useLocalStorage,
  useIndexedDB,
}
