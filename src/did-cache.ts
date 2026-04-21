/**
 * DIAP TypeScript SDK - DID 文档缓存
 * 减少 IPFS 请求，提高验证性能
 * 使用 LRU 驱逐策略和后台清理任务
 */

import { logger } from './utils/logger.js';
import type { DIDDocument } from './types/did.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 缓存条目
 */
export interface CacheEntry {
  /** DID 文档 */
  document: DIDDocument;
  /** CID */
  cid: string;
  /** 缓存时间 */
  cachedAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 访问次数 */
  hitCount: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 总条目数 */
  totalEntries: number;
  /** 过期条目数 */
  expiredEntries: number;
  /** 总命中次数 */
  totalHits: number;
  /** 最大条目数 */
  maxEntries: number;
  /** TTL（秒） */
  ttl: number;
}

// ============================================================================
// DIDCache 类
// ============================================================================

/**
 * DID 文档缓存管理器
 */
export class DIDCache {
  /** CID -> CacheEntry 缓存 */
  private cache: Map<string, CacheEntry>;
  /** 缓存有效期（秒） */
  private ttl: number;
  /** 最大缓存条目数 */
  private maxEntries: number;
  /** 后台清理定时器 */
  private cleanupTimer?: NodeJS.Timeout;

  /**
   * 创建新的 DID 缓存
   *
   * @param ttl - 缓存有效期（秒），默认 3600 秒（1小时）
   * @param maxEntries - 最大缓存条目数，默认 1000
   */
  constructor(ttl?: number, maxEntries?: number) {
    const ttlSeconds = ttl || 3600;
    const max = maxEntries || 1000;

    this.cache = new Map();
    this.ttl = ttlSeconds;
    this.maxEntries = max;

    // 启动后台清理任务
    this.startCleanupTask();

    logger.info(`💾 DID 文档缓存已创建`);
    logger.info(`  TTL: ${ttlSeconds} 秒`);
    logger.info(`  最大条目: ${max}`);
  }

  /**
   * 获取 DID 文档
   */
  public get(cid: string): DIDDocument | null {
    const entry = this.cache.get(cid);

    if (!entry) {
      logger.debug(`缓存未命中: ${cid}`);
      return null;
    }

    const now = this.getCurrentTimestamp();

    // 检查是否过期
    if (entry.expiresAt < now) {
      this.cache.delete(cid);
      logger.debug(`缓存已过期: ${cid}`);
      return null;
    }

    // 增加命中次数
    entry.hitCount += 1;
    logger.debug(`✓ 缓存命中: ${cid} (命中次数: ${entry.hitCount})`);

    return entry.document;
  }

  /**
   * 存储 DID 文档
   */
  public put(cid: string, document: DIDDocument): void {
    // 检查缓存大小
    if (this.cache.size >= this.maxEntries) {
      this.evictLru();
    }

    const now = this.getCurrentTimestamp();
    const entry: CacheEntry = {
      document,
      cid,
      cachedAt: now,
      expiresAt: now + this.ttl,
      hitCount: 0,
    };

    this.cache.set(cid, entry);
    logger.debug(`✓ 已缓存 DID 文档: ${cid}`);
  }

  /**
   * 检查缓存是否存在
   */
  public has(cid: string): boolean {
    const entry = this.cache.get(cid);
    if (!entry) return false;

    const now = this.getCurrentTimestamp();
    if (entry.expiresAt < now) {
      this.cache.delete(cid);
      return false;
    }

    return true;
  }

  /**
   * 移除缓存条目
   */
  public remove(cid: string): DIDDocument | null {
    const entry = this.cache.get(cid);
    if (entry) {
      this.cache.delete(cid);
      logger.debug(`移除缓存: ${cid}`);
      return entry.document;
    }
    return null;
  }

  /**
   * 清空缓存
   */
  public clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info(`🧹 清空缓存: ${count} 个条目`);
  }

  /**
   * 获取缓存统计
   */
  public stats(): CacheStats {
    let totalHits = 0;
    let expired = 0;
    const now = this.getCurrentTimestamp();

    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
      if (entry.expiresAt < now) {
        expired += 1;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expired,
      totalHits,
      maxEntries: this.maxEntries,
      ttl: this.ttl,
    };
  }

  /**
   * 清理过期条目
   */
  public cleanupExpired(): number {
    const now = this.getCurrentTimestamp();
    let removed = 0;

    for (const [cid, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(cid);
        removed += 1;
      }
    }

    if (removed > 0) {
      logger.debug(`🧹 清理了 ${removed} 个过期缓存`);
    }

    return removed;
  }

  /**
   * 驱逐最少使用的条目（LRU）
   */
  private evictLru(): void {
    let minHits = Number.MAX_SAFE_INTEGER;
    let evictCid: string | null = null;

    for (const [cid, entry] of this.cache.entries()) {
      if (entry.hitCount < minHits) {
        minHits = entry.hitCount;
        evictCid = cid;
      }
    }

    if (evictCid !== null) {
      this.cache.delete(evictCid);
      logger.debug(`驱逐 LRU 缓存: ${evictCid} (命中次数: ${minHits})`);
    }
  }

  /**
   * 获取当前时间戳（秒）
   */
  private getCurrentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * 启动后台清理任务
   */
  private startCleanupTask(): void {
    // 每隔 TTL/4 清理一次
    const intervalMs = (this.ttl / 4) * 1000;

    this.cleanupTimer = setInterval(() => {
      const now = this.getCurrentTimestamp();
      let removed = 0;

      for (const [cid, entry] of this.cache.entries()) {
        if (entry.expiresAt < now) {
          this.cache.delete(cid);
          removed += 1;
        }
      }

      if (removed > 0) {
        logger.debug(`🧹 后台清理了 ${removed} 个过期 DID 缓存`);
      }
    }, intervalMs);

    // 确保定时器不会阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止后台清理任务
   */
  public stopCleanupTask(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      logger.debug('后台清理任务已停止');
    }
  }

  /**
   * 获取缓存条目数
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * 检查缓存是否为空
   */
  public isEmpty(): boolean {
    return this.cache.size === 0;
  }

  /**
   * 获取所有缓存的 CID
   */
  public getAllCids(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 销毁缓存实例
   */
  public destroy(): void {
    this.stopCleanupTask();
    this.clear();
    logger.debug('🧹 DID 缓存实例已销毁');
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建新的 DID 缓存（便捷函数）
 */
export function createDIDCache(ttl?: number, maxEntries?: number): DIDCache {
  return new DIDCache(ttl, maxEntries);
}

/**
 * 创建默认配置的 DID 缓存
 */
export function createDefaultDIDCache(): DIDCache {
  return new DIDCache(3600, 1000);
}

// ============================================================================
// 全局单例缓存
// ============================================================================

let globalCache: DIDCache | null = null;

/**
 * 获取全局 DID 缓存实例
 */
export function getGlobalDIDCache(): DIDCache {
  if (!globalCache) {
    globalCache = new DIDCache();
  }
  return globalCache;
}

/**
 * 重置全局 DID 缓存
 */
export function resetGlobalDIDCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}
