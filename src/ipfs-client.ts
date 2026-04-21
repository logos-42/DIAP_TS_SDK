/**
 * IPFS 客户端模块
 * 基于 Rust SDK 的 HTTP API 实现
 * 使用直接 HTTP 请求与 IPFS 节点交互
 */

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
  /** IPNS 名称（PeerID） */
  name: string;
  /** IPNS 值（/ipfs/<CID> 路径） */
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
 * Pinata 配置
 */
export interface PinataConfig {
  /** Pinata API Key */
  apiKey: string;
  /** Pinata API Secret */
  apiSecret: string;
}

/**
 * IPFS 客户端
 * 基于 HTTP API 的轻量级实现
 */
export class IpfsClient {
  private apiUrl: string | null = null;
  private gatewayUrl: string | null = null;
  private pinataConfig: PinataConfig | null = null;
  private timeout: number;
  private publicGateways: string[];

  /**
   * 创建新的 IPFS 客户端
   */
  constructor(
    apiUrl?: string | null,
    gatewayUrl?: string | null,
    pinataApiKey?: string | null,
    pinataApiSecret?: string | null,
    timeoutSeconds: number = 30
  ) {
    this.timeout = timeoutSeconds * 1000;

    if (apiUrl && gatewayUrl) {
      this.apiUrl = apiUrl;
      this.gatewayUrl = gatewayUrl;
    }

    if (pinataApiKey && pinataApiSecret) {
      this.pinataConfig = {
        apiKey: pinataApiKey,
        apiSecret: pinataApiSecret,
      };
    }

    this.publicGateways = [
      'https://ipfs.io',
      'https://dweb.link',
      'https://cloudflare-ipfs.com',
    ];
  }

  /**
   * 创建仅使用公共网关的客户端
   */
  static async newPublicOnly(timeoutSeconds: number = 30): Promise<IpfsClient> {
    return new IpfsClient(null, null, null, null, timeoutSeconds);
  }

  /**
   * 创建使用远程 IPFS 节点的客户端
   */
  static async newWithRemoteNode(
    apiUrl: string,
    gatewayUrl: string,
    timeoutSeconds: number = 30
  ): Promise<IpfsClient> {
    return new IpfsClient(apiUrl, gatewayUrl, null, null, timeoutSeconds);
  }

  /**
   * 创建使用 Pinata 的客户端
   */
  static async newWithPinata(
    apiKey: string,
    apiSecret: string,
    timeoutSeconds: number = 30
  ): Promise<IpfsClient> {
    return new IpfsClient(null, null, apiKey, apiSecret, timeoutSeconds);
  }

  /**
   * 上传内容到 IPFS
   */
  async upload(content: string, name: string = 'data'): Promise<IpfsUploadResult> {
    if (this.apiUrl) {
      return this.uploadToRemoteApi(content, name);
    }

    if (this.pinataConfig) {
      return this.uploadToPinata(content, name);
    }

    throw new IPFSError('未配置任何IPFS上传方式：缺少远程API或Pinata凭据');
  }

  /**
   * 上传到远程 IPFS API
   */
  private async uploadToRemoteApi(content: string, name: string): Promise<IpfsUploadResult> {
    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/json' });
    formData.append('file', blob, name);

    const url = `${this.apiUrl}/api/v0/add?pin=true`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const cid = result.Hash;

      if (!cid) {
        throw new Error('响应中缺少Hash字段');
      }

      const size = result.Size ? parseInt(result.Size, 10) : content.length;

      return {
        cid,
        size,
        uploadedAt: new Date().toISOString(),
        provider: 'remote_api',
      };
    } catch (error) {
      throw new IPFSError(`发送上传请求失败: ${url}`, { originalError: error });
    }
  }

  /**
   * 上传到 Pinata
   */
  private async uploadToPinata(content: string, name: string): Promise<IpfsUploadResult> {
    const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

    let jsonContent: any;
    try {
      jsonContent = JSON.parse(content);
    } catch {
      jsonContent = { data: content };
    }

    const body = {
      pinataContent: jsonContent,
      pinataMetadata: {
        name,
        keyvalues: {
          type: 'did-document',
          uploaded_by: 'diap-ts-sdk',
        },
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: this.pinataConfig!.apiKey,
          pinata_secret_api_key: this.pinataConfig!.apiSecret,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata返回错误 ${response.status}: ${errorText}`);
      }

      const pinataResponse = await response.json();

      return {
        cid: pinataResponse.IpfsHash,
        size: pinataResponse.PinSize,
        uploadedAt: new Date().toISOString(),
        provider: 'Pinata',
      };
    } catch (error) {
      throw new IPFSError('发送请求到Pinata失败', { originalError: error });
    }
  }

  /**
   * 从 IPFS 获取内容
   */
  async get(cid: string): Promise<string> {
    logger.info(`🔍 开始从IPFS获取内容: ${cid}`);

    if (this.gatewayUrl) {
      logger.info(`尝试从配置网关获取: ${this.gatewayUrl}`);
      try {
        const content = await this.getFromGateway(this.gatewayUrl, cid);
        logger.info(`✅ 成功从配置网关获取内容: ${cid}`);
        return content;
      } catch (error) {
        logger.warn(`❌ 从配置网关获取失败: ${error}`);
      }
    }

    for (const gateway of this.publicGateways) {
      try {
        const content = await this.getFromGateway(gateway, cid);
        return content;
      } catch (error) {
        logger.warn(`从${gateway}获取失败: ${error}`);
        continue;
      }
    }

    throw new IPFSError('无法从任何网关获取内容', { cid });
  }

  /**
   * 从指定网关获取内容
   */
  private async getFromGateway(gatewayUrl: string, cid: string): Promise<string> {
    const url = `${gatewayUrl}/ipfs/${cid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`网关返回错误: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      throw new IPFSError('发送请求失败', { originalError: error });
    }
  }

  /**
   * Pin 内容到远程 IPFS 节点
   */
  async pin(cid: string): Promise<void> {
    if (!this.apiUrl) {
      logger.warn('未配置远程IPFS节点，跳过pin操作');
      return;
    }

    const url = `${this.apiUrl}/api/v0/pin/add?arg=${cid}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      if (!response.ok) {
        throw new Error(`Pin失败: ${response.status}`);
      }

      logger.info(`成功pin内容: ${cid}`);
    } catch (error) {
      throw new IPFSError('发送pin请求失败', { originalError: error, cid });
    }
  }

  /**
   * 确保 IPNS 密钥存在
   */
  async ensureKeyExists(keyName: string): Promise<string> {
    if (!this.apiUrl) {
      throw new IPFSError('未配置远程IPFS API，无法进行IPNS key管理');
    }

    const urlList = `${this.apiUrl}/api/v0/key/list`;

    try {
      const resp = await fetch(urlList, {
        method: 'POST',
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      if (!resp.ok) {
        throw new Error(`key/list失败: ${resp.status}`);
      }

      const v = await resp.json();
      const keys = v.Keys || [];

      const exists = keys.some(
        (k: any) => k.Name === keyName
      );

      if (exists) {
        return keyName;
      }
    } catch (error) {
      throw new IPFSError('请求key/list失败', { originalError: error });
    }

    const urlGen = `${this.apiUrl}/api/v0/key/gen?arg=${encodeURIComponent(keyName)}&type=ed25519`;

    try {
      const respGen = await fetch(urlGen, {
        method: 'POST',
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      if (!respGen.ok) {
        const text = await respGen.text();
        throw new Error(`key/gen失败: ${respGen.status} - ${text}`);
      }
    } catch (error) {
      throw new IPFSError('请求key/gen失败', { originalError: error });
    }

    return keyName;
  }

  /**
   * 发布 IPNS 记录
   */
  async publishIpns(
    cid: string,
    keyName: string,
    lifetime: string = '8760h',
    ttl: string = '1h'
  ): Promise<IpnsPublishResult> {
    if (!this.apiUrl) {
      throw new IPFSError('未配置远程IPFS API，无法进行IPNS发布');
    }

    const argPath = `/ipfs/${cid}`;
    const url = `${this.apiUrl}/api/v0/name/publish?arg=${encodeURIComponent(argPath)}&key=${encodeURIComponent(keyName)}&allow-offline=true&resolve=true&lifetime=${encodeURIComponent(lifetime)}&ttl=${encodeURIComponent(ttl)}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'diap-ts-sdk/0.2',
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`IPNS发布失败: ${resp.status} - ${text}`);
      }

      const v = await resp.json();
      const name = v.Name || '';
      const value = v.Value || '';

      return {
        name,
        value,
        publishedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new IPFSError('发送IPNS发布请求失败', { originalError: error, cid, keyName });
    }
  }

  /**
   * 便捷：上传后发布到 IPNS
   */
  async publishAfterUpload(
    cid: string,
    keyName: string,
    lifetime: string = '8760h',
    ttl: string = '1h'
  ): Promise<IpnsPublishResult> {
    await this.ensureKeyExists(keyName);
    return this.publishIpns(cid, keyName, lifetime, ttl);
  }

  /**
   * 停止客户端
   */
  async stop(): Promise<void> {
    // HTTP 客户端不需要停止操作
    logger.debug('IPFS client stopped');
  }
}