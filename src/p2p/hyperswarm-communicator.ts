/**
 * DIAP TypeScript SDK - Hyperswarm P2P 通信器
 *
 * 使用 Hyperswarm 实现轻量级 P2P 网络
 *
 * 安装: npm install hyperswarm
 *
 * @example
 * ```typescript
 * import Hyperswarm from 'hyperswarm';
 *
 * const swarm = new Hyperswarm();
 * const topic = Buffer.alloc(32).fill('hello-world');
 * swarm.join(topic, { server: true, client: true });
 *
 * swarm.on('connection', (conn, info) => {
 *   console.log('新连接:', info.publicKey.toString('hex'));
 *   conn.write('hello from TS!');
 *   conn.on('data', data => console.log('收到:', data.toString()));
 * });
 * ```
 */

import { logger } from '../utils/logger.js';

/**
 * P2P 消息类型
 */
export enum P2PMessageType {
  /** 身份验证请求 */
  AuthRequest = 'auth_request',
  /** 身份验证响应 */
  AuthResponse = 'auth_response',
  /** 数据消息 */
  Data = 'data',
  /** 心跳 */
  Heartbeat = 'heartbeat',
  /** 自定义 */
  Custom = 'custom',
}

/**
 * Hyperswarm 配置
 */
export interface HyperswarmConfig {
  /** 是否作为服务器 */
  server?: boolean;
  /** 是否作为客户端 */
  client?: boolean;
  /** 是否自动连接 */
  autoConnect?: boolean;
  /** 最大连接数 */
  maxConnections?: number;
  /** 种子节点（单个 32 字节密钥用于确定性 keypair） */
  seed?: Buffer | Uint8Array;
  /** 启用多路复用 */
  multiplex?: boolean;
}

/**
 * P2P 连接信息
 */
export interface P2PConnection {
  /** 连接 ID */
  id: string;
  /** 对方公钥 */
  publicKey: string;
  /** 是否是入站连接 */
  isInbound: boolean;
  /** 连接建立时间 */
  connectedAt: number;
  /** 最后活动时间 */
  lastActivity: number;
  /** 已发送字节数 */
  bytesSent: number;
  /** 已接收字节数 */
  bytesReceived: number;
}

/**
 * P2P 节点地址
 */
export interface P2PNodeAddr {
  /** 公钥（hex 编码） */
  publicKey: string;
  /** 主题列表 */
  topics: string[];
  /** 连接地址 */
  relayAddresses?: string[];
}

/**
 * P2P 消息
 */
export interface P2PMessage {
  /** 消息 ID */
  id: string;
  /** 消息类型 */
  type: P2PMessageType;
  /** 发送者公钥 */
  fromPublicKey: string;
  /** 接收者公钥（可选） */
  toPublicKey?: string;
  /** 消息内容 */
  content: Uint8Array;
  /** 时间戳 */
  timestamp: number;
  /** 签名 */
  signature?: Uint8Array;
}

/**
 * P2P 消息签名数据
 */
export interface P2PMessageSignature {
  /** 签名者公钥 */
  signerPublicKey: string;
  /** 消息哈希 */
  messageHash: string;
  /** 签名 */
  signature: Uint8Array;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Hyperswarm P2P 通信器事件
 */
export interface HyperswarmEvents {
  /** 新连接事件 */
  connection: (conn: P2PConnection, info: { publicKey: Buffer }) => void;
  /** 错误事件 */
  error: (error: Error) => void;
  /** 主题加入事件 */
  topic: (topic: Buffer) => void;
  /** 消息事件 */
  message: (message: P2PMessage, conn: P2PConnection) => void;
}

/**
 * Hyperswarm P2P 通信器
 *
 * 基于 Hyperswarm 实现轻量级 P2P 网络
 * 专注于快速节点发现和加密连接
 */
export class HyperswarmCommunicator {
  private config: Required<Omit<HyperswarmConfig, 'seed'>> & { seed?: Buffer | Uint8Array };
  private swarm: unknown | null = null;
  private connections: Map<string, P2PConnection> = new Map();
  /** Underlying noise/UTP socket per connection, keyed by the same id used in `connections`. */
  private streams: Map<string, NodeJS.ReadWriteStream> = new Map();
  /** 标记调用方希望连接、但还没在 `connection` 事件里出现的公钥。 */
  private wantedPeers: Set<string> = new Set();
  private topics: Set<string> = new Set();
  private isRunning: boolean = false;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private localPublicKey: string | null = null;

  /**
   * 创建 Hyperswarm P2P 通信器
   */
  constructor(config?: HyperswarmConfig) {
    this.config = {
      server: config?.server ?? true,
      client: config?.client ?? true,
      autoConnect: config?.autoConnect ?? true,
      maxConnections: config?.maxConnections ?? 100,
      seed: config?.seed,
      multiplex: config?.multiplex ?? true,
    };

    logger.info('🔧 Hyperswarm P2P 通信器已创建');
    logger.info(`  服务器模式: ${this.config.server}`);
    logger.info(`  客户端模式: ${this.config.client}`);
    logger.info(`  最大连接数: ${this.config.maxConnections}`);
  }

  /**
   * 启动 P2P 网络
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ P2P 网络已在运行');
      return;
    }

    try {
      logger.info('🚀 启动 Hyperswarm P2P 网络...');

      // 动态导入 Hyperswarm
      const Hyperswarm = (await import('hyperswarm')).default;
      const swarmOpts = {
        maxConnections: this.config.maxConnections,
        multiplex: this.config.multiplex,
      };
      // 非空 seed 才传 — 空值/空 Buffer 会让 hyperswarm 断言失败
      if (this.config.seed) {
        (swarmOpts as { seed?: Buffer | Uint8Array }).seed = this.config.seed;
      }
      this.swarm = new Hyperswarm(swarmOpts);

      // 设置连接处理
      this.setupConnectionHandlers();

      this.isRunning = true;
      logger.info('✅ Hyperswarm P2P 网络已启动');
    } catch (error) {
      logger.error(`❌ 启动 P2P 网络失败: ${error}`);
      throw error;
    }
  }

  /**
   * 停止 P2P 网络
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('🛑 停止 Hyperswarm P2P 网络...');

      // 关闭所有连接
      for (const [id] of this.connections) {
        await this.closeConnection(id);
      }

      // 销毁 swarm
      if (this.swarm && typeof (this.swarm as { destroy?: Function }).destroy === 'function') {
        (this.swarm as { destroy: () => void }).destroy();
      }

      this.connections.clear();
      this.streams.clear();
      this.wantedPeers.clear();
      this.topics.clear();
      this.isRunning = false;

      logger.info('✅ Hyperswarm P2P 网络已停止');
    } catch (error) {
      logger.error(`❌ 停止 P2P 网络失败: ${error}`);
      throw error;
    }
  }

  /**
   * 加入主题
   * @param topic - 32 字节主题 Buffer
   */
  public async joinTopic(topic: Buffer | string): Promise<void> {
    if (!this.isRunning || !this.swarm) {
      throw new Error('P2P 网络未启动');
    }

    const topicHex = typeof topic === 'string' ? topic : topic.toString('hex');

    if (this.topics.has(topicHex)) {
      logger.warn(`⚠️ 已加入主题: ${topicHex.substring(0, 8)}...`);
      return;
    }

    try {
      logger.info(`🔗 加入主题: ${topicHex.substring(0, 8)}...`);

      // 创建 topic Buffer
      const topicBuffer =
        typeof topic === 'string' ? Buffer.from(topic, 'hex').slice(0, 32) : topic.slice(0, 32);

      // 加入主题（hyperswarm 4.x 的 join() 返回 PeerDiscoverySession）
      const session = (
        this.swarm as {
          join: (topic: Buffer, opts: object) => {
            refresh: (opts?: object) => Promise<void>;
            flushed: () => Promise<void>;
            destroy: () => Promise<void>;
          };
        }
      ).join(topicBuffer, {
        server: this.config.server,
        client: this.config.client,
      });

      // 触发一次 refresh，让 DHT 立刻开始查找
      try {
        await session.refresh({
          server: this.config.server,
          client: this.config.client,
        });
      } catch (e) {
        logger.warn(`⚠️ topic refresh 失败: ${e}`);
      }

      this.topics.add(topicHex);
      this.emit('topic', topicBuffer);

      // 等待 DHT 真正把本机宣布到这个主题，避免调用方立刻 connect 拿不到对端
      try {
        await session.flushed();
      } catch (e) {
        logger.warn(`⚠️ topic flushed 失败: ${e}`);
      }

      logger.info(`✅ 已加入主题: ${topicHex.substring(0, 8)}...`);
    } catch (error) {
      logger.error(`❌ 加入主题失败: ${error}`);
      throw error;
    }
  }

  /**
   * 离开主题
   */
  public async leaveTopic(topic: Buffer | string): Promise<void> {
    if (!this.isRunning || !this.swarm) {
      return;
    }

    const topicHex = typeof topic === 'string' ? topic : topic.toString('hex');

    if (!this.topics.has(topicHex)) {
      return;
    }

    try {
      const topicBuffer =
        typeof topic === 'string' ? Buffer.from(topic, 'hex').slice(0, 32) : topic.slice(0, 32);

      (this.swarm as { leave: (topic: Buffer) => void }).leave(topicBuffer);
      this.topics.delete(topicHex);

      logger.info(`✅ 已离开主题: ${topicHex.substring(0, 8)}...`);
    } catch (error) {
      logger.error(`❌ 离开主题失败: ${error}`);
    }
  }

  /**
   * 标记希望连接到指定公钥的节点
   *
   * Hyperswarm 本身没有 `swarm.connect(publicKey)` 这种按公钥直连的 API；
   * 对等节点是通过 `joinTopic` 进入 DHT 发现得到的。真正的 `P2PConnection`
   * 会在 `connection` 事件里产生并放入 `this.connections` / `this.streams`。
   *
   * 这里做两件事：
   *   1) 如果已经建立连接，直接返回；
   *   2) 否则记录到一个“想要连接”的集合里，等发现流程命中时复用。
   */
  public async connect(publicKey: Buffer | string): Promise<P2PConnection | null> {
    if (!this.isRunning || !this.swarm) {
      throw new Error('P2P 网络未启动');
    }

    const keyHex = typeof publicKey === 'string' ? publicKey : publicKey.toString('hex');

    // 已经连上了就直接返回
    const existing = this.connections.get(keyHex);
    if (existing) {
      return existing;
    }

    this.wantedPeers.add(keyHex);
    logger.info(`🔌 标记想要连接节点: ${keyHex.substring(0, 8)}...（等待 joinTopic 后 DHT 发现）`);
    return null;
  }

  /**
   * 关闭连接
   */
  public async closeConnection(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return;
    }

    try {
      this.connections.delete(connectionId);
      this.streams.delete(connectionId);
      logger.info(`🔌 已关闭连接: ${connectionId.substring(0, 8)}...`);
    } catch (error) {
      logger.error(`❌ 关闭连接失败: ${error}`);
    }
  }

  /**
   * 发送消息到连接
   */
  public async sendToConnection(connectionId: string, data: Uint8Array | string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      throw new Error('连接不存在');
    }

    const stream = this.streams.get(connectionId);
    if (!stream) {
      throw new Error(`连接 ${connectionId} 关联的流不存在`);
    }

    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);

    try {
      // 真正写入底层 noise/UTP 套接字
      stream.write(dataBuffer);

      conn.bytesSent += dataBuffer.length;
      conn.lastActivity = Date.now();

      logger.debug(`📤 发送数据到 ${connectionId.substring(0, 8)}...: ${dataBuffer.length} bytes`);
    } catch (error) {
      logger.error(`❌ 发送数据失败: ${error}`);
      throw error;
    }
  }

  /**
   * 广播消息到所有连接
   */
  public async broadcast(data: Uint8Array | string): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [id] of this.connections) {
      promises.push(this.sendToConnection(id, data));
    }

    await Promise.all(promises);
    logger.info(`📢 广播消息到 ${this.connections.size} 个连接`);
  }

  /**
   * 获取所有连接
   */
  public getConnections(): P2PConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取连接数
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * 获取本地公钥
   */
  public getLocalPublicKey(): string | null {
    return this.localPublicKey;
  }

  /**
   * 是否正在运行
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 获取配置
   */
  public getConfig(): HyperswarmConfig {
    return { ...this.config };
  }

  // 事件处理

  /**
   * 注册事件处理器
   */
  public on<K extends keyof HyperswarmEvents>(event: K, handler: HyperswarmEvents[K]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * 移除事件处理器
   */
  public off<K extends keyof HyperswarmEvents>(event: K, handler: HyperswarmEvents[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as Function)(...args);
        } catch (error) {
          logger.error(`❌ 事件处理器错误: ${error}`);
        }
      }
    }
  }

  // 私有方法

  /**
   * 设置连接处理器
   */
  private setupConnectionHandlers(): void {
    if (!this.swarm) return;

    (this.swarm as { on: (event: string, callback: Function) => void }).on(
      'connection',
      (conn: unknown, info: { publicKey: Buffer; client?: boolean }) => {
        const publicKey = info.publicKey.toString('hex');

        // `peerInfo.client === true` ⇒ 本机是 dialer，否则本机是 acceptor
        const isInbound = info.client !== true;

        // Hyperswarm 会去重双向连接，但出于健壮性考虑，如果已存在就替换旧 socket
        const existing = this.connections.get(publicKey);
        if (existing) {
          logger.warn(`⚠️ 重复收到 ${publicKey.substring(0, 8)}... 的连接事件，替换旧 socket`);
          this.connections.delete(publicKey);
          this.streams.delete(publicKey);
        }

        const p2pConn: P2PConnection = {
          id: this.generateId(),
          publicKey,
          isInbound,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
          bytesSent: 0,
          bytesReceived: 0,
        };

        this.connections.set(publicKey, p2pConn);
        this.streams.set(publicKey, conn as NodeJS.ReadWriteStream);
        this.setupStreamHandlers(conn, p2pConn);

        // 如果是有人调用过 `connect(publicKey)` 等的就是这条，清理待连接集合
        this.wantedPeers.delete(publicKey);

        logger.info(
          `🔗 新连接 (${isInbound ? '入站' : '出站'}): ${publicKey.substring(0, 8)}...`
        );
        this.emit('connection', p2pConn, info);
      }
    );
  }

  /**
   * 设置流处理器
   */
  private setupStreamHandlers(stream: unknown, conn: P2PConnection): void {
    const nodeStream = stream as {
      on: (event: string, callback: Function) => void;
      write: (data: Buffer) => void;
    };

    nodeStream.on('data', (data: Buffer) => {
      conn.bytesReceived += data.length;
      conn.lastActivity = Date.now();

      // 解析消息
      try {
        const message: P2PMessage = {
          id: this.generateId(),
          type: P2PMessageType.Data,
          fromPublicKey: conn.publicKey,
          content: new Uint8Array(data),
          timestamp: Date.now(),
        };

        this.emit('message', message, conn);
      } catch (error) {
        logger.error(`❌ 解析消息失败: ${error}`);
      }
    });

    nodeStream.on('error', (error: Error) => {
      logger.error(`❌ 连接错误: ${error}`);
      this.emit('error', error);
      this.connections.delete(conn.publicKey);
      this.streams.delete(conn.publicKey);
    });

    nodeStream.on('close', () => {
      logger.info(`🔌 连接关闭: ${conn.publicKey.substring(0, 8)}...`);
      this.connections.delete(conn.publicKey);
      this.streams.delete(conn.publicKey);
    });
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 对消息内容进行签名
   */
  public async signMessage(content: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const keyData = privateKey.slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, content as BufferSource);
    return new Uint8Array(signature);
  }

  /**
   * 验证消息签名
   */
  public async verifyMessageSignature(
    content: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    try {
      const keyData = publicKey.slice(0, 32);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      return await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signature as BufferSource,
        content as BufferSource
      );
    } catch (error) {
      logger.warn(`签名验证失败: ${error}`);
      return false;
    }
  }

  /**
   * 创建签名消息
   */
  public async createSignedMessage(
    type: P2PMessageType,
    content: Uint8Array,
    fromPublicKey: string,
    toPublicKey: string | undefined,
    privateKey: Uint8Array
  ): Promise<P2PMessage> {
    const message: P2PMessage = {
      id: this.generateId(),
      type,
      fromPublicKey,
      toPublicKey,
      content,
      timestamp: Date.now(),
      signature: undefined,
    };

    // 签名消息内容
    const signature = await this.signMessage(content, privateKey);
    message.signature = signature;

    return message;
  }

  /**
   * 验证并解析签名消息
   */
  public async verifySignedMessage(
    message: P2PMessage,
    senderPublicKey: Uint8Array
  ): Promise<boolean> {
    if (!message.signature) {
      logger.warn('消息缺少签名');
      return false;
    }

    return this.verifyMessageSignature(message.content, message.signature, senderPublicKey);
  }
}

/**
 * 创建 Hyperswarm P2P 通信器
 */
export function createHyperswarmCommunicator(config?: HyperswarmConfig): HyperswarmCommunicator {
  return new HyperswarmCommunicator(config);
}

/**
 * 从主题字符串创建 32 字节 Buffer
 */
export function createTopic(topic: string): Buffer {
  // 如果是 hex 字符串
  if (/^[0-9a-f]+$/i.test(topic)) {
    return Buffer.from(topic.padEnd(64, '0').slice(0, 64), 'hex');
  }

  // 如果是普通字符串，使用 SHA-256 哈希
  // 简化实现：直接使用字符串的前32字节，不足补零
  const buf = Buffer.alloc(32);
  Buffer.from(topic).copy(buf);
  return buf;
}

// ============================================================================
// 导出
// ============================================================================
// 注意: HyperswarmConfig, P2PConnection 等已在声明时导出
