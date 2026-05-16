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
}

const PUBLIC_IPFS_NODES: IpfsNodeConfig[] = [
  { apiUrl: 'https://ipfs.io/api/v0', gatewayUrl: 'https://ipfs.io', isLocal: false },
  { apiUrl: 'https://dweb.link/api/v0', gatewayUrl: 'https://dweb.link', isLocal: false },
  { apiUrl: 'https://cloudflare-ipfs.com/api/v0', gatewayUrl: 'https://cloudflare-ipfs.com', isLocal: false },
];

export class IpfsMultiPublisher {
  private localNode: IpfsNodeConfig | null = null;
  private remoteNodes: IpfsNodeConfig[];
  private keyName: string;

  constructor(keyName: string, localNode?: IpfsNodeConfig, remoteNodes?: IpfsNodeConfig[]) {
    this.keyName = keyName;
    this.localNode = localNode || null;
    this.remoteNodes = remoteNodes || PUBLIC_IPFS_NODES;
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

    const nodesToTry: IpfsNodeConfig[] = [];
    if (this.localNode) {
      nodesToTry.push(this.localNode);
    }
    nodesToTry.push(...this.remoteNodes);

    logger.info(`开始多节点 IPNS 发布，CID: ${cid}`);
    logger.info(`将尝试 ${nodesToTry.length} 个节点`);

    const publishPromises = nodesToTry.map(async (node) => {
      try {
        const result = await this.publishToNode(node, cid);
        publishedNodes.push(node.apiUrl);
        if (result && result.Name && !ipnsName) {
          ipnsName = result.Name;
        }
        logger.info(`节点发布成功: ${node.apiUrl}`);
      } catch (error) {
        failedNodes.push(node.apiUrl);
        logger.warn(`节点发布失败: ${node.apiUrl} - ${error}`);
      }
    });

    await Promise.allSettled(publishPromises);

    const totalTimeMs = Date.now() - startTime;
    const success = publishedNodes.length > 0;

    logger.info(`多节点发布完成`);
    logger.info(`成功: ${publishedNodes.length}/${nodesToTry.length}`);
    logger.info(`耗时: ${totalTimeMs}ms`);

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

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'diap-ts-sdk/0.2',
      },
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
    logger.info('使用本地 IPFS 节点进行发布');
  } else {
    logger.info('本地 IPFS 节点不可用，将使用远程节点');
  }

  return new IpfsMultiPublisher(keyName, localNode);
}
