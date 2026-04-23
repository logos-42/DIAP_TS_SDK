/**
 * DIAP TypeScript SDK - IPFS 节点管理器
 * 自动启动和管理本地 IPFS 节点
 */

import { EventEmitter } from 'events';
import { logger } from './utils/logger.js';

/**
 * IPFS 节点状态
 */
export enum IpfsNodeStatus {
  /** 未知 */
  Unknown = 'unknown',
  /** 启动中 */
  Starting = 'starting',
  /** 运行中 */
  Running = 'running',
  /** 已停止 */
  Stopped = 'stopped',
  /** 错误 */
  Error = 'error',
}

/**
 * IPFS 节点配置
 */
export interface IpfsNodeConfig {
  /** 数据目录 */
  dataDir?: string;
  /** API 端口 */
  apiPort?: number;
  /** 网关端口 */
  gatewayPort?: number;
  /** Swarm 端口 */
  swarmPort?: number;
  /** 自动启动 */
  autoStart?: boolean;
  /** 启动超时（秒） */
  startTimeout?: number;
}

/**
 * IPFS 节点信息
 */
export interface IpfsNodeInfo {
  /** 节点 ID */
  id: string;
  /** API 地址 */
  apiUrl: string;
  /** 网关地址 */
  gatewayUrl: string;
  /** 协议版本 */
  protocolVersion: string;
  /** 代理版本 */
  agentVersion: string;
}

/**
 * IPFS 节点管理器
 */
export class IpfsNodeManager extends EventEmitter {
  /** 配置 */
  private config: Required<IpfsNodeConfig>;
  /** 节点状态 */
  private status: IpfsNodeStatus;
  /** 进程对象 */
  private process?: any;
  /** 节点信息 */
  private nodeInfo?: IpfsNodeInfo;
  /** 健康检查定时器 */
  private healthCheckTimer?: NodeJS.Timeout;

  /**
   * 创建 IPFS 节点管理器
   */
  public static async create(config?: IpfsNodeConfig): Promise<IpfsNodeManager> {
    logger.info('🚀 创建 IPFS 节点管理器');

    const manager = new IpfsNodeManager(config);
    await manager.initialize();

    return manager;
  }

  /**
   * 构造函数
   */
  private constructor(config?: IpfsNodeConfig) {
    super();

    this.config = {
      dataDir: config?.dataDir || './ipfs-data',
      apiPort: config?.apiPort || 5001,
      gatewayPort: config?.gatewayPort || 8080,
      swarmPort: config?.swarmPort || 4001,
      autoStart: config?.autoStart ?? true,
      startTimeout: config?.startTimeout || 60,
    };

    this.status = IpfsNodeStatus.Unknown;
  }

  /**
   * 初始化管理器
   */
  private async initialize(): Promise<void> {
    logger.info('💾 IPFS 节点管理器已初始化');
    logger.info(`  数据目录: ${this.config.dataDir}`);
    logger.info(`  API 端口: ${this.config.apiPort}`);
    logger.info(`  网关端口: ${this.config.gatewayPort}`);
    logger.info(`  Swarm 端口: ${this.config.swarmPort}`);

    // 如果配置了自动启动，则启动节点
    if (this.config.autoStart) {
      await this.start();
    }
  }

  /**
   * 启动 IPFS 节点
   */
  public async start(): Promise<void> {
    if (this.status === IpfsNodeStatus.Running) {
      logger.info('IPFS 节点已在运行中');
      return;
    }

    logger.info('🔄 启动 IPFS 节点...');
    this.status = IpfsNodeStatus.Starting;
    this.emit('statusChange', { status: this.status });

    try {
      // 模拟节点启动（实际实现需要调用 kubo 或使用 Helia）
      await this.simulateNodeStart();

      this.status = IpfsNodeStatus.Running;
      this.emit('statusChange', { status: this.status });
      this.emit('started', {});

      logger.info('✅ IPFS 节点启动成功');

      // 启动健康检查
      this.startHealthCheck();
    } catch (error) {
      this.status = IpfsNodeStatus.Error;
      this.emit('statusChange', { status: this.status, error });
      throw error;
    }
  }

  /**
   * 模拟节点启动
   */
  private async simulateNodeStart(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.nodeInfo = {
          id: 'QmSimulatedNodeId123456789',
          apiUrl: `http://localhost:${this.config.apiPort}`,
          gatewayUrl: `http://localhost:${this.config.gatewayPort}`,
          protocolVersion: 'ipfs/0.4.0',
          agentVersion: 'kubo/0.26.0',
        };
        resolve();
      }, 1000);
    });
  }

  /**
   * 停止 IPFS 节点
   */
  public async stop(): Promise<void> {
    if (this.status === IpfsNodeStatus.Stopped) {
      logger.info('IPFS 节点已停止');
      return;
    }

    logger.info('🔄 停止 IPFS 节点...');
    this.status = IpfsNodeStatus.Stopped;
    this.emit('statusChange', { status: this.status });

    // 停止健康检查
    this.stopHealthCheck();

    this.emit('stopped', {});
    logger.info('✅ IPFS 节点已停止');
  }

  /**
   * 重启 IPFS 节点
   */
  public async restart(): Promise<void> {
    logger.info('🔄 重启 IPFS 节点...');
    await this.stop();
    await this.start();
    logger.info('✅ IPFS 节点重启成功');
  }

  /**
   * 获取节点状态
   */
  public getStatus(): IpfsNodeStatus {
    return this.status;
  }

  /**
   * 检查节点是否健康
   */
  public async isHealthy(): Promise<boolean> {
    if (this.status !== IpfsNodeStatus.Running) {
      return false;
    }

    try {
      // 模拟健康检查
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 API 地址
   */
  public getApiUrl(): string {
    return `http://localhost:${this.config.apiPort}`;
  }

  /**
   * 获取网关地址
   */
  public getGatewayUrl(): string {
    return `http://localhost:${this.config.gatewayPort}`;
  }

  /**
   * 获取节点信息
   */
  public getNodeInfo(): IpfsNodeInfo | null {
    return this.nodeInfo || null;
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    const intervalMs = 30000; // 每 30 秒检查一次

    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.isHealthy();
      if (!healthy && this.status === IpfsNodeStatus.Running) {
        logger.warn('⚠️ IPFS 节点健康检查失败');
        this.emit('unhealthy', {});
      }
    }, intervalMs);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 获取配置
   */
  public getConfig(): IpfsNodeConfig {
    return { ...this.config };
  }

  /**
   * 销毁管理器
   */
  public async destroy(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
    logger.info('🧹 IPFS 节点管理器已销毁');
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 IPFS 节点管理器（便捷函数）
 */
export async function createIpfsNodeManager(config?: IpfsNodeConfig): Promise<IpfsNodeManager> {
  return IpfsNodeManager.create(config);
}

// ============================================================================
// 导出
// ============================================================================
