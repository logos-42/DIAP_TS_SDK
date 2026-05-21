/**
 * DIAP TypeScript SDK - Iroh P2P 通信器
 *
 * 基于 Iroh 实现可靠的 P2P 通信
 * 支持端到端加密、QUIC 传输、心跳监控、NAT 穿透
 *
 * 安装: npm install @iroh-js/client
 *
 * @example
 * ```typescript
 * import { IrohCommunicator } from '@diap/sdk';
 *
 * const iroh = new IrohCommunicator({
 *   relays: ['https://relay1.iroh.example.com'],
 *   maxConnections: 100,
 * });
 *
 * await iroh.start();
 * await iroh.connectToNode(nodeId);
 * await iroh.sendMessage(nodeId, message);
 * ```
 */

import { logger } from '../utils/logger.js';

export interface IrohConfig {
  listenAddr?: string;
  dataDir?: string;
  maxConnections?: number;
  connectionTimeout?: number;
  relays?: string[];
  enableNatTraversal?: boolean;
}

export enum IrohMessageType {
  AuthRequest = 'auth_request',
  AuthResponse = 'auth_response',
  ResourceRequest = 'resource_request',
  ResourceResponse = 'resource_response',
  Heartbeat = 'heartbeat',
  Custom = 'custom',
}

export interface IrohMessage {
  messageId: string;
  messageType: IrohMessageType;
  fromDid: string;
  toDid?: string;
  content: string;
  timestamp: number;
  signature?: string;
  metadata: Record<string, string>;
}

export interface IrohConnection {
  remoteNodeId: string;
  remoteAddr: string;
  connected: boolean;
  connectedAt: number;
  lastHeartbeat: number;
  dataHash?: string;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
}

interface IrohCommunicatorConnection {
  raw: unknown;
  stream: IrohCommunicatorStream | null;
  info: IrohConnection;
}

interface IrohCommunicatorStream {
  [key: string]: any;
  send?(data: any): Promise<void>;
  receive?(): Promise<any>;
  close(): Promise<void>;
}

export class IrohCommunicator {
  private config: Required<IrohConfig>;
  private endpoint: unknown = null;
  private connections: Map<string, IrohCommunicatorConnection> = new Map();
  private nodeId: string | null = null;
  private isRunning: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: IrohConfig = {}) {
    this.config = {
      listenAddr: config.listenAddr ?? '0.0.0.0:0',
      dataDir: config.dataDir ?? '',
      maxConnections: config.maxConnections ?? 100,
      connectionTimeout: config.connectionTimeout ?? 30,
      relays: config.relays ?? [],
      enableNatTraversal: config.enableNatTraversal ?? true,
    };

    logger.info('🔧 Iroh P2P 通信器已创建');
    logger.info(`  最大连接数: ${this.config.maxConnections}`);
    logger.info(`  连接超时: ${this.config.connectionTimeout}s`);
    logger.info(`  NAT 穿透: ${this.config.enableNatTraversal ? '启用' : '禁用'}`);
    if (this.config.relays.length > 0) {
      logger.info(`  中继服务器: ${this.config.relays.length} 个`);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Iroh 通信器已在运行');
      return;
    }

    try {
      logger.info('🚀 启动 Iroh P2P 网络...');

      const irohModule = await import('@iroh-js/client');
      const Endpoint = irohModule.Endpoint;

      if (!Endpoint) {
        throw new Error('Iroh Endpoint 类未找到');
      }

      const builder = Endpoint.builder();

      const builderAny = builder as Record<string, any>;
      if (this.config.dataDir && typeof builderAny.dataDir === 'function') {
        builderAny.dataDir(this.config.dataDir);
      }

      if (this.config.relays.length > 0 && typeof builderAny.addRelay === 'function') {
        for (const relay of this.config.relays) {
          builderAny.addRelay(relay);
        }
      }

      if (this.config.enableNatTraversal && typeof builderAny.enableNatTraversal === 'function') {
        builderAny.enableNatTraversal();
      }

      this.endpoint = await builder.bind();

      const endpointAny = this.endpoint as Record<string, any>;
      if (endpointAny.nodeId && typeof endpointAny.nodeId === 'function') {
        const nodeIdResult = endpointAny.nodeId();
        this.nodeId = nodeIdResult.toString();
      } else {
        this.nodeId = this.generateNodeId();
      }

      this.setupIncomingConnectionHandler();

      this.isRunning = true;
      logger.info(`✅ Iroh P2P 网络已启动`);
      logger.info(`   节点 ID: ${this.nodeId?.substring(0, 16) ?? 'unknown'}...`);
    } catch (error) {
      logger.error(`❌ 启动 Iroh 网络失败: ${error}`);
      throw error;
    }
  }

  private setupIncomingConnectionHandler(): void {
    if (!this.endpoint) return;

    const endpointAny = this.endpoint as Record<string, any>;
    if (endpointAny.onIncomingConnection && typeof endpointAny.onIncomingConnection === 'function') {
      endpointAny.onIncomingConnection(
        async (conn: unknown) => {
          const connAny = conn as Record<string, any>;
          const remoteIdFunc = connAny.remoteNodeId;
          const remoteId = remoteIdFunc ? remoteIdFunc().toString() : 'unknown';

          logger.info(`🔗 收到来自节点: ${remoteId.substring(0, 8)}... 的连接`);

          try {
            const openStreamFunc = connAny.openStream;
            const stream = openStreamFunc ? await openStreamFunc('diap-v1') : null;

            const connectionInfo: IrohConnection = {
              remoteNodeId: remoteId,
              remoteAddr: remoteId,
              connected: true,
              connectedAt: Date.now(),
              lastHeartbeat: Date.now(),
            };

            this.connections.set(remoteId, {
              raw: conn,
              stream: stream as IrohCommunicatorStream | null,
              info: connectionInfo,
            });

            logger.info(`✅ 已接受来自节点: ${remoteId.substring(0, 8)}... 的连接`);
          } catch (error) {
            logger.error(`❌ 接受连接失败: ${error}`);
          }
        }
      );
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('🛑 停止 Iroh P2P 网络...');

      this.stopHeartbeatMonitor();

      const closePromises: Promise<void>[] = [];
      for (const [nodeId, entry] of this.connections) {
        closePromises.push(
          (async () => {
            try {
              if (entry.stream) {
                const streamAny = entry.stream as Record<string, any>;
                if (streamAny.close) {
                  await streamAny.close();
                }
              }
              const connAny = entry.raw as Record<string, any>;
              if (connAny.close) {
                await connAny.close();
              }
              logger.debug(`🔌 已关闭与节点 ${nodeId.substring(0, 8)}... 的连接`);
            } catch (error) {
              logger.warn(`关闭连接时出错: ${error}`);
            }
          })()
        );
      }

      await Promise.all(closePromises);
      this.connections.clear();

      if (this.endpoint) {
        const endpointAny = this.endpoint as Record<string, any>;
        if (endpointAny.close) {
          await endpointAny.close();
        }
        this.endpoint = null;
      }

      this.isRunning = false;
      logger.info('✅ Iroh P2P 网络已停止');
    } catch (error) {
      logger.error(`❌ 停止 Iroh 网络失败: ${error}`);
      this.isRunning = false;
    }
  }

  public getNodeId(): string {
    if (!this.nodeId) {
      throw new Error('Iroh 通信器未启动');
    }
    return this.nodeId;
  }

  public getNodeAddr(): string {
    return this.getNodeId();
  }

  public async connectToNode(nodeId: string): Promise<string> {
    if (!this.isRunning || !this.endpoint) {
      throw new Error('Iroh 通信器未启动');
    }

    if (this.connections.has(nodeId)) {
      logger.info(`🔗 已连接到节点: ${nodeId.substring(0, 8)}...`);
      return nodeId;
    }

    try {
      logger.info(`🔗 连接到节点: ${nodeId.substring(0, 8)}...`);

      const endpointAny = this.endpoint as Record<string, any>;
      if (!endpointAny.connect) {
        throw new Error('Endpoint.connect 方法不可用');
      }

      const peerId = this.createPeerId(nodeId);
      const conn = await endpointAny.connect(peerId);
      const connAny = conn as Record<string, any>;

      const openStreamFunc = connAny.openStream;
      const stream = openStreamFunc ? await openStreamFunc('diap-v1') : null;

      const connectionInfo: IrohConnection = {
        remoteNodeId: nodeId,
        remoteAddr: nodeId,
        connected: true,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      };

      this.connections.set(nodeId, {
        raw: conn,
        stream: stream as IrohCommunicatorStream | null,
        info: connectionInfo,
      });

      logger.info(`✅ 已连接到节点: ${nodeId.substring(0, 8)}...`);
      return nodeId;
    } catch (error) {
      logger.error(`❌ 连接失败: ${error}`);
      throw error;
    }
  }

  public async disconnectFromNode(nodeId: string): Promise<void> {
    const entry = this.connections.get(nodeId);
    if (entry) {
      try {
        if (entry.stream) {
          const streamAny = entry.stream as Record<string, any>;
          if (streamAny.close) {
            await streamAny.close();
          }
        }
        const connAny = entry.raw as Record<string, any>;
        if (connAny.close) {
          await connAny.close();
        }
        logger.info(`🔌 已断开与节点的连接: ${nodeId.substring(0, 8)}...`);
      } catch (error) {
        logger.warn(`断开连接时出错: ${error}`);
      }
      this.connections.delete(nodeId);
    }
  }

  public async sendMessage(nodeId: string, message: IrohMessage): Promise<void> {
    const entry = this.connections.get(nodeId);
    if (!entry || !entry.stream) {
      throw new Error(`节点未连接: ${nodeId}`);
    }

    try {
      const messageData = JSON.stringify(message);
      const encoder = new TextEncoder();
      const encoded = encoder.encode(messageData);

      const lengthPrefix = new Uint8Array(4);
      new DataView(lengthPrefix.buffer).setUint32(0, encoded.length, false);

      const dataToSend = this.concatUint8Arrays(lengthPrefix, encoded);

      const streamAny = entry.stream as Record<string, any>;
      if (!streamAny.send) {
        throw new Error('Stream.send 方法不可用');
      }

      await streamAny.send(dataToSend);

      entry.info.lastHeartbeat = Date.now();
      entry.info.dataHash = await this.computeHash(encoded);

      logger.debug(
        `📤 消息已发送 (消息 ID: ${message.messageId}, 哈希: ${entry.info.dataHash?.substring(0, 8) ?? 'unknown'}...)`
      );
    } catch (error) {
      logger.error(`❌ 发送消息失败: ${error}`);
      throw error;
    }
  }

  public async receiveMessage(nodeId: string): Promise<IrohMessage | null> {
    const entry = this.connections.get(nodeId);
    if (!entry || !entry.stream) {
      return null;
    }

    try {
      const streamAny = entry.stream as Record<string, any>;
      if (!streamAny.receive) {
        return null;
      }

      const lengthBytes = await streamAny.receive();
      if (lengthBytes.length < 4) {
        return null;
      }

      const lengthView = new DataView(lengthBytes.buffer as ArrayBuffer, lengthBytes.byteOffset, lengthBytes.byteLength);
      const length = lengthView.getUint32(0, false);

      const contentBytes = await streamAny.receive();
      const decoder = new TextDecoder();
      const jsonStr = decoder.decode(contentBytes.slice(0, length));

      return JSON.parse(jsonStr) as IrohMessage;
    } catch (error) {
      logger.debug(`接收消息时出错: ${error}`);
      return null;
    }
  }

  public createAuthRequest(fromDid: string, toDid: string, challenge: string): IrohMessage {
    return {
      messageId: this.generateId(),
      messageType: IrohMessageType.AuthRequest,
      fromDid,
      toDid,
      content: `认证请求：${challenge}`,
      timestamp: Date.now(),
      metadata: { challenge },
    };
  }

  public createAuthResponse(fromDid: string, toDid: string, response: string): IrohMessage {
    return {
      messageId: this.generateId(),
      messageType: IrohMessageType.AuthResponse,
      fromDid,
      toDid,
      content: `认证响应：${response}`,
      timestamp: Date.now(),
      metadata: { response },
    };
  }

  public createHeartbeat(fromDid: string): IrohMessage {
    return {
      messageId: this.generateId(),
      messageType: IrohMessageType.Heartbeat,
      fromDid,
      content: '心跳',
      timestamp: Date.now(),
      metadata: {},
    };
  }

  public createCustomMessage(
    fromDid: string,
    toDid: string | undefined,
    content: string,
    messageType: string
  ): IrohMessage {
    return {
      messageId: this.generateId(),
      messageType: IrohMessageType.Custom,
      fromDid,
      toDid,
      content,
      timestamp: Date.now(),
      metadata: { customType: messageType },
    };
  }

  public getConnections(): Map<string, IrohConnection> {
    const result = new Map<string, IrohConnection>();
    for (const [nodeId, { info }] of this.connections) {
      result.set(nodeId, { ...info });
    }
    return result;
  }

  public isConnected(nodeId: string): boolean {
    const entry = this.connections.get(nodeId);
    return entry ? entry.info.connected : false;
  }

  public getConnectionStats(): ConnectionStats {
    const total = this.connections.size;
    const active = Array.from(this.connections.values()).filter((e) => e.info.connected).length;
    return {
      totalConnections: total,
      activeConnections: active,
    };
  }

  public startHeartbeatMonitor(fromDid: string, intervalMs: number = 30000): void {
    if (this.heartbeatInterval) {
      this.stopHeartbeatMonitor();
    }

    logger.info(`💓 启动心跳监控 (间隔: ${intervalMs}ms)`);

    this.heartbeatInterval = setInterval(async () => {
      const heartbeat = this.createHeartbeat(fromDid);

      for (const [nodeId, { info }] of this.connections) {
        if (info.connected) {
          try {
            await this.sendMessage(nodeId, heartbeat);
          } catch (error) {
            logger.error(`发送心跳失败 (${nodeId.substring(0, 8)}...): ${error}`);
          }
        }
      }
    }, intervalMs);
  }

  public stopHeartbeatMonitor(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('💓 心跳监控已停止');
    }
  }

  public getConnectedNodes(): string[] {
    return Array.from(this.connections.keys());
  }

  public isNodeConnected(nodeId: string): boolean {
    return this.connections.has(nodeId);
  }

  public getConfig(): IrohConfig {
    return { ...this.config };
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  private createPeerId(nodeId: string): { toBytes(): Uint8Array } {
    return {
      toBytes: () => {
        if (nodeId.length === 64) {
          const bytes = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            bytes[i] = parseInt(nodeId.substr(i * 2, 2), 16);
          }
          return bytes;
        }
        throw new Error('无效的节点 ID 格式');
      },
    };
  }

  private generateNodeId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private generateId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async computeHash(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
}

export function createIrohCommunicator(config?: IrohConfig): IrohCommunicator {
  return new IrohCommunicator(config);
}
