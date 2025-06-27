const notifier = require('node-notifier');
const { execSync } = require('child_process');
const chalk = require('chalk');
const path = require('path');

/**
 * 通知服務 - 支援系統通知、聲音提醒等功能
 * Notification Service - Supports system notifications, sound alerts, etc.
 */
class NotificationService {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      sound: options.sound !== false,
      onStart: options.onStart !== false,
      onComplete: options.onComplete !== false,
      onError: options.onError !== false,
      appName: options.appName || 'Figma Backup',
      ...options
    };

    this.sounds = {
      success: 'Glass',
      error: 'Sosumi',
      warning: 'Funk',
      info: 'Blow'
    };
  }

  /**
   * 發送系統通知
   * Send system notification
   */
  async notify(title, message, type = 'info', options = {}) {
    if (!this.options.enabled) return;

    try {
      const notificationOptions = {
        title: title,
        message: message,
        icon: this.getIcon(type),
        sound: this.options.sound ? this.sounds[type] || this.sounds.info : false,
        timeout: options.timeout || 5000,
        appName: this.options.appName,
        ...options
      };

      // 在 macOS 上使用系統通知
      if (process.platform === 'darwin') {
        await this.sendMacNotification(notificationOptions);
      } else {
        // 其他平台使用 node-notifier
        notifier.notify(notificationOptions);
      }

      // 控制台輸出
      this.logNotification(title, message, type);
    } catch (error) {
      console.error(chalk.red('❌ 發送通知失敗:'), error.message);
    }
  }

  /**
   * 發送 macOS 系統通知
   * Send macOS system notification
   */
  async sendMacNotification(options) {
    try {
      const script = `
        display notification "${options.message}" ¬
        with title "${options.title}" ¬
        ${options.sound ? `sound name "${options.sound}"` : ''}
      `;
      
      execSync(`osascript -e '${script}'`, { stdio: 'ignore' });
    } catch (error) {
      // 如果 AppleScript 失敗，回退到 node-notifier
      notifier.notify(options);
    }
  }

  /**
   * 取得通知圖示
   * Get notification icon
   */
  getIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * 記錄通知到控制台
   * Log notification to console
   */
  logNotification(title, message, type) {
    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue
    };
    
    const color = colors[type] || colors.info;
    const icon = this.getIcon(type);
    
    console.log(color(`${icon} ${title}: ${message}`));
  }

  /**
   * 備份開始通知
   * Backup start notification
   */
  async notifyBackupStart(targets) {
    if (!this.options.onStart) return;

    const targetCount = Array.isArray(targets) ? targets.length : 1;
    await this.notify(
      '🚀 Figma 備份開始',
      `開始備份 ${targetCount} 個目標`,
      'info'
    );
  }

  /**
   * 備份完成通知
   * Backup complete notification
   */
  async notifyBackupComplete(results) {
    if (!this.options.onComplete) return;

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    if (successCount === totalCount) {
      await this.notify(
        '🎉 備份完成',
        `成功備份 ${successCount} 個目標`,
        'success'
      );
    } else {
      await this.notify(
        '⚠️ 備份部分完成',
        `成功 ${successCount}/${totalCount} 個目標`,
        'warning'
      );
    }
  }

  /**
   * 備份錯誤通知
   * Backup error notification
   */
  async notifyBackupError(error, context = '') {
    if (!this.options.onError) return;

    await this.notify(
      '❌ 備份失敗',
      `${context ? context + ': ' : ''}${error.message}`,
      'error'
    );
  }

  /**
   * 服務同步通知
   * Service sync notification
   */
  async notifyServiceSync(serviceName, success, details = '') {
    const title = success ? 
      `✅ ${serviceName} 同步成功` : 
      `❌ ${serviceName} 同步失敗`;
    
    await this.notify(
      title,
      details || (success ? '資料已成功同步' : '同步過程中發生錯誤'),
      success ? 'success' : 'error'
    );
  }

  /**
   * 進度通知
   * Progress notification
   */
  async notifyProgress(current, total, operation = '處理中') {
    const percentage = Math.round((current / total) * 100);
    
    // 只在特定進度點發送通知（避免過多通知）
    if (percentage % 25 === 0 || current === total) {
      await this.notify(
        `📊 ${operation}進度`,
        `已完成 ${current}/${total} (${percentage}%)`,
        'info',
        { timeout: 2000 }
      );
    }
  }

  /**
   * 檔案上傳通知
   * File upload notification
   */
  async notifyFileUpload(fileName, service, success) {
    const title = success ? 
      `📤 檔案上傳成功` : 
      `❌ 檔案上傳失敗`;
    
    await this.notify(
      title,
      `${fileName} → ${service}`,
      success ? 'success' : 'error'
    );
  }

  /**
   * 配置更新通知
   * Configuration update notification
   */
  async notifyConfigUpdate(changes) {
    await this.notify(
      '⚙️ 配置已更新',
      `已更新 ${Object.keys(changes).length} 項設定`,
      'info'
    );
  }

  /**
   * 播放系統聲音
   * Play system sound
   */
  async playSound(soundName = 'Glass') {
    if (!this.options.sound) return;

    try {
      if (process.platform === 'darwin') {
        execSync(`afplay /System/Library/Sounds/${soundName}.aiff`, { stdio: 'ignore' });
      } else if (process.platform === 'win32') {
        // Windows 系統聲音
        execSync(`powershell -c (New-Object Media.SoundPlayer "C:\\Windows\\Media\\${soundName}.wav").PlaySync()`, { stdio: 'ignore' });
      }
    } catch (error) {
      // 忽略聲音播放錯誤
    }
  }

  /**
   * 設定通知選項
   * Set notification options
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }

  /**
   * 啟用/停用通知
   * Enable/disable notifications
   */
  setEnabled(enabled) {
    this.options.enabled = enabled;
  }

  /**
   * 啟用/停用聲音
   * Enable/disable sound
   */
  setSound(enabled) {
    this.options.sound = enabled;
  }

  /**
   * 測試通知
   * Test notification
   */
  async testNotification() {
    await this.notify(
      '🧪 通知測試',
      '如果您看到這個通知，表示通知系統運作正常',
      'info'
    );
  }

  /**
   * 批量通知
   * Batch notifications
   */
  async notifyBatch(notifications) {
    for (const notification of notifications) {
      await this.notify(
        notification.title,
        notification.message,
        notification.type || 'info',
        notification.options || {}
      );
      
      // 避免通知過於頻繁
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * 清理通知歷史
   * Clear notification history
   */
  clearHistory() {
    // 在支援的平台上清理通知歷史
    try {
      if (process.platform === 'darwin') {
        // macOS 清理通知中心
        execSync('killall NotificationCenter', { stdio: 'ignore' });
      }
    } catch (error) {
      // 忽略清理錯誤
    }
  }
}

module.exports = NotificationService;