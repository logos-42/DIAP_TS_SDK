/**
 * 日志工具
 */

import winston from 'winston';

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志格式配置
 */
export interface LoggingConfig {
  level: LogLevel;
  format: 'json' | 'simple';
}

/**
 * 创建 Winston 日志器
 */
export function createLogger(config?: Partial<LoggingConfig>): winston.Logger {
  const level = config?.level || 'info';
  const format = config?.format || 'simple';

  const formats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ];

  if (format === 'json') {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, stack }) => {
        return `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}`;
      })
    );
  }

  return winston.createLogger({
    level,
    format: winston.format.combine(...formats),
    transports: [
      new winston.transports.Console({
        stderrLevels: ['error'],
      }),
    ],
  });
}

/**
 * 默认日志器实例
 */
export const logger = createLogger();
