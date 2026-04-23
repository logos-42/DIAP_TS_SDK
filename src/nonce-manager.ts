/**
 * DIAP TypeScript SDK - Nonce 管理器
 * 生成和管理随机数，用于防重放攻击
 */

import { logger } from './utils/logger.js';

/**
 * Nonce 记录
 */
export interface NonceRecord {
  /** Nonce 值 */
  nonce: string;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 使用次数 */
  usedCount: number;
  /** 是否已使用 */
  isUsed: boolean;
  /** 关联的 DID */
  did?: string;
}

/**
 * Nonce 验证结果
 */
export interface NonceVerifyResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * Nonce 管理器配置
 */
export interface NonceManagerConfig {
  /** Nonce 长度（字节） */
  nonceLength?: number;
  /** 过期时间（秒） */
  ttlSeconds?: number;
  /** 最大使用次数 */
  maxUsageCount?: number;
  /** 最大缓存数量 */
  maxCacheSize?: number;
}

/**
 * Nonce 验证结果
 */
export interface NonceValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  error?: string;
  /** Nonce 记录 */
  record?: NonceRecord;
}

/**
 * Nonce 管理器
 */
export class NonceManager {
  /** 配置 */
  private config: Required<NonceManagerConfig>;
  /** Nonce 缓存 */
  private nonceCache: Map<string, NonceRecord>;
  /** 已使用的 Nonce 集合（用于快速查找） */
  private usedNonces: Set<string>;
  /** 清理间隔（毫秒） */
  private cleanupIntervalMs: number = 60000;

  /**
   * 创建 Nonce 管理器
   */
  constructor(config?: NonceManagerConfig) {
    this.config = {
      nonceLength: config?.nonceLength || 32,
      ttlSeconds: config?.ttlSeconds || 300, // 5 分钟
      maxUsageCount: config?.maxUsageCount || 1,
      maxCacheSize: config?.maxCacheSize || 1000,
    };

    this.nonceCache = new Map();
    this.usedNonces = new Set();

    // 启动清理任务
    this.startCleanupTask();

    logger.info('✅ Nonce 管理器已创建');
    logger.info(`  Nonce 长度: ${this.config.nonceLength} 字节`);
    logger.info(`  TTL: ${this.config.ttlSeconds} 秒`);
  }

  /**
   * 生成新的 Nonce（静态方法，格式: timestamp:uuid:random）
   */
  public static generateNonce(): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const uuid = crypto.randomUUID ? crypto.randomUUID() : NonceManager.generateFallbackUuid();
    const random = Math.floor(Math.random() * 0xffffffffffff).toString(16);
    return `${timestamp}:${uuid}:${random}`;
  }

  /**
   * 生成 fallback UUID
   */
  private static generateFallbackUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 生成新的 Nonce
   */
  public generateNonce(): string {
    const nonce = NonceManager.generateNonce();

    const now = Date.now();
    const record: NonceRecord = {
      nonce,
      createdAt: now,
      expiresAt: now + this.config.ttlSeconds * 1000,
      usedCount: 0,
      isUsed: false,
    };

    // 检查缓存大小
    if (this.nonceCache.size >= this.config.maxCacheSize) {
      this.evictOldest();
    }

    this.nonceCache.set(nonce, record);
    logger.debug(`🔢 生成 Nonce: ${nonce.substring(0, 8)}...`);

    return nonce;
  }

  /**
   * 验证并记录 Nonce（原子操作）
   *
   * @returns true - Nonce 有效且未被使用
   * @returns false - Nonce 已被使用（重放攻击）
   * @throws Nonce 格式错误或已过期
   */
  public verifyAndRecord(nonce: string, did: string): NonceVerifyResult {
    // 1. 解析 nonce 格式
    const parts = nonce.split(':');
    if (parts.length < 2) {
      return { isValid: false, error: 'Nonce 格式错误' };
    }

    const timestamp = parseInt(parts[0], 10);
    if (isNaN(timestamp)) {
      return { isValid: false, error: '无法解析时间戳' };
    }

    // 2. 检查时间戳是否在有效期内
    const now = Math.floor(Date.now() / 1000);

    if (timestamp > now) {
      return { isValid: false, error: 'Nonce 时间戳在未来' };
    }

    if (now - timestamp > this.config.ttlSeconds) {
      return { isValid: false, error: `Nonce 已过期（超过${this.config.ttlSeconds}秒）` };
    }

    // 3. 检查是否已被使用
    if (this.usedNonces.has(nonce)) {
      logger.warn(`检测到重放攻击！Nonce 已被使用: ${nonce.substring(0, 8)}...`);
      return { isValid: false, error: 'Nonce 已使用（重放攻击）' };
    }

    // 4. 记录 nonce
    const nowMs = Date.now();
    const record: NonceRecord = {
      nonce,
      createdAt: nowMs - (now - timestamp) * 1000,
      expiresAt: nowMs + (this.config.ttlSeconds - (now - timestamp)) * 1000,
      usedCount: 1,
      isUsed: true,
      did,
    };

    this.nonceCache.set(nonce, record);
    this.usedNonces.add(nonce);

    logger.debug(`✓ Nonce 验证通过并已记录: ${nonce.substring(0, 8)}...`);
    return { isValid: true };
  }

  /**
   * 检查 Nonce 是否已被使用
   */
  public isUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  /**
   * 验证 Nonce
   */
  public validateNonce(nonce: string): NonceValidationResult {
    const record = this.nonceCache.get(nonce);

    // 检查是否存在
    if (!record) {
      // 也检查是否已使用
      if (this.usedNonces.has(nonce)) {
        return {
          isValid: false,
          error: 'Nonce 已使用',
        };
      }

      return {
        isValid: false,
        error: 'Nonce 不存在',
      };
    }

    // 检查是否过期
    if (Date.now() > record.expiresAt) {
      this.nonceCache.delete(nonce);
      return {
        isValid: false,
        error: 'Nonce 已过期',
      };
    }

    // 检查使用次数
    if (record.usedCount >= this.config.maxUsageCount) {
      return {
        isValid: false,
        error: 'Nonce 使用次数已达上限',
      };
    }

    return {
      isValid: true,
      record,
    };
  }

  /**
   * 使用 Nonce
   */
  public useNonce(nonce: string): boolean {
    const result = this.validateNonce(nonce);

    if (!result.isValid) {
      logger.warn(`❌ 无法使用 Nonce: ${result.error}`);
      return false;
    }

    const record = result.record!;
    record.usedCount += 1;

    if (record.usedCount >= this.config.maxUsageCount) {
      record.isUsed = true;
      this.usedNonces.add(nonce);
    }

    logger.debug(`✓ Nonce 已使用: ${nonce.substring(0, 8)}...`);
    return true;
  }

  /**
   * 检查 Nonce 是否已使用
   */
  public isNonceUsed(nonce: string): boolean {
    const record = this.nonceCache.get(nonce);
    return record ? record.isUsed : this.usedNonces.has(nonce);
  }

  /**
   * 获取 Nonce 信息
   */
  public getNonceInfo(nonce: string): NonceRecord | null {
    return this.nonceCache.get(nonce) || null;
  }

  /**
   * 创建验证请求（生成带时间戳的 Nonce）
   */
  public createVerificationRequest(
    clientId: string,
    action: string
  ): { nonce: string; timestamp: number; signature: string } {
    const nonce = this.generateNonce();
    const timestamp = Date.now();

    // 创建签名（简化版本，实际应使用密钥签名）
    const signature = this.createSignature(clientId, action, nonce, timestamp);

    return {
      nonce,
      timestamp,
      signature,
    };
  }

  /**
   * 验证请求（验证带时间戳的 Nonce）
   */
  public validateRequest(
    clientId: string,
    action: string,
    nonce: string,
    timestamp: number,
    signature: string
  ): NonceValidationResult {
    // 验证时间戳（允许 ±5 分钟误差）
    const timeDiff = Math.abs(Date.now() - timestamp);
    if (timeDiff > 5 * 60 * 1000) {
      return {
        isValid: false,
        error: '请求时间戳无效',
      };
    }

    // 验证 Nonce
    const nonceResult = this.validateNonce(nonce);
    if (!nonceResult.isValid) {
      return nonceResult;
    }

    // 验证签名
    const expectedSignature = this.createSignature(clientId, action, nonce, timestamp);
    if (signature !== expectedSignature) {
      return {
        isValid: false,
        error: '签名验证失败',
      };
    }

    return {
      isValid: true,
      record: nonceResult.record,
    };
  }

  /**
   * 创建签名
   */
  private createSignature(
    clientId: string,
    action: string,
    nonce: string,
    timestamp: number
  ): string {
    const data = `${clientId}:${action}:${nonce}:${timestamp}`;
    return this.hashString(data);
  }

  /**
   * 哈希字符串
   */
  private hashString(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * 生成安全的随机字符串
   */
  private generateSecureRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    // 使用 crypto 获取随机字节
    const randomBytes = new Uint8Array(length);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(randomBytes);
    } else {
      // 回退到 Math.random
      for (let i = 0; i < length; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }

    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }

    return result;
  }

  /**
   * 驱逐最旧的 Nonce
   */
  private evictOldest(): void {
    let oldestNonce: string | null = null;
    let oldestTime = Date.now();

    for (const [nonce, record] of this.nonceCache.entries()) {
      if (record.createdAt < oldestTime) {
        oldestTime = record.createdAt;
        oldestNonce = nonce;
      }
    }

    if (oldestNonce) {
      this.nonceCache.delete(oldestNonce);
      logger.debug(`驱逐最旧 Nonce: ${oldestNonce.substring(0, 8)}...`);
    }
  }

  /**
   * 清理过期 Nonce
   */
  public cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [nonce, record] of this.nonceCache.entries()) {
      if (now > record.expiresAt) {
        this.nonceCache.delete(nonce);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`🧹 清理了 ${removed} 个过期 Nonce`);
    }

    return removed;
  }

  /**
   * 启动清理任务
   */
  private startCleanupTask(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupIntervalMs);
  }

  /**
   * 获取缓存大小
   */
  public getCacheSize(): number {
    return this.nonceCache.size;
  }

  /**
   * 获取已使用 Nonce 数量
   */
  public getUsedCount(): number {
    return this.usedNonces.size;
  }

  /**
   * 清空所有 Nonce
   */
  public clear(): void {
    this.nonceCache.clear();
    this.usedNonces.clear();
    logger.info('🧹 已清空所有 Nonce');
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    cacheSize: number;
    usedCount: number;
    activeCount: number;
  } {
    const activeCount = Array.from(this.nonceCache.values()).filter(
      (r) => !r.isUsed && Date.now() < r.expiresAt
    ).length;

    return {
      cacheSize: this.nonceCache.size,
      usedCount: this.usedNonces.size,
      activeCount,
    };
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 Nonce 管理器（便捷函数）
 */
export function createNonceManager(config?: NonceManagerConfig): NonceManager {
  return new NonceManager(config);
}

// ============================================================================
// 全局单例
// ============================================================================

let globalNonceManager: NonceManager | null = null;

/**
 * 获取全局 Nonce 管理器
 */
export function getGlobalNonceManager(): NonceManager {
  if (!globalNonceManager) {
    globalNonceManager = new NonceManager();
  }
  return globalNonceManager;
}

// ============================================================================
// 导出
// ============================================================================
// 注意: NonceRecord, NonceManagerConfig, NonceValidationResult 已在声明时导出
