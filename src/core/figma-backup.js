#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const chalk = require('chalk');
const ora = require('ora');
const moment = require('moment');

// 引入自定義模組
const FigmaApiWrapper = require('../integrations/figma-api-wrapper');
const DropboxSync = require('../integrations/dropbox-sync');
const NotionUpdater = require('../integrations/notion-updater');
const ObsidianSync = require('../integrations/obsidian-sync');
const Logger = require('../utils/logger');
const NotificationService = require('../utils/notification-service');
const ConfigManager = require('./config-manager');

/**
 * Figma 自動化備份系統主類別
 * Main Figma Automated Backup System Class
 */
class FigmaBackupSystem {
  constructor() {
    this.executionId = uuidv4();
    this.startTime = Date.now();
    this.config = null;
    this.logger = null;
    this.notificationService = null;
    this.services = {};
    this.results = {
      execution_id: this.executionId,
      start_time: this.startTime,
      end_time: null,
      duration: null,
      success: false,
      targets: [],
      downloads: [],
      uploads: [],
      syncs: [],
      errors: [],
      summary: {}
    };
  }

  /**
   * 初始化系統
   * Initialize system
   */
  async initialize() {
    try {
      console.log(chalk.blue('🚀 初始化 Figma 自動化備份系統...'));
      
      // 載入配置
      const configManager = new ConfigManager();
      this.config = await configManager.loadConfig();
      
      // 初始化日誌系統
      this.logger = new Logger({
        level: this.config.advanced.logLevel || 'info',
        logDir: './logs'
      });
      
      // 初始化通知服務
      this.notificationService = new NotificationService(this.config.notifications);
      
      // 初始化所有服務
      await this.initializeServices();
      
      this.logger.start('Figma 自動化備份系統初始化完成', {
        executionId: this.executionId,
        configPath: configManager.configPath
      });
      
      return true;
    } catch (error) {
      console.error(chalk.red('❌ 系統初始化失敗:'), error.message);
      throw error;
    }
  }

  /**
   * 初始化所有服務
   * Initialize all services
   */
  async initializeServices() {
    try {
      // Figma API 包裝器
      this.services.figma = new FigmaApiWrapper(this.config.figma, this.logger);
      
      // Dropbox 同步服務
      if (this.config.dropbox && this.config.dropbox.enabled) {
        this.services.dropbox = new DropboxSync(this.config.dropbox, this.logger);
      }
      
      // Notion 更新服務
      if (this.config.notion && this.config.notion.enabled) {
        this.services.notion = new NotionUpdater(this.config.notion, this.logger);
      }
      
      // Obsidian 同步服務
      if (this.config.obsidian && this.config.obsidian.enabled) {
        this.services.obsidian = new ObsidianSync(this.config.obsidian, this.logger);
      }
      
      this.logger.info('🔧 所有服務已初始化');
    } catch (error) {
      throw new Error(`服務初始化失敗: ${error.message}`);
    }
  }

  /**
   * 驗證所有服務連線
   * Validate all service connections
   */
  async validateServices() {
    const validations = [];
    
    try {
      // 驗證 Figma API
      const figmaValidation = await this.services.figma.validateToken();
      validations.push({ service: 'Figma', ...figmaValidation });
      
      // 驗證 Dropbox
      if (this.services.dropbox) {
        const dropboxValidation = await this.services.dropbox.validateConnection();
        validations.push({ service: 'Dropbox', ...dropboxValidation });
      }
      
      // 驗證 Notion
      if (this.services.notion) {
        const notionValidation = await this.services.notion.validateConnection();
        validations.push({ service: 'Notion', ...notionValidation });
      }
      
      // 驗證 Obsidian
      if (this.services.obsidian) {
        const obsidianValidation = await this.services.obsidian.validateVault();
        validations.push({ service: 'Obsidian', ...obsidianValidation });
      }
      
      const allValid = validations.every(v => v.valid);
      
      if (allValid) {
        this.logger.success('所有服務驗證通過');
      } else {
        const failedServices = validations.filter(v => !v.valid).map(v => v.service);
        this.logger.warn(`部分服務驗證失敗: ${failedServices.join(', ')}`);
      }
      
      return { success: allValid, validations };
    } catch (error) {
      this.logger.error('服務驗證過程中發生錯誤', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 執行主要備份流程
   * Execute main backup process
   */
  async run() {
    try {
      await this.initialize();
      
      // 發送開始通知
      await this.notificationService.notifyBackupStart(this.config.backup.targets);
      
      // 驗證服務
      const validation = await this.validateServices();
      if (!validation.success) {
        throw new Error('服務驗證失敗，無法繼續執行備份');
      }
      
      // 執行備份
      this.results.targets = this.config.backup.targets;
      this.results.downloads = await this.downloadFigmaFiles(this.config.backup.targets);
      
      // 上傳到 Dropbox
      if (this.services.dropbox) {
        this.results.uploads = await this.uploadToDropbox(this.results.downloads);
      }
      
      // 更新 Notion
      if (this.services.notion) {
        this.results.syncs.push(await this.updateNotionDatabase(this.results));
      }
      
      // 同步 Obsidian
      if (this.services.obsidian) {
        this.results.syncs.push(await this.syncObsidianVault(this.results));
      }
      
      // 完成處理
      this.results.end_time = Date.now();
      this.results.duration = this.results.end_time - this.results.start_time;
      this.results.success = this.results.downloads.some(d => d.success);
      this.results.summary = this.generateSummary();
      
      // 儲存執行報告
      await this.saveExecutionReport();
      
      // 顯示結果
      this.displayResults();
      
      // 發送完成通知
      await this.notificationService.notifyBackupComplete(this.results.downloads);
      
      return this.results;
    } catch (error) {
      this.results.success = false;
      this.results.errors.push(error.message);
      this.logger.error('備份執行失敗', { error: error.message });
      
      await this.notificationService.notifyBackupError(error);
      throw error;
    }
  }

  /**
   * 下載 Figma 檔案
   * Download Figma files
   */
  async downloadFigmaFiles(urls) {
    const downloads = [];
    
    this.logger.info(`開始下載 ${urls.length} 個 Figma 目標`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const spinner = ora(`📥 下載 Figma 檔案 (${i + 1}/${urls.length})`).start();

      try {
        const result = await this.services.figma.downloadFromUrl(url, {
          outputDir: this.config.backup.output_dir || this.config.backup.outputDir,
          createTimestampFolder: this.config.backup.create_timestamp_folder || this.config.backup.createTimestampFolder
        });

        downloads.push({
          url,
          success: true,
          files: result.files,
          output_path: result.outputPath,
          timestamp: new Date().toISOString()
        });

        spinner.succeed(`✅ 成功下載: ${result.files.length} 個檔案`);
        this.logger.success(`下載完成: ${url}`, { filesCount: result.files.length });
      } catch (error) {
        downloads.push({
          url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        spinner.fail(`❌ 下載失敗: ${error.message}`);
        this.logger.error(`下載失敗: ${url}`, { error: error.message });
      }
    }

    return downloads;
  }

  /**
   * 上傳到 Dropbox
   * Upload to Dropbox
   */
  async uploadToDropbox(figmaDownloads) {
    const uploads = [];
    const spinner = ora('☁️ 上傳到 Dropbox...').start();

    try {
      for (const download of figmaDownloads) {
        if (download.success && download.output_path) {
          const result = await this.services.dropbox.syncBackupResults([download]);
          uploads.push({
            source: download.output_path,
            success: result.success,
            remoteFolder: result.remoteFolder,
            timestamp: new Date().toISOString(),
            error: result.error
          });
        }
      }

      const successCount = uploads.filter(u => u.success).length;
      spinner.succeed(`✅ Dropbox 上傳完成: ${successCount}/${uploads.length}`);
      
      return uploads;
    } catch (error) {
      spinner.fail(`❌ Dropbox 上傳失敗: ${error.message}`);
      this.logger.error('Dropbox 上傳失敗', { error: error.message });
      
      return [{
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }];
    }
  }

  /**
   * 更新 Notion 資料庫
   * Update Notion database
   */
  async updateNotionDatabase(results) {
    const spinner = ora('📊 更新 Notion 資料庫...').start();

    try {
      const syncResult = await this.services.notion.syncBackupResults([results]);
      
      spinner.succeed('✅ Notion 資料庫更新完成');
      
      return {
        type: 'notion',
        success: syncResult.success,
        details: `更新了 ${syncResult.results?.length || 0} 筆記錄`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      spinner.fail(`❌ Notion 更新失敗: ${error.message}`);
      this.logger.error('Notion 更新失敗', { error: error.message });
      
      return {
        type: 'notion',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 同步 Obsidian 知識庫
   * Sync Obsidian vault
   */
  async syncObsidianVault(results) {
    const spinner = ora('📝 同步 Obsidian 知識庫...').start();

    try {
      const syncResult = await this.services.obsidian.syncBackupResults([results]);
      
      spinner.succeed('✅ Obsidian 知識庫同步完成');
      
      return {
        type: 'obsidian',
        success: syncResult.success,
        details: `同步了 ${syncResult.results?.length || 0} 個檔案`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      spinner.fail(`❌ Obsidian 同步失敗: ${error.message}`);
      this.logger.error('Obsidian 同步失敗', { error: error.message });
      
      return {
        type: 'obsidian',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 生成執行摘要
   * Generate execution summary
   */
  generateSummary() {
    const summary = {
      execution_id: this.executionId,
      total_targets: this.results.targets.length,
      successful_downloads: this.results.downloads.filter(d => d.success).length,
      failed_downloads: this.results.downloads.filter(d => !d.success).length,
      total_files: this.results.downloads.reduce((sum, d) => sum + (d.files?.length || 0), 0),
      duration: moment.duration(this.results.duration).humanize(),
      duration_ms: this.results.duration,
      services: {},
      errors: this.results.errors
    };

    // 服務同步狀態
    this.results.syncs.forEach(sync => {
      summary.services[sync.type] = {
        success: sync.success,
        details: sync.details,
        error: sync.error
      };
    });

    // Dropbox 上傳狀態
    if (this.results.uploads.length > 0) {
      summary.services.dropbox = {
        success: this.results.uploads.some(u => u.success),
        uploaded_count: this.results.uploads.filter(u => u.success).length,
        total_count: this.results.uploads.length
      };
    }

    return summary;
  }

  /**
   * 儲存執行報告
   * Save execution report
   */
  async saveExecutionReport() {
    try {
      const reportsDir = './reports';
      await fs.ensureDir(reportsDir);
      
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const reportPath = path.join(reportsDir, `backup-report-${timestamp}.json`);
      
      const report = {
        ...this.results,
        generated_at: new Date().toISOString(),
        system_info: {
          node_version: process.version,
          platform: process.platform,
          arch: process.arch
        }
      };
      
      await fs.writeJson(reportPath, report, { spaces: 2 });
      
      this.logger.fileOperation('SAVE', reportPath, true, {
        type: 'execution_report',
        executionId: this.executionId
      });
      
      return reportPath;
    } catch (error) {
      this.logger.error('儲存執行報告失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 顯示執行結果
   * Display execution results
   */
  displayResults() {
    const summary = this.results.summary;
    
    console.log('\n' + chalk.blue('=' .repeat(60)));
    console.log(chalk.blue.bold('📋 Figma 自動化備份執行結果'));
    console.log(chalk.blue('=' .repeat(60)));
    
    // 基本資訊
    console.log(chalk.cyan('\n🔍 執行資訊:'));
    console.log(`   執行 ID: ${chalk.yellow(this.executionId)}`);
    console.log(`   開始時間: ${chalk.gray(moment(this.results.start_time).format('YYYY-MM-DD HH:mm:ss'))}`);
    console.log(`   結束時間: ${chalk.gray(moment(this.results.end_time).format('YYYY-MM-DD HH:mm:ss'))}`);
    console.log(`   執行時間: ${chalk.green(summary.duration)}`);
    console.log(`   整體狀態: ${this.results.success ? chalk.green('✅ 成功') : chalk.red('❌ 失敗')}`);
    
    // 下載統計
    console.log(chalk.cyan('\n📥 下載統計:'));
    console.log(`   目標數量: ${chalk.blue(summary.total_targets)}`);
    console.log(`   成功下載: ${chalk.green(summary.successful_downloads)}`);
    console.log(`   失敗下載: ${chalk.red(summary.failed_downloads)}`);
    console.log(`   總檔案數: ${chalk.blue(summary.total_files)}`);
    
    // 服務同步狀態
    console.log(chalk.cyan('\n🔄 服務同步狀態:'));
    Object.entries(summary.services).forEach(([service, status]) => {
      const icon = status.success ? '✅' : '❌';
      const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
      console.log(`   ${serviceName}: ${icon} ${status.details || (status.success ? '成功' : '失敗')}`);
      if (status.error) {
        console.log(`     ${chalk.red('錯誤:')} ${status.error}`);
      }
    });
    
    // 錯誤記錄
    if (this.results.errors.length > 0) {
      console.log(chalk.cyan('\n❌ 錯誤記錄:'));
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${chalk.red(error)}`);
      });
    }
    
    console.log(chalk.blue('\n' + '=' .repeat(60)));
    console.log(chalk.green('🎉 備份流程執行完成！'));
    console.log(chalk.blue('=' .repeat(60) + '\n'));
  }
}

// 主執行函數
async function main() {
  try {
    const backupSystem = new FigmaBackupSystem();
    await backupSystem.run();
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('\n❌ 系統執行失敗:'), error.message);
    process.exit(1);
  }
}

// 如果直接執行此檔案
if (require.main === module) {
  main();
}

module.exports = FigmaBackupSystem;