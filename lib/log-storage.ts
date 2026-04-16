import { ExecutionLog } from '@/types/execution-log'

const DB_NAME = 'StagehandTestDB'
const DB_VERSION = 2
const LOGS_STORE = 'execution_logs'

export class LogStorage {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onerror = () => reject(request.error)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(LOGS_STORE)) {
          const store = db.createObjectStore(LOGS_STORE, { keyPath: 'id' })
          store.createIndex('taskId', 'taskId', { unique: false })
          store.createIndex('startTime', 'startTime', { unique: false })
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })
  }

  async saveLog(log: ExecutionLog): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readwrite')
      const store = transaction.objectStore(LOGS_STORE)
      const request = store.put(log)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getLog(id: string): Promise<ExecutionLog | undefined> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readonly')
      const store = transaction.objectStore(LOGS_STORE)
      const request = store.get(id)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllLogs(): Promise<ExecutionLog[]> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readonly')
      const store = transaction.objectStore(LOGS_STORE)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const logs = (request.result as ExecutionLog[]).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        resolve(logs)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getLogsByTaskId(taskId: string): Promise<ExecutionLog[]> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readonly')
      const store = transaction.objectStore(LOGS_STORE)
      const index = store.index('taskId')
      const request = index.getAll(taskId)
      
      request.onsuccess = () => {
        const logs = (request.result as ExecutionLog[]).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        resolve(logs)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getLogsByDateRange(startDate: Date, endDate: Date): Promise<ExecutionLog[]> {
    const allLogs = await this.getAllLogs()
    return allLogs.filter(log => {
      const logDate = new Date(log.startTime)
      return logDate >= startDate && logDate <= endDate
    })
  }

  async deleteLog(id: string): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readwrite')
      const store = transaction.objectStore(LOGS_STORE)
      const request = store.delete(id)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteLogsByTaskId(taskId: string): Promise<void> {
    const logs = await this.getLogsByTaskId(taskId)
    for (const log of logs) {
      await this.deleteLog(log.id)
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readwrite')
      const store = transaction.objectStore(LOGS_STORE)
      const request = store.clear()
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export const logStorage = new LogStorage()
