/**
 * IPFS Multi-Node Publisher
 * 多节点 IPNS 发布器，支持本地 IPFS 节点和多个远程节点并行发布
 */

import { logger } from './utils/logger.js';

export interface MultiNodePublishResult {
  success: boolean;
  cid: string;
  ipnsName?: string;
  publishedNodes: string[];
  failedNodes: string[];
  totalTimeMs: number;
}

export interface IpfsNodeConfig {
  apiUrl: string;
  gatewayUrl?: string;
  isLocal?: boolean;
  headers?: Record<string, string>;
}

export interface GatewayCredentials {
  pinata?: { apiKey: string; secretKey: string };
  infura?: { projectId: string; projectSecret: string };
  web3Storage?: { token: string };
}

// 不再使用公共 IPFS 节点（Kubo RPC 已被关闭）
// IPNS 发布只依赖用户本地的 Kubo 节点

function buildAuthHeader(credentials: GatewayCredentials): Record<string, string> | undefined {
  if (credentials.pinata) {
    const token = Buffer.from(`${credentials.pinata.apiKey}:${credentials.pinata.secretKey}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  if (credentials.infura) {
    const token = Buffer.from(`${credentials.infura.projectId}:${credentials.infura.projectSecret}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  if (credentials.web3Storage) {
    return { Authorization: `Bearer ${credentials.web3Storage.token}` };
  }
  return undefined;
}

export class IpfsMultiPublisher {
  private localNode: IpfsNodeConfig | null = null;
  private remoteNodes: IpfsNodeConfig[];
  private keyName: string;
  private keyEnsured: boolean = false;

  constructor(keyName: string, localNode?: IpfsNodeConfig, remoteNodes?: IpfsNodeConfig[]) {
    this.keyName = keyName;
    this.localNode = localNode || null;
    this.remoteNodes = remoteNodes || [];
  }

  /**
   * 确保密钥在指定节点上存在
   */
  private async ensureKeyExistsOnNode(node: IpfsNodeConfig): Promise<boolean> {
    try {
      const urlList = `${node.apiUrl}/key/list`;
      const resp = await fetch(urlList, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        logger.warn(`节点 ${node.apiUrl} 的 key/list 请求失败`);
        return false;
      }

      const v = await resp.json();
      const keys = v.Keys || [];
      const exists = keys.some((k: any) => k.Name === this.keyName);

      if (exists) {
        logger.info(`密钥 ${this.keyName} 在节点 ${node.apiUrl} 已存在`);
        return true;
      }
    } catch (error) {
      logger.warn(`检查密钥是否存在时出错 ${node.apiUrl}: ${error}`);
    }

    try {
      const urlGen = `${node.apiUrl}/key/gen?arg=${encodeURIComponent(this.keyName)}&type=ed25519`;
      const respGen = await fetch(urlGen, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });

      if (respGen.ok) {
        logger.info(`密钥 ${this.keyName} 在节点 ${node.apiUrl} 创建成功`);
        return true;
      } else {
        const text = await respGen.text();
        logger.warn(`节点 ${node.apiUrl} 创建密钥失败: ${respGen.status} - ${text}`);
        return false;
      }
    } catch (error) {
      logger.warn(`创建密钥时出错 ${node.apiUrl}: ${error}`);
      return false;
    }
  }

  /**
   * 确保密钥在所有可用节点上存在
   */
  async ensureKeyExists(): Promise<void> {
    if (this.keyEnsured) {
      return;
    }

    const nodesToCheck: IpfsNodeConfig[] = [];
    if (this.localNode) {
      nodesToCheck.push(this.localNode);
    }

    logger.info(`开始确保密钥 ${this.keyName} 在 ${nodesToCheck.length} 个节点上存在`);

    const results = await Promise.all(
      nodesToCheck.map((node) => this.ensureKeyExistsOnNode(node))
    );

    if (results.some((r) => r)) {
      this.keyEnsured = true;
      logger.info(`密钥 ${this.keyName} 初始化完成`);
    } else {
      logger.warn(`所有节点的密钥初始化都失败了，发布时可能失败`);
    }
  }

  /**
   * 检查本地 IPFS 节点是否可用
   */
  static async checkLocalNode(): Promise<boolean> {
    try {
      const resp = await fetch('http://localhost:5001/api/v0/id', {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * 从多节点并行发布 IPNS
   */
  async publishMultiNode(cid: string): Promise<MultiNodePublishResult> {
    const startTime = Date.now();
    const publishedNodes: string[] = [];
    const failedNodes: string[] = [];
    let ipnsName: string | undefined;

    if (!this.localNode) {
      logger.info('⚠️ 没有可用的本地 IPFS 节点，跳过 IPNS 发布（仅使用 CID）');
      return {
        success: false,
        cid,
        publishedNodes: [],
        failedNodes: [],
        totalTimeMs: Date.now() - startTime,
      };
    }

    logger.info(`开始发布 IPNS（仅本地节点）`);
    logger.info(`  本地节点: ${this.localNode.apiUrl}`);

    try {
      const result = await this.publishToNode(this.localNode, cid);
      publishedNodes.push(this.localNode.apiUrl);
      if (result && result.Name) {
        ipnsName = result.Name;
      }
      logger.info(`✅ 本地 IPNS 发布成功: ${ipnsName || 'N/A'}`);
    } catch (error) {
      failedNodes.push(this.localNode.apiUrl);
      logger.warn(`⚠️ 本地 IPNS 发布失败: ${error}`);
    }

    const totalTimeMs = Date.now() - startTime;
    const success = publishedNodes.length > 0;

    logger.info(`  结果: ${success ? '✅ 成功' : '❌ 失败'} (${totalTimeMs}ms)`);

    return {
      success,
      cid,
      ipnsName,
      publishedNodes,
      failedNodes,
      totalTimeMs,
    };
  }

  /**
   * 向单个节点发布
   */
  private async publishToNode(node: IpfsNodeConfig, cid: string): Promise<any> {
    const argPath = `/ipfs/${cid}`;
    const url = `${node.apiUrl}/name/publish?arg=${encodeURIComponent(argPath)}&key=${encodeURIComponent(this.keyName)}&allow-offline=true&resolve=true`;

    const headers: Record<string, string> = {
      'User-Agent': 'diap-ts-sdk/0.2',
    };
    if (node.headers) {
      Object.assign(headers, node.headers);
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${resp.status}: ${text}`);
    }

    const v = await resp.json();
    return v;
  }

  /**
   * 获取本地节点配置
   */
  getLocalNode(): IpfsNodeConfig | null {
    return this.localNode;
  }

  /**
   * 设置本地节点
   */
  setLocalNode(node: IpfsNodeConfig): void {
    this.localNode = node;
  }
}

/**
 * 检查本地 IPFS Kubo 是否已安装
 */
export async function isKuboInstalled(): Promise<boolean> {
  if (typeof process !== 'undefined' && process.execPath) {
    try {
      const { execSync } = await import('child_process');
      execSync('ipfs version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 启动本地 IPFS 守护进程
 */
export async function startLocalKubo(): Promise<{ success: boolean; error?: string }> {
  if (typeof process !== 'undefined' && process.execPath) {
    try {
      const { execSync, spawn } = await import('child_process');

      // 检查是否已运行
      try {
        execSync('ipfs id', { stdio: 'pipe' });
        logger.info('IPFS 守护进程已在运行');
        return { success: true };
      } catch {
        // 未运行，需要启动
      }

      // 在后台启动 ipfs daemon
      const daemon = spawn('ipfs', ['daemon', '--enable-pubsub-experiment'], {
        detached: true,
        stdio: 'ignore',
      });

      daemon.unref();

      // 等待 daemon 启动
      await new Promise((resolve) => setTimeout(resolve, 5000));

      logger.info('IPFS 守护进程已启动');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  return { success: false, error: 'Not in Node.js environment' };
}

/**
 * 创建多节点发布器，自动检测本地节点
 */
export async function createMultiPublisher(keyName: string): Promise<IpfsMultiPublisher> {
  const localNodeAvailable = await IpfsMultiPublisher.checkLocalNode();

  let localNode: IpfsNodeConfig | undefined;
  if (localNodeAvailable) {
    localNode = {
      apiUrl: 'http://localhost:5001/api/v0',
      gatewayUrl: 'http://localhost:8080',
      isLocal: true,
    };
    logger.info('✅ 检测到本地 Kubo 节点，将用于 IPNS 发布');
  } else {
    logger.info('ℹ️ 本地 Kubo 节点不可用，跳过 IPNS 发布（仅使用 CID）');
  }

  const publisher = new IpfsMultiPublisher(keyName, localNode);
  await publisher.ensureKeyExists();
  return publisher;
}

/**
 * 使用 Pinata 凭证创建发布器
 * @param keyName 密钥名称
 * @param apiKey Pinata API Key
 * @param secretKey Pinata Secret Key
 */
export async function createPinataPublisher(keyName: string, apiKey: string, secretKey: string): Promise<IpfsMultiPublisher> {
  const authHeader = buildAuthHeader({
    pinata: { apiKey, secretKey }
  });

  const localNodeAvailable = await IpfsMultiPublisher.checkLocalNode();

  const nodes: IpfsNodeConfig[] = [];
  if (localNodeAvailable) {
    nodes.push({
      apiUrl: 'http://localhost:5001/api/v0',
      gatewayUrl: 'http://localhost:8080',
      isLocal: true,
    });
    logger.info('使用本地 IPFS 节点 + Pinata 进行发布');
  }

  nodes.push({
    apiUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
    gatewayUrl: 'https://gateway.pinata.cloud/ipfs/',
    isLocal: false,
    headers: authHeader,
  });

  const publisher = new IpfsMultiPublisher(keyName, nodes[0], nodes.slice(1));
  await publisher.ensureKeyExists();
  return publisher;
}

/**
 * 使用 Infura 凭证创建发布器
 * @param keyName 密钥名称
 * @param projectId Infura Project ID
 * @param projectSecret Infura Project Secret
 */
export async function createInfuraPublisher(keyName: string, projectId: string, projectSecret: string): Promise<IpfsMultiPublisher> {
  const authHeader = buildAuthHeader({
    infura: { projectId, projectSecret }
  });

  const localNodeAvailable = await IpfsMultiPublisher.checkLocalNode();

  const nodes: IpfsNodeConfig[] = [];
  if (localNodeAvailable) {
    nodes.push({
      apiUrl: 'http://localhost:5001/api/v0',
      gatewayUrl: 'http://localhost:8080',
      isLocal: true,
    });
    logger.info('使用本地 IPFS 节点 + Infura 进行发布');
  }

  nodes.push({
    apiUrl: 'https://ipfs.infura.io:5001/api/v0',
    gatewayUrl: 'https://ipfs.infura.io/ipfs/',
    isLocal: false,
    headers: authHeader,
  });

  const publisher = new IpfsMultiPublisher(keyName, nodes[0], nodes.slice(1));
  await publisher.ensureKeyExists();
  return publisher;
}

/**
 * 使用 Web3.Storage 凭证创建发布器
 * @param keyName 密钥名称
 * @param token Web3.Storage API Token
 */
export async function createWeb3StoragePublisher(keyName: string, token: string): Promise<IpfsMultiPublisher> {
  const authHeader = buildAuthHeader({
    web3Storage: { token }
  });

  const localNodeAvailable = await IpfsMultiPublisher.checkLocalNode();

  const nodes: IpfsNodeConfig[] = [];
  if (localNodeAvailable) {
    nodes.push({
      apiUrl: 'http://localhost:5001/api/v0',
      gatewayUrl: 'http://localhost:8080',
      isLocal: true,
    });
    logger.info('使用本地 IPFS 节点 + Web3.Storage 进行发布');
  }

  nodes.push({
    apiUrl: 'https://api.web3.storage/upload',
    gatewayUrl: 'https://w3s.link/ipfs/',
    isLocal: false,
    headers: authHeader,
  });

  const publisher = new IpfsMultiPublisher(keyName, nodes[0], nodes.slice(1));
  await publisher.ensureKeyExists();
  return publisher;
}

/**
 * 使用自定义网关凭证创建发布器
 * @param keyName 密钥名称
 * @param apiUrl API URL
 * @param gatewayUrl Gateway URL
 * @param headers 认证 headers
 */
export async function createCustomPublisher(
  keyName: string,
  apiUrl: string,
  gatewayUrl?: string,
  headers?: Record<string, string>
): Promise<IpfsMultiPublisher> {
  const localNodeAvailable = await IpfsMultiPublisher.checkLocalNode();

  const nodes: IpfsNodeConfig[] = [];
  if (localNodeAvailable) {
    nodes.push({
      apiUrl: 'http://localhost:5001/api/v0',
      gatewayUrl: 'http://localhost:8080',
      isLocal: true,
    });
    logger.info('使用本地 IPFS 节点 + 自定义网关进行发布');
  }

  nodes.push({
    apiUrl,
    gatewayUrl,
    isLocal: false,
    headers,
  });

  const publisher = new IpfsMultiPublisher(keyName, nodes[0], nodes.slice(1));
  await publisher.ensureKeyExists();
  return publisher;
}
