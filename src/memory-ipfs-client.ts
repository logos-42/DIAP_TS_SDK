/**
 * 内存 IPFS 客户端
 * 用于开发/测试场景，无需外部 IPFS 节点或 Pinata 凭据
 * DID 文档存储在内存 Map 中，CID 基于 SHA256 生成
 */
import { IpfsClient } from './ipfs-client.js';
import type { IpfsUploadResult } from './ipfs-client.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { logger } from './utils/logger.js';

/**
 * 内存 IPFS 客户端
 * 所有上传内容存储在内存中，生成确定性 CID
 * 读取优先查内存，查不到再回退到公共网关
 */
export class MemoryIpfsClient extends IpfsClient {
  /** 静态内存存储: CID → content */
  private static store = new Map<string, string>();

  constructor() {
    super(null, null, null, null, 30);
    logger.info('📦 使用内存 IPFS 客户端（不上传到外部网络）');
  }

  /**
   * 创建内存模式客户端
   */
  static async newMemory(): Promise<MemoryIpfsClient> {
    return new MemoryIpfsClient();
  }

  /**
   * 从内容计算确定性 CID
   * 格式: mem-<sha256-hex[:32]>
   * 不生成真实 IPFS CID，但在本进程内可解析
   */
  static computeCID(content: string): string {
    const hash = sha256(new TextEncoder().encode(content));
    const hex = Array.from(hash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `mem-${hex.substring(0, 32)}`;
  }

  /**
   * 上传内容到内存存储
   */
  async upload(content: string, name: string = 'data'): Promise<IpfsUploadResult> {
    const cid = MemoryIpfsClient.computeCID(content);
    MemoryIpfsClient.store.set(cid, content);
    logger.info(`📦 内存上传成功: ${cid} (${content.length}B, name=${name})`);
    return {
      cid,
      size: content.length,
      uploadedAt: new Date().toISOString(),
      provider: 'memory',
    };
  }

  /**
   * 从内存获取内容，查不到再回退到公共网关
   */
  async get(cid: string): Promise<string> {
    const content = MemoryIpfsClient.store.get(cid);
    if (content) {
      logger.info(`📦 内存命中: ${cid}`);
      return content;
    }
    logger.info(`📦 内存未命中 ${cid}，回退到公共网关`);
    return super.get(cid);
  }

  /**
   * 检查内容是否存在
   */
  has(cid: string): boolean {
    return MemoryIpfsClient.store.has(cid);
  }

  /**
   * 获取存储大小
   */
  static getStoreSize(): number {
    return MemoryIpfsClient.store.size;
  }

  /**
   * 清空存储（用于测试清理）
   */
  static clearStore(): void {
    MemoryIpfsClient.store.clear();
  }
}
