const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * 配置管理器 - 處理配置檔案的載入、驗證、預設值設定
 * Configuration Manager - Handles config file loading, validation, and default settings
 */
class ConfigManager {
  constructor(configPath = './backup-config.json') {
    this.configPath = path.resolve(configPath);
    this.config = null;
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * 載入配置檔案
   * Load configuration file
   */
  async loadConfig() {
    try {
      // 檢查配置檔案是否存在
      if (!await fs.pathExists(this.configPath)) {
        console.log(chalk.yellow('⚠️  配置檔案不存在，建立預設配置...'));
        await this.createDefaultConfig();
        return this.defaultConfig;
      }

      // 讀取配置檔案
      const configData = await fs.readJson(this.configPath);
      
      // 合併預設配置與使用者配置
      this.config = this.mergeConfigs(this.defaultConfig, configData);
      
      // 驗證配置
      const validation = this.validateConfig(this.config);
      if (!validation.isValid) {
        throw new Error(`配置驗證失敗: ${validation.errors.join(', ')}`);
      }

      console.log(chalk.green('✅ 配置檔案載入成功'));
      return this.config;
    } catch (error) {
      throw new Error(`載入配置檔案失敗: ${error.message}`);
    }
  }

  /**
   * 取得預設配置
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      figma: {
        token: "",
        email: "",
        password: ""
      },
      backup: {
        mode: "project",
        targets: [],
        outputDir: "./figma-backups",
        createTimestampFolder: true,
        autoOpenFolder: true,
        output_dir: "./figma-backups",
        create_timestamp_folder: true
      },
      dropbox: {
        token: "",
        app_folder: "/figma-backups",
        enabled: false
      },
      notion: {
        token: "",
        database_id: "",
        enabled: false
      },
      obsidian: {
        vault_path: "",
        enabled: false
      },
      advanced: {
        concurrency: 3,
        retryAttempts: 3,
        timeout: 30000,
        validateBackup: true,
        logLevel: "info"
      },
      notifications: {
        onStart: true,
        onComplete: true,
        onError: true,
        sound: true
      }
    };
  }

  /**
   * 建立預設配置檔案
   * Create default configuration file
   */
  async createDefaultConfig() {
    try {
      await fs.writeJson(this.configPath, this.defaultConfig, { spaces: 2 });
      console.log(chalk.blue('📄 已建立預設配置檔案:'), this.configPath);
      console.log(chalk.yellow('⚠️  請編輯配置檔案中的必要設定後重新執行'));
    } catch (error) {
      throw new Error(`建立預設配置檔案失敗: ${error.message}`);
    }
  }

  /**
   * 合併配置
   * Merge configurations
   */
  mergeConfigs(defaultConfig, userConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig));
    
    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        merged[key] = { ...merged[key], ...userConfig[key] };
      } else {
        merged[key] = userConfig[key];
      }
    }
    
    return merged;
  }

  /**
   * 驗證配置
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];

    // 驗證 Figma 配置
    if (!config.figma.token) {
      errors.push('Figma token 為必填項目');
    }

    // 驗證備份目標
    if (!config.backup.targets || config.backup.targets.length === 0) {
      errors.push('至少需要一個備份目標');
    }

    // 驗證輸出目錄
    if (!config.backup.outputDir && !config.backup.output_dir) {
      errors.push('輸出目錄為必填項目');
    }

    // 驗證進階設定
    if (config.advanced && config.advanced.concurrency) {
      if (config.advanced.concurrency < 1 || config.advanced.concurrency > 10) {
        errors.push('並發數量必須在 1-10 之間');
      }
    }

    if (config.advanced && config.advanced.timeout) {
      if (config.advanced.timeout < 5000) {
        errors.push('超時時間不能少於 5 秒');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 更新配置
   * Update configuration
   */
  async updateConfig(updates) {
    try {
      if (!this.config) {
        await this.loadConfig();
      }

      // 合併更新
      this.config = this.mergeConfigs(this.config, updates);
      
      // 驗證更新後的配置
      const validation = this.validateConfig(this.config);
      if (!validation.isValid) {
        throw new Error(`配置驗證失敗: ${validation.errors.join(', ')}`);
      }

      // 儲存配置
      await fs.writeJson(this.configPath, this.config, { spaces: 2 });
      console.log(chalk.green('✅ 配置已更新並儲存'));
      
      return this.config;
    } catch (error) {
      throw new Error(`更新配置失敗: ${error.message}`);
    }
  }

  /**
   * 取得配置值
   * Get configuration value
   */
  get(key, defaultValue = null) {
    if (!this.config) {
      throw new Error('配置尚未載入，請先呼叫 loadConfig()');
    }

    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * 設定配置值
   * Set configuration value
   */
  set(key, value) {
    if (!this.config) {
      throw new Error('配置尚未載入，請先呼叫 loadConfig()');
    }

    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * 檢查服務是否啟用
   * Check if service is enabled
   */
  isServiceEnabled(serviceName) {
    return this.get(`${serviceName}.enabled`, false);
  }

  /**
   * 取得服務配置
   * Get service configuration
   */
  getServiceConfig(serviceName) {
    return this.get(serviceName, {});
  }

  /**
   * 顯示配置摘要
   * Display configuration summary
   */
  displaySummary() {
    if (!this.config) {
      console.log(chalk.red('❌ 配置尚未載入'));
      return;
    }

    console.log(chalk.blue('\n📋 配置摘要 | Configuration Summary'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(`🎯 備份模式: ${this.config.backup.mode}`);
    console.log(`📁 輸出目錄: ${this.config.backup.outputDir || this.config.backup.output_dir}`);
    console.log(`🎯 目標數量: ${this.config.backup.targets.length}`);
    
    // 服務狀態
    const services = ['dropbox', 'notion', 'obsidian'];
    services.forEach(service => {
      const enabled = this.isServiceEnabled(service);
      const status = enabled ? chalk.green('✅ 啟用') : chalk.gray('⚪ 停用');
      console.log(`${service.charAt(0).toUpperCase() + service.slice(1)}: ${status}`);
    });
    
    console.log(chalk.gray('─'.repeat(50)));
  }
}

module.exports = ConfigManager;