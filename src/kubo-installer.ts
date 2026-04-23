/**
 * DIAP TypeScript SDK - Kubo 安装器
 * 自动下载和安装 Kubo（Go-IPFS）二进制文件
 */

import { logger } from './utils/logger.js';

/**
 * Kubo 安装状态
 */
export enum InstallationStatus {
  /** 未知 */
  Unknown = 'unknown',
  /** 检查中 */
  Checking = 'checking',
  /** 已安装 */
  Installed = 'installed',
  /** 下载中 */
  Downloading = 'downloading',
  /** 安装中 */
  Installing = 'installing',
  /** 安装失败 */
  Failed = 'failed',
}

/**
 * Kubo 安装结果
 */
export interface InstallationResult {
  /** 是否成功 */
  success: boolean;
  /** Kubo 路径 */
  path?: string;
  /** 版本 */
  version?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * Kubo 版本信息
 */
export interface KuboVersion {
  /** 版本号 */
  version: string;
  /** 发布日期 */
  releaseDate: string;
  /** 下载链接 */
  downloadUrl: string;
}

/**
 * Kubo 安装器配置
 */
export interface KuboInstallerConfig {
  /** 安装目录 */
  installDir?: string;
  /** 是否强制重新安装 */
  forceReinstall?: boolean;
  /** 下载超时（毫秒） */
  downloadTimeout?: number;
  /** 代理 URL */
  proxyUrl?: string;
}

/**
 * Kubo 安装器
 */
export class KuboInstaller {
  private config: Required<KuboInstallerConfig>;
  private platform: string;
  private arch: string;

  /**
   * 创建 Kubo 安装器
   */
  constructor(config?: KuboInstallerConfig) {
    this.config = {
      installDir: config?.installDir || this.getDefaultInstallDir(),
      forceReinstall: config?.forceReinstall || false,
      downloadTimeout: config?.downloadTimeout || 300000, // 5 分钟
      proxyUrl: config?.proxyUrl || '',
    };

    // 检测平台
    this.platform = this.detectPlatform();
    this.arch = this.detectArch();

    logger.info(`🔧 Kubo 安装器已创建`);
    logger.info(`  平台: ${this.platform}/${this.arch}`);
    logger.info(`  安装目录: ${this.config.installDir}`);
  }

  /**
   * 检查 Kubo 是否已安装
   */
  public async checkInstalled(): Promise<boolean> {
    logger.info('🔍 检查 Kubo 安装状态...');

    // 在 TypeScript 环境中，我们无法直接检查文件系统
    // 这里返回 false，让调用者决定是否安装
    logger.info('⚠️  无法在浏览器环境中检查 Kubo 安装状态');
    return false;
  }

  /**
   * 获取 Kubo 版本
   */
  public async getVersion(): Promise<string | null> {
    logger.info('🔍 获取 Kubo 版本...');

    // 在 TypeScript 环境中，我们无法执行系统命令
    // 这里返回 null
    logger.info('⚠️  无法在浏览器环境中获取 Kubo 版本');
    return null;
  }

  /**
   * 安装 Kubo
   */
  public async install(): Promise<InstallationResult> {
    logger.info('🚀 开始安装 Kubo...');

    try {
      // 检查是否已安装
      const isInstalled = await this.checkInstalled();
      if (isInstalled && !this.config.forceReinstall) {
        const version = await this.getVersion();
        return {
          success: true,
          path: 'kubo',
          version: version || undefined,
        };
      }

      // 获取下载链接
      const downloadUrl = this.getDownloadUrl();
      logger.info(`📥 下载链接: ${downloadUrl}`);

      // 下载（简化版本 - 在实际环境中需要使用 fetch 或其他下载方式）
      logger.info('⚠️  在浏览器环境中无法自动下载 Kubo');
      logger.info('   请手动下载并安装 Kubo: https://github.com/ipfs/kubo/releases');

      return {
        success: false,
        error: '浏览器环境中无法自动安装 Kubo，请手动安装',
      };
    } catch (error) {
      logger.error(`❌ Kubo 安装失败: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 卸载 Kubo
   */
  public async uninstall(): Promise<boolean> {
    logger.info('🧹 尝试卸载 Kubo...');

    // 在 TypeScript 环境中，我们无法删除系统文件
    logger.info('⚠️  在浏览器环境中无法卸载 Kubo');
    return false;
  }

  /**
   * 获取下载链接
   */
  public getDownloadUrl(): string {
    const version = 'v0.28.0'; // 默认版本
    const ext = this.platform === 'windows' ? '.zip' : '.tar.gz';
    const binary = this.platform === 'windows' ? 'ipfs.exe' : 'ipfs';

    return `https://github.com/ipfs/kubo/releases/download/${version}/kubo_${this.platform}-${this.arch}${ext}`;
  }

  /**
   * 获取默认安装目录
   */
  private getDefaultInstallDir(): string {
    // 尝试检测系统类型
    if (typeof navigator !== 'undefined' && navigator.platform) {
      if (navigator.platform.includes('Win')) {
        return 'C:\\Program Files\\Kubo';
      } else if (navigator.platform.includes('Mac')) {
        return '/usr/local/bin';
      } else if (navigator.platform.includes('Linux')) {
        return '/usr/local/bin';
      }
    }
    return './bin';
  }

  /**
   * 检测平台
   */
  private detectPlatform(): string {
    if (typeof navigator !== 'undefined' && navigator.platform) {
      const platform = navigator.platform.toLowerCase();
      if (platform.includes('win') || platform.includes('nt')) {
        return 'windows';
      } else if (platform.includes('mac') || platform.includes('darwin')) {
        return 'darwin';
      } else if (platform.includes('linux')) {
        return 'linux';
      }
    }
    return 'linux'; // 默认
  }

  /**
   * 检测架构
   */
  private detectArch(): string {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('arm64') || ua.includes('aarch64')) {
        return 'arm64';
      } else if (ua.includes('x64') || ua.includes('amd64')) {
        return 'amd64';
      } else if (ua.includes('x86') || ua.includes('ia32')) {
        return '386';
      } else if (ua.includes('arm')) {
        return 'arm';
      }
    }
    return 'amd64'; // 默认
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 Kubo 安装器
 */
export function createKuboInstaller(config?: KuboInstallerConfig): KuboInstaller {
  return new KuboInstaller(config);
}

/**
 * 检查 Kubo 是否已安装
 */
export async function isKuboInstalled(): Promise<boolean> {
  const installer = new KuboInstaller();
  return installer.checkInstalled();
}

/**
 * 安装 Kubo
 */
export async function installKubo(config?: KuboInstallerConfig): Promise<InstallationResult> {
  const installer = new KuboInstaller(config);
  return installer.install();
}

// ============================================================================
// 导出
// ============================================================================
