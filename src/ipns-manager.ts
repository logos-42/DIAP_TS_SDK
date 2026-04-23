/**
 * DIAP TypeScript SDK - IPNS 管理器
 * 负责 IPNS 记录的发布、解析和 Key 管理
 */

import { logger } from './utils/logger.js';

/**
 * IPNS 记录状态
 */
export enum IpnsRecordStatus {
  /** 待发布 */
  Pending = 'pending',
  /** 已发布 */
  Published = 'published',
  /** 已过期 */
  Expired = 'expired',
  /** 失败 */
  Failed = 'failed',
}

/**
 * IPNS 配置
 */
export interface IpnsConfig {
  /** 是否使用 w3name */
  useW3name?: boolean;
  /** 是否使用 IPFS 节点 */
  useIpfsNode?: boolean;
  /** 记录有效期（天） */
  validityDays?: number;
  /** 默认 TTL */
  defaultTtl?: number;
}

/**
 * IPNS 发布结果
 */
export interface IpnsPublishResult {
  /** IPNS 名称 */
  name: string;
  /** 指向的 CID */
  value: string;
  /** 序列号 */
  sequence: number;
  /** 有效期 */
  validity: number;
  /** 签名 */
  signature: string;
  /** 发布时间 */
  publishedAt: string;
}

/**
 * IPNS 解析结果
 */
export interface IpnsResolveResult {
  /** IPNS 名称 */
  name: string;
  /** 解析后的 CID */
  value: string;
  /** 序列号 */
  sequence: number;
  /** TTL */
  ttl?: number;
  /** 缓存时间 */
  cachedAt?: string;
}

/**
 * IPNS Key 信息
 */
export interface KeyInfo {
  /** Key 名称 */
  name: string;
  /** Key ID */
  id: string;
}

/**
 * IPNS 记录
 */
export interface IpnsRecord {
  /** IPNS 名称 */
  name: string;
  /** 指向的值 */
  value: string;
  /** 序列号 */
  sequence: number;
  /** 有效期 */
  validity: number;
  /** 签名 */
  signature: Uint8Array;
  /** TTL */
  ttl?: number;
}

/**
 * IPNS 管理器
 */
export class IpnsManager {
  /** 配置 */
  private config: Required<IpnsConfig>;
  /** Key 列表 */
  private keys: Map<string, KeyInfo>;
  /** 记录缓存 */
  private recordCache: Map<string, IpnsRecord>;
  /** 使用 w3name */
  private useW3name: boolean;

  /**
   * 创建 IPNS 管理器
   */
  public static async create(config?: IpnsConfig): Promise<IpnsManager> {
    logger.info('🚀 创建 IPNS 管理器');

    const manager = new IpnsManager(config);
    await manager.initialize();

    return manager;
  }

  /**
   * 构造函数
   */
  private constructor(config?: IpnsConfig) {
    this.config = {
      useW3name: config?.useW3name ?? true,
      useIpfsNode: config?.useIpfsNode ?? true,
      validityDays: config?.validityDays ?? 365,
      defaultTtl: config?.defaultTtl ?? 3600,
    };

    this.keys = new Map();
    this.recordCache = new Map();
    this.useW3name = this.config.useW3name;
  }

  /**
   * 初始化管理器
   */
  private async initialize(): Promise<void> {
    logger.info('💾 IPNS 管理器已初始化');
    logger.info(`  使用 w3name: ${this.config.useW3name}`);
    logger.info(`  使用 IPFS 节点: ${this.config.useIpfsNode}`);
    logger.info(`  有效期: ${this.config.validityDays} 天`);
  }

  /**
   * 发布 IPNS 记录
   */
  public async publish(
    cid: string,
    keyName: string = 'self',
    lifetime: number = 86400,
    ttl?: number
  ): Promise<IpnsPublishResult> {
    logger.info(`📤 发布 IPNS 记录: ${cid}`);

    const keyInfo = this.keys.get(keyName);
    if (!keyInfo) {
      throw new Error(`Key not found: ${keyName}`);
    }

    const name = `/ipns/${keyInfo.id}`;
    const sequence = this.getNextSequence(name);
    const validity = Date.now() + this.config.validityDays * 24 * 60 * 60 * 1000;

    // 创建 IPNS 记录
    const record: IpnsRecord = {
      name,
      value: cid,
      sequence,
      validity,
      signature: new Uint8Array(64), // 模拟签名
      ttl: ttl || this.config.defaultTtl,
    };

    // 发布到 IPNS
    if (this.useW3name) {
      await this.publishToW3name(record);
    } else {
      await this.publishToIpfs(record);
    }

    // 缓存记录
    this.recordCache.set(name, record);

    const result: IpnsPublishResult = {
      name,
      value: cid,
      sequence,
      validity,
      signature: Buffer.from(record.signature).toString('base64'),
      publishedAt: new Date().toISOString(),
    };

    logger.info(`✅ IPNS 记录已发布: ${name}`);
    return result;
  }

  /**
   * 发布到 w3name
   */
  private async publishToW3name(record: IpnsRecord): Promise<void> {
    logger.debug('发布到 w3name...');
    // 模拟 w3name 发布
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * 发布到 IPFS 节点
   */
  private async publishToIpfs(record: IpnsRecord): Promise<void> {
    logger.debug('发布到 IPFS 节点...');
    // 模拟 IPFS 发布
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * 解析 IPNS 名称
   */
  public async resolve(ipnsName: string): Promise<IpnsResolveResult> {
    logger.info(`🔍 解析 IPNS: ${ipnsName}`);

    // 检查缓存
    const cached = this.recordCache.get(ipnsName);
    if (cached && cached.validity > Date.now()) {
      logger.debug('使用缓存的 IPNS 记录');
      return {
        name: ipnsName,
        value: cached.value,
        sequence: cached.sequence,
        ttl: cached.ttl,
        cachedAt: new Date().toISOString(),
      };
    }

    // 从网络解析
    if (this.useW3name) {
      return await this.resolveFromW3name(ipnsName);
    } else {
      return await this.resolveFromIpfs(ipnsName);
    }
  }

  /**
   * 从 w3name 解析
   */
  private async resolveFromW3name(
    ipnsName: string
  ): Promise<IpnsResolveResult> {
    logger.debug('从 w3name 解析...');

    // 模拟 w3name 解析
    return {
      name: ipnsName,
      value: 'QmDefaultResolvedCid',
      sequence: 1,
      ttl: this.config.defaultTtl,
    };
  }

  /**
   * 从 IPFS 节点解析
   */
  private async resolveFromIpfs(
    ipnsName: string
  ): Promise<IpnsResolveResult> {
    logger.debug('从 IPFS 节点解析...');

    // 模拟 IPFS 解析
    return {
      name: ipnsName,
      value: 'QmDefaultResolvedCid',
      sequence: 1,
      ttl: this.config.defaultTtl,
    };
  }

  /**
   * 确保 Key 存在
   */
  public async ensureKeyExists(keyName: string): Promise<KeyInfo> {
    let keyInfo = this.keys.get(keyName);

    if (!keyInfo) {
      keyInfo = await this.createKey(keyName);
    }

    return keyInfo;
  }

  /**
   * 创建新的 IPNS Key
   */
  public async createKey(keyName: string): Promise<KeyInfo> {
    logger.info(`🔑 创建 IPNS Key: ${keyName}`);

    // 生成 Key ID
    const id = this.generateKeyId();

    const keyInfo: KeyInfo = {
      name: keyName,
      id,
    };

    this.keys.set(keyName, keyInfo);
    logger.info(`✅ Key 创建成功: ${id}`);

    return keyInfo;
  }

  /**
   * 列出所有 Key
   */
  public listKeys(): KeyInfo[] {
    return Array.from(this.keys.values());
  }

  /**
   * 删除 Key
   */
  public async removeKey(keyName: string): Promise<void> {
    if (this.keys.has(keyName)) {
      this.keys.delete(keyName);
      logger.info(`🗑️ Key 已删除: ${keyName}`);
    }
  }

  /**
   * 获取下一个序列号
   */
  private getNextSequence(name: string): number {
    const record = this.recordCache.get(name);
    return record ? record.sequence + 1 : 1;
  }

  /**
   * 生成 Key ID
   */
  private generateKeyId(): string {
    const chars = '0123456789abcdef';
    let result = 'k51';
    for (let i = 0; i < 50; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * 获取配置
   */
  public getConfig(): IpnsConfig {
    return { ...this.config };
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.recordCache.clear();
    logger.info('🧹 IPNS 缓存已清空');
  }

  /**
   * 获取缓存的记录数
   */
  public getCacheSize(): number {
    return this.recordCache.size;
  }

  /**
   * 获取 Key 数量
   */
  public getKeyCount(): number {
    return this.keys.size;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 IPNS 管理器（便捷函数）
 */
export async function createIpnsManager(
  config?: IpnsConfig
): Promise<IpnsManager> {
  return IpnsManager.create(config);
}

// ============================================================================
// 导出
// ============================================================================
