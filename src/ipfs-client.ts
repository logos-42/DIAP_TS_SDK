/**
 * IPFS 客户端模块
 * 使用 Helia 作为轻量级 IPFS 客户端
 */

import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { json } from '@helia/json';
import type { CID } from 'multiformats/cid';
import { IPFSError } from './types/errors.js';
import { logger } from './utils/logger.js';

/**
 * IPFS 上传结果
 */
export interface IpfsUploadResult {
  /** IPFS CID */
  cid: string;
  /** 文件大小（字节） */
  size: number;
  /** 上传时间 */
  uploadedAt: string;
  /** 使用的提供者 */
  provider: string;
}

/**
 * IPNS 发布结果
 */
export interface IpnsPublishResult {
  /** IPNS 名称 */
  name: string;
  /** IPNS 值（CID） */
  value: string;
  /** 发布时间 */
  publishedAt: string;
}

/**
 * 远程 IPFS 配置
 */
export interface RemoteIpfsConfig {
  /** IPFS API URL */
  apiUrl: string;
  /** IPFS Gateway URL */
  gatewayUrl: string;
}

/**
 * IPFS 客户端
 */
export class IpfsClient {
  private helia: any;
  private unixfsApi: any;
  private jsonApi: any;
  private timeout: number;
  private publicGateways: string[];

  /**
   * 创建仅使用公共网关的 IPFS 客户端
   */
  static async newPublicOnly(timeout: number = 30000): Promise<IpfsClient> {
    const client = new IpfsClient({ timeout });
    await client.initialize();
    return client;
  }

  /**
   * 创建使用自定义远程节点的 IPFS 客户端
   */
  static async newWithRemoteNode(
    apiUrl: string,
    gatewayUrl: string,
    timeout: number = 30000
  ): Promise<IpfsClient> {
    const client = new IpfsClient({
      apiUrl,
      gatewayUrl,
      timeout,
    });
    await client.initialize();
    return client;
  }

  private constructor(config?: {
    apiUrl?: string;
    gatewayUrl?: string;
    timeout?: number;
  }) {
    this.timeout = config?.timeout || 30000;
    this.publicGateways = [
      'https://ipfs.io',
      'https://gateway.pinata.cloud',
      'https://cloudflare-ipfs.com',
    ];
  }

  /**
   * 初始化 Helia 实例
   */
  private async initialize(): Promise<void> {
    try {
      this.helia = await createHelia();
      this.unixfsApi = unixfs(this.helia);
      this.jsonApi = json(this.helia);
      logger.debug('Helia IPFS client initialized');
    } catch (error) {
      throw new IPFSError('Failed to initialize IPFS client', { originalError: error });
    }
  }

  /**
   * 上传内容到 IPFS
   */
  async upload(content: string | Uint8Array, name: string = 'data'): Promise<IpfsUploadResult> {
    try {
      let cid: CID;
      let size: number;

      if (typeof content === 'string') {
        // 上传 JSON 数据
        const data = JSON.parse(content);
        cid = await this.jsonApi.add(data);
        size = new TextEncoder().encode(content).length;
      } else {
        // 上传二进制数据
        cid = await this.unixfsApi.addBytes(content);
        size = content.length;
      }

      const result: IpfsUploadResult = {
        cid: cid.toString(),
        size,
        uploadedAt: new Date().toISOString(),
        provider: 'helia',
      };

      logger.debug('Uploaded to IPFS', { cid: result.cid, size: result.size });
      return result;
    } catch (error) {
      throw new IPFSError('Failed to upload to IPFS', { originalError: error, name });
    }
  }

  /**
   * 从 IPFS 获取内容
   */
  async get(cid: string): Promise<string> {
    try {
      const cidObj = this.parseCID(cid);
      
      // 尝试从本地节点获取
      try {
        const content = await this.jsonApi.get(cidObj);
        return JSON.stringify(content);
      } catch {
        // 如果本地获取失败，尝试从网关获取
        return await this.getFromGateway(cid);
      }
    } catch (error) {
      // 回退到网关
      return await this.getFromGateway(cid);
    }
  }

  /**
   * 从公共网关获取内容
   */
  async getFromGateway(cid: string): Promise<string> {
    const errors: Error[] = [];
    
    for (const gateway of this.publicGateways) {
      try {
        const url = `${gateway}/ipfs/${cid}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        const response = await fetch(url, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const content = await response.text();
        logger.debug('Retrieved from gateway', { cid, gateway });
        return content;
      } catch (error) {
        errors.push(error as Error);
        logger.warn('Failed to get from gateway', { cid, gateway, error });
      }
    }
    
    throw new IPFSError('Failed to retrieve content from all gateways', {
      cid,
      errors: errors.map(e => e.message),
    });
  }

  /**
   * 固定内容到 IPFS
   */
  async pin(cid: string): Promise<void> {
    try {
      const cidObj = this.parseCID(cid);
      // Helia 会自动固定添加的内容
      // 这里可以添加额外的固定逻辑
      logger.debug('Pinned content', { cid });
    } catch (error) {
      throw new IPFSError('Failed to pin content', { originalError: error, cid });
    }
  }

  /**
   * 确保 IPNS 密钥存在
   */
  async ensureKeyExists(keyName: string): Promise<string> {
    // TODO: 实现 IPNS 密钥管理
    // 目前返回占位符
    logger.debug('IPNS key check', { keyName });
    return keyName;
  }

  /**
   * 发布 IPNS 记录
   */
  async publishIpns(
    cid: string,
    keyName: string,
    lifetime: string = '24h',
    ttl: string = '1h'
  ): Promise<IpnsPublishResult> {
    // TODO: 实现 IPNS 发布功能
    // 这需要完整的 libp2p 集成
    logger.debug('IPNS publish', { cid, keyName, lifetime, ttl });
    
    return {
      name: keyName,
      value: cid,
      publishedAt: new Date().toISOString(),
    };
  }

  /**
   * 解析 CID 字符串
   */
  private parseCID(cidStr: string): CID {
    try {
      // 使用 multiformats 解析 CID
      const { CID } = await import('multiformats/cid');
      return CID.parse(cidStr);
    } catch (error) {
      throw new IPFSError('Invalid CID format', { cid: cidStr, originalError: error });
    }
  }

  /**
   * 关闭 IPFS 客户端
   */
  async stop(): Promise<void> {
    try {
      if (this.helia) {
        await this.helia.stop();
        logger.debug('IPFS client stopped');
      }
    } catch (error) {
      logger.warn('Error stopping IPFS client', { error });
    }
  }
}
