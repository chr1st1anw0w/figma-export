const winston = require('winston');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

/**
 * 日誌記錄系統 - 提供不同層級的日誌記錄功能
 * Logger System - Provides different levels of logging functionality
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      level: options.level || 'info',
      logDir: options.logDir || './logs',
      enableConsole: options.enableConsole !== false,
      enableFile: options.enableFile !== false,
      maxFiles: options.maxFiles || 5,
      maxSize: options.maxSize || '10m',
      ...options
    };

    this.setupLogger();
  }

  /**
   * 設定 Winston Logger
   * Setup Winston Logger
   */
  async setupLogger() {
    // 確保日誌目錄存在
    if (this.options.enableFile) {
      await fs.ensureDir(this.options.logDir);
    }

    // 定義日誌格式
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // 控制台格式
    const consoleFormat = winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const coloredLevel = this.colorizeLevel(level);
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${chalk.gray(timestamp)} ${coloredLevel} ${message}${metaStr}`;
      })
    );

    // 建立傳輸器
    const transports = [];

    // 控制台輸出
    if (this.options.enableConsole) {
      transports.push(
        new winston.transports.Console({
          level: this.options.level,
          format: consoleFormat
        })
      );
    }

    // 檔案輸出
    if (this.options.enableFile) {
      // 一般日誌檔案
      transports.push(
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'app.log'),
          level: this.options.level,
          format: logFormat,
          maxsize: this.options.maxSize,
          maxFiles: this.options.maxFiles
        })
      );

      // 錯誤日誌檔案
      transports.push(
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: this.options.maxSize,
          maxFiles: this.options.maxFiles
        })
      );
    }

    // 建立 Winston Logger
    this.winston = winston.createLogger({
      level: this.options.level,
      format: logFormat,
      transports,
      exitOnError: false
    });
  }

  /**
   * 為日誌等級添加顏色
   * Colorize log levels
   */
  colorizeLevel(level) {
    const colors = {
      error: chalk.red('❌ ERROR'),
      warn: chalk.yellow('⚠️  WARN '),
      info: chalk.blue('ℹ️  INFO '),
      debug: chalk.gray('🔍 DEBUG'),
      verbose: chalk.cyan('📝 VERBOSE')
    };
    return colors[level] || level.toUpperCase();
  }

  /**
   * 記錄錯誤
   * Log error
   */
  error(message, meta = {}) {
    this.winston.error(message, meta);
  }

  /**
   * 記錄警告
   * Log warning
   */
  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }

  /**
   * 記錄資訊
   * Log info
   */
  info(message, meta = {}) {
    this.winston.info(message, meta);
  }

  /**
   * 記錄除錯資訊
   * Log debug
   */
  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }

  /**
   * 記錄詳細資訊
   * Log verbose
   */
  verbose(message, meta = {}) {
    this.winston.verbose(message, meta);
  }

  /**
   * 記錄成功訊息
   * Log success message
   */
  success(message, meta = {}) {
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.green('✅ SUCCESS')} ${message}`);
    }
    this.winston.info(`SUCCESS: ${message}`, meta);
  }

  /**
   * 記錄開始訊息
   * Log start message
   */
  start(message, meta = {}) {
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.blue('🚀 START')} ${message}`);
    }
    this.winston.info(`START: ${message}`, meta);
  }

  /**
   * 記錄完成訊息
   * Log complete message
   */
  complete(message, meta = {}) {
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.green('🎉 COMPLETE')} ${message}`);
    }
    this.winston.info(`COMPLETE: ${message}`, meta);
  }

  /**
   * 記錄進度訊息
   * Log progress message
   */
  progress(message, current, total, meta = {}) {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(current, total);
    const progressMessage = `${message} ${progressBar} ${current}/${total} (${percentage}%)`;
    
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.cyan('📊 PROGRESS')} ${progressMessage}`);
    }
    this.winston.info(`PROGRESS: ${progressMessage}`, { current, total, percentage, ...meta });
  }

  /**
   * 建立進度條
   * Create progress bar
   */
  createProgressBar(current, total, length = 20) {
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  /**
   * 記錄 API 呼叫
   * Log API call
   */
  apiCall(method, url, status, duration, meta = {}) {
    const statusColor = status >= 400 ? chalk.red : status >= 300 ? chalk.yellow : chalk.green;
    const message = `${method.toUpperCase()} ${url} ${statusColor(status)} ${duration}ms`;
    
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.magenta('🌐 API')} ${message}`);
    }
    this.winston.info(`API: ${message}`, { method, url, status, duration, ...meta });
  }

  /**
   * 記錄檔案操作
   * Log file operation
   */
  fileOperation(operation, filePath, success = true, meta = {}) {
    const icon = success ? '📁' : '❌';
    const status = success ? 'SUCCESS' : 'FAILED';
    const message = `${operation} ${filePath} - ${status}`;
    
    if (this.options.enableConsole) {
      console.log(`${chalk.gray(new Date().toLocaleTimeString())} ${chalk.blue(`${icon} FILE`)} ${message}`);
    }
    
    if (success) {
      this.winston.info(`FILE: ${message}`, { operation, filePath, ...meta });
    } else {
      this.winston.error(`FILE: ${message}`, { operation, filePath, ...meta });
    }
  }

  /**
   * 建立子 Logger
   * Create child logger
   */
  child(defaultMeta = {}) {
    return {
      error: (message, meta = {}) => this.error(message, { ...defaultMeta, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...defaultMeta, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...defaultMeta, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...defaultMeta, ...meta }),
      verbose: (message, meta = {}) => this.verbose(message, { ...defaultMeta, ...meta }),
      success: (message, meta = {}) => this.success(message, { ...defaultMeta, ...meta }),
      start: (message, meta = {}) => this.start(message, { ...defaultMeta, ...meta }),
      complete: (message, meta = {}) => this.complete(message, { ...defaultMeta, ...meta }),
      progress: (message, current, total, meta = {}) => this.progress(message, current, total, { ...defaultMeta, ...meta }),
      apiCall: (method, url, status, duration, meta = {}) => this.apiCall(method, url, status, duration, { ...defaultMeta, ...meta }),
      fileOperation: (operation, filePath, success, meta = {}) => this.fileOperation(operation, filePath, success, { ...defaultMeta, ...meta })
    };
  }

  /**
   * 設定日誌等級
   * Set log level
   */
  setLevel(level) {
    this.winston.level = level;
    this.options.level = level;
  }

  /**
   * 清理舊日誌檔案
   * Clean old log files
   */
  async cleanOldLogs(daysToKeep = 7) {
    if (!this.options.enableFile) return;

    try {
      const logFiles = await fs.readdir(this.options.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of logFiles) {
        const filePath = path.join(this.options.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          this.info(`已清理舊日誌檔案: ${file}`);
        }
      }
    } catch (error) {
      this.error('清理舊日誌檔案失敗', { error: error.message });
    }
  }
}

module.exports = Logger;