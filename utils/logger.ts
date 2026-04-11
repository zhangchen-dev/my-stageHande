import winston from 'winston'
import path from 'path'
import { PATHS } from './file'

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      }`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: path.join(PATHS.LOGS, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(PATHS.LOGS, 'all.log') 
    }),
  ],
})