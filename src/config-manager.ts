/**
 * DIAP TypeScript SDK - 配置管理模块
 * Decentralized Intelligent Agent Protocol
 * 负责加载、保存和管理 SDK 配置
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * SDK 配置
 */
export interface DIAPConfig {
  /** 智能体配置 */
  agent: AgentConfig;
  /** IPFS 配置 */
  ipfs: IpfsConfig;
  /** IPNS 配置 */
  ipns: IpnsConfig;
  /** 缓存配置 */
  cache: CacheConfig;
  /** 日志配置 */
  logging: LoggingConfig;
}

/**
 * 智能体配置
 */
export interface AgentConfig {
  /** 智能体名称 */
  name: string;
  /** 私钥文件路径 */
  privateKeyPath: string;
  /** 是否自动生成密钥（如果文件不存在） */
  autoGenerateKey: boolean;
}

/**
 * IPFS 配置
 */
export interface IpfsConfig {
  /** AWS IPFS 节点 API 地址（优先） */
  awsApiUrl?: string;
  /** AWS IPFS 网关地址 */
  awsGatewayUrl?: string;
  /** Pinata API 密钥（备用） */
  pinataApiKey?: string;
  /** Pinata API 密钥 */
  pinataApiSecret?: string;
  /** 超时时间（秒） */
  timeoutSeconds: number;
}

/**
 * IPNS 配置
 */
export interface IpnsConfig {
  /** 是否使用 w3name（优先） */
  useW3name: boolean;
  /** 是否使用 IPFS 节点（备用） */
  useIpfsNode: boolean;
  /** IPNS 记录有效期（天） */
  validityDays: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled: boolean;
  /** 缓存 TTL（秒） */
  ttlSeconds: number;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 缓存目录 */
  cacheDir?: string;
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 日志级别: trace, debug, info, warn, error */
  level: string;
}

// ============================================================================
// 默认值
// ============================================================================

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_IPNS_VALIDITY_DAYS = 365;
const DEFAULT_CACHE_TTL_SECONDS = 21600; // 6小时
const DEFAULT_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_LOG_LEVEL = 'info';

/**
 * 获取默认配置文件路径
 */
export function getDefaultConfigPath(): string {
  // 在 Node.js 中使用 home 目录
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, '.config', 'diap-ts-sdk', 'config.json');
}

/**
 * 获取默认数据目录
 */
export function getDefaultDataDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, '.local', 'share', 'diap-ts-sdk');
}

/**
 * 获取默认缓存目录
 */
export function getDefaultCacheDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, '.cache', 'diap-ts-sdk');
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 创建默认配置
 */
export function createDefaultConfig(): DIAPConfig {
  const dataDir = getDefaultDataDir();
  const cacheDir = getDefaultCacheDir();

  return {
    agent: {
      name: 'DIAP Agent',
      privateKeyPath: path.join(dataDir, 'keys', 'agent.key'),
      autoGenerateKey: true,
    },
    ipfs: {
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    },
    ipns: {
      useW3name: true,
      useIpfsNode: true,
      validityDays: DEFAULT_IPNS_VALIDITY_DAYS,
    },
    cache: {
      enabled: true,
      ttlSeconds: DEFAULT_CACHE_TTL_SECONDS,
      maxEntries: DEFAULT_CACHE_MAX_ENTRIES,
      cacheDir: cacheDir,
    },
    logging: {
      level: DEFAULT_LOG_LEVEL,
    },
  };
}

// ============================================================================
// ConfigManager 类
// ============================================================================

/**
 * 配置管理器
 */
export class ConfigManager {
  private config: DIAPConfig;
  private configPath: string;

  /**
   * 创建配置管理器
   */
  private constructor(config: DIAPConfig, configPath: string) {
    this.config = config;
    this.configPath = configPath;
    logger.debug(`配置管理器已创建，路径: ${configPath}`);
  }

  /**
   * 从文件加载配置
   */
  public static fromFile(configPath: string): ConfigManager {
    logger.info(`从文件加载配置: ${configPath}`);

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as DIAPConfig;
        logger.info('配置加载成功');
        return new ConfigManager(config, configPath);
      } else {
        logger.warn(`配置文件不存在: ${configPath}`);
        throw new Error(`配置文件不存在: ${configPath}`);
      }
    } catch (error) {
      logger.error(`加载配置失败: ${error}`);
      throw error;
    }
  }

  /**
   * 创建或加载配置
   */
  public static async load(): Promise<ConfigManager> {
    const configPath = getDefaultConfigPath();

    logger.info(`加载配置，路径: ${configPath}`);

    if (fs.existsSync(configPath)) {
      return ConfigManager.fromFile(configPath);
    }

    // 创建默认配置并保存
    logger.info('使用默认配置');
    const config = createDefaultConfig();
    const manager = new ConfigManager(config, configPath);

    // 尝试保存默认配置
    try {
      await manager.saveToFile();
      logger.info(`已保存默认配置到: ${configPath}`);
    } catch (error) {
      logger.warn(`无法保存默认配置: ${error}`);
    }

    return manager;
  }

  /**
   * 获取当前配置
   */
  public getConfig(): DIAPConfig {
    return this.config;
  }

  /**
   * 获取配置路径
   */
  public getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<DIAPConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    logger.debug('配置已更新');
  }

  /**
   * 保存配置到文件
   */
  public async saveToFile(): Promise<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      logger.info(`配置已保存到: ${this.configPath}`);
    } catch (error) {
      logger.error(`保存配置失败: ${error}`);
      throw error;
    }
  }

  /**
   * 验证配置
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证 IPFS 配置
    if (!this.config.ipfs.awsApiUrl && !this.config.ipfs.pinataApiKey) {
      errors.push('必须配置 AWS IPFS 节点或 Pinata');
    }

    // 验证 IPNS 配置
    if (!this.config.ipns.useW3name && !this.config.ipns.useIpfsNode) {
      errors.push('必须至少启用一种 IPNS 发布方式');
    }

    // 验证日志级别
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(this.config.logging.level)) {
      errors.push(`无效的日志级别: ${this.config.logging.level}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 创建子配置访问器
   */
  public getAgentConfig(): AgentConfig {
    return this.config.agent;
  }

  public getIpfsConfig(): IpfsConfig {
    return this.config.ipfs;
  }

  public getIpnsConfig(): IpnsConfig {
    return this.config.ipns;
  }

  public getCacheConfig(): CacheConfig {
    return this.config.cache;
  }

  public getLoggingConfig(): LoggingConfig {
    return this.config.logging;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 加载配置（便捷函数）
 */
export async function loadConfig(): Promise<ConfigManager> {
  return ConfigManager.load();
}

/**
 * 获取默认配置（便捷函数）
 */
export function getDefaultConfig(): DIAPConfig {
  return createDefaultConfig();
}

/**
 * 保存配置到指定路径
 */
export async function saveConfig(config: DIAPConfig, configPath?: string): Promise<void> {
  const path = configPath || getDefaultConfigPath();
  const manager = new ConfigManager(config, path);
  await manager.saveToFile();
}
