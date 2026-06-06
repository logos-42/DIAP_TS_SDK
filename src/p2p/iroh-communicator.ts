/**
 * DIAP TypeScript SDK - Iroh P2P 通信器
 *
 * 基于 @number0/iroh（iroh-ffi）实现可靠的 P2P 通信
 * 支持端到端加密、QUIC 传输、NAT 穿透（依赖 iroh 节点自带的 relay + hole-punch）
 *
 * 安装: npm install @number0/iroh
 *
 * 真实 API（来自 @number0/iroh 的 index.d.ts）:
 *   - Iroh.memory(opts?) / Iroh.persistent(path, opts?)  ⇒ Iroh
 *   - NodeOptions.protocols = { [alpn]: (err, endpoint) => ProtocolHandler }
 *   - Iroh.net.nodeId() / Iroh.net.nodeAddr()
 *   - Iroh.node.endpoint()  ⇒ Endpoint
 *   - Endpoint.connect(nodeAddr, alpn)  ⇒ Promise<Connection>
 *   - Connection.openBi() / openUni() / acceptBi() / acceptUni()
 *   - BiStream.send (SendStream): writeAll(buf) | write(buf) | finish()
 *   - BiStream.recv (RecvStream): readExact(buf) | readToEnd(sizeLimit) | read(buf) ⇒ Promise<bigint | null>
 *   - Connection.close(errorCode, reason)
 *
 * @example
 * ```typescript
 * const iroh = new IrohCommunicator({ alpn: 'diap-v1' });
 * await iroh.start();
 * iroh.on('message', (msg, conn) => console.log(msg, conn.remoteNodeId));
 * await iroh.connectToNode(targetNodeId);
 * await iroh.sendMessage(targetNodeId, msg);
 * ```
 */

import { logger } from '../utils/logger.js';

export interface IrohConfig {
  /** ALPN 协议标识。默认 'diap-v1'。 */
  alpn?: string;
  /** 持久化数据目录；不传就用 Iroh.memory() 内存节点。 */
  dataDir?: string;
  /** 最大并发连接数。仅用于上层 gate，不传给 iroh。 */
  maxConnections?: number;
  /** 中继 URL 列表（首次 connect 远端时使用）。 */
  relays?: string[];
  /** 心跳间隔（ms）。0 = 关闭。默认 30000。 */
  heartbeatIntervalMs?: number;
  /** 单帧最大字节数，超过会拒绝发送/接收。默认 1 MiB。 */
  maxFrameSize?: number;
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

export interface IrohConnectionInfo {
  remoteNodeId: string;
  connected: boolean;
  connectedAt: number;
  lastActivity: number;
  bytesSent: number;
  bytesReceived: number;
  inbound: boolean;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
}

/** iroh-ffi 真实类（用 unknown 兜底，便于测试时注入桩）。 */
type IrohNative = {
  net: { nodeId(): Promise<string>; nodeAddr(): Promise<NodeAddrLike> };
  node: { endpoint(): unknown; shutdown(): Promise<void> };
};
type NodeAddrLike = {
  nodeId: string;
  relayUrl?: string | null;
  addresses?: string[];
};
type SendStreamLike = {
  writeAll(buf: Uint8Array): Promise<void>;
  write(buf: Uint8Array): Promise<bigint>;
  finish(): Promise<void>;
};
type RecvStreamLike = {
  readExact(buf: Uint8Array): Promise<void>;
  read(buf: Uint8Array): Promise<bigint | null>;
  readToEnd(sizeLimit: number): Promise<Buffer>;
};
type BiStreamLike = { send: SendStreamLike; recv: RecvStreamLike };
type ConnectionLike = {
  remoteNodeId(): string;
  openBi(): Promise<BiStreamLike>;
  acceptBi(): Promise<BiStreamLike>;
  close(errorCode: bigint, reason: Uint8Array): void;
};
type EndpointLike = {
  nodeId(): string;
  connect(nodeAddr: NodeAddrLike, alpn: Uint8Array): Promise<ConnectionLike>;
};
type ProtocolHandler = {
  accept: (err: Error | null, arg: ConnectionLike) => void;
  shutdown?: (err: Error | null) => void;
};

interface IrohCommunicatorConnection {
  raw: ConnectionLike;
  bi: BiStreamLike;
  info: IrohConnectionInfo;
  /** 后台读循环的 cancel 函数。 */
  cancelRead: () => void;
}

export type IrohEventMap = {
  message: (msg: IrohMessage, conn: IrohConnectionInfo) => void;
  connection: (conn: IrohConnectionInfo) => void;
  disconnection: (remoteNodeId: string) => void;
  error: (err: Error) => void;
};
type IrohEventName = keyof IrohEventMap;
type IrohEventHandler<K extends IrohEventName> = IrohEventMap[K];

export class IrohCommunicator {
  private config: Required<IrohConfig>;
  private node: IrohNative | null = null;
  private endpoint: EndpointLike | null = null;
  private connections: Map<string, IrohCommunicatorConnection> = new Map();
  private isRunning = false;
  private nodeId: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(config: IrohConfig = {}) {
    this.config = {
      alpn: config.alpn ?? 'diap-v1',
      dataDir: config.dataDir ?? '',
      maxConnections: config.maxConnections ?? 100,
      relays: config.relays ?? [],
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
      maxFrameSize: config.maxFrameSize ?? 1024 * 1024,
    };

    logger.info('🔧 Iroh P2P 通信器已创建');
    logger.info(`  ALPN: ${this.config.alpn}`);
    logger.info(`  最大连接数: ${this.config.maxConnections}`);
    logger.info(`  心跳: ${this.config.heartbeatIntervalMs}ms`);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Iroh 通信器已在运行');
      return;
    }

    try {
      logger.info('🚀 启动 Iroh P2P 网络...');

      // @number0/iroh（iroh-ffi 官方 n0-computer 包）。
      // 用 dynamic import 避免在没装的机器上直接 import 报错。
      const irohModule: any = await import('@number0/iroh');
      const Iroh = irohModule.Iroh;
      if (!Iroh) {
        throw new Error('@number0/iroh 的 Iroh 类未找到');
      }

      const alpnBytes = new TextEncoder().encode(this.config.alpn);

      const nodeOpts: { protocols?: Record<number, (err: Error | null, endpoint: EndpointLike) => ProtocolHandler> } = {
        protocols: {
          // iroh-ffi 要求 protocols key 是 number[]，value 返回 ProtocolHandler
          [alpnBytes.length ? alpnBytes[0] : 0]: (
            _err: Error | null,
            _endpoint: EndpointLike
          ): ProtocolHandler => ({
            accept: (err: Error | null, conn: ConnectionLike) => {
              if (err) {
                logger.error(`❌ 接受连接失败: ${err.message}`);
                return;
              }
              this.handleIncomingConnection(conn).catch((e) =>
                logger.error(`处理入站连接异常: ${e}`)
              );
            },
          }),
        },
      };

      this.node =
        this.config.dataDir
          ? ((await Iroh.persistent(this.config.dataDir, nodeOpts)) as IrohNative)
          : ((await Iroh.memory(nodeOpts)) as IrohNative);

      this.nodeId = await this.node.net.nodeId();
      this.endpoint = this.node.node.endpoint() as EndpointLike;

      this.isRunning = true;
      logger.info(`✅ Iroh P2P 网络已启动`);
      logger.info(`   节点 ID: ${this.nodeId.slice(0, 16)}…`);

      if (this.config.heartbeatIntervalMs > 0) {
        this.startHeartbeatLoop();
      }
    } catch (error) {
      logger.error(`❌ 启动 Iroh 网络失败: ${error}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('🛑 停止 Iroh P2P 网络...');
    this.stopHeartbeatLoop();

    // 关闭所有连接
    for (const [remoteId, entry] of this.connections) {
      try {
        entry.cancelRead();
        // 通知对端
        try {
          await entry.bi.send.finish();
        } catch {
          /* ignore */
        }
        try {
          entry.raw.close(0n, new Uint8Array());
        } catch {
          /* ignore */
        }
      } catch (e) {
        logger.warn(`关闭 ${remoteId.slice(0, 8)}… 失败: ${e}`);
      }
    }
    this.connections.clear();

    if (this.node) {
      try {
        await this.node.node.shutdown();
      } catch (e) {
        logger.warn(`shutdown 失败: ${e}`);
      }
      this.node = null;
    }
    this.endpoint = null;
    this.nodeId = null;
    this.isRunning = false;
    logger.info('✅ Iroh P2P 网络已停止');
  }

  public getNodeId(): string {
    if (!this.nodeId) throw new Error('Iroh 通信器未启动');
    return this.nodeId;
  }

  public async getNodeAddr(): Promise<NodeAddrLike> {
    if (!this.node) throw new Error('Iroh 通信器未启动');
    return await this.node.net.nodeAddr();
  }

  public async connectToNode(nodeAddrOrId: string | NodeAddrLike): Promise<IrohConnectionInfo> {
    if (!this.isRunning || !this.endpoint) {
      throw new Error('Iroh 通信器未启动');
    }

    const nodeAddr: NodeAddrLike =
      typeof nodeAddrOrId === 'string' ? { nodeId: nodeAddrOrId } : nodeAddrOrId;

    const remoteId = nodeAddr.nodeId;

    const existing = this.connections.get(remoteId);
    if (existing) {
      logger.info(`🔗 已连接到节点: ${remoteId.slice(0, 8)}…`);
      return existing.info;
    }

    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`达到最大连接数 ${this.config.maxConnections}`);
    }

    // 缺省附上第一个 relay
    if (!nodeAddr.relayUrl && this.config.relays.length > 0) {
      nodeAddr.relayUrl = this.config.relays[0];
    }

    logger.info(`🔗 连接到节点: ${remoteId.slice(0, 8)}…`);
    const alpn = new TextEncoder().encode(this.config.alpn);
    const conn = await this.endpoint.connect(nodeAddr, alpn);
    const bi = await conn.openBi();
    return this.registerConnection(remoteId, conn, bi, false);
  }

  /** 入站连接：等对端 openBi() 之后调这个登记。 */
  private async handleIncomingConnection(conn: ConnectionLike): Promise<void> {
    const remoteId = conn.remoteNodeId();
    if (this.connections.has(remoteId)) {
      // 已经存在（旧连接残留），关闭新连接
      try {
        conn.close(0n, new Uint8Array());
      } catch {
        /* ignore */
      }
      return;
    }
    const bi = await conn.openBi();
    this.registerConnection(remoteId, conn, bi, true);
  }

  private registerConnection(
    remoteId: string,
    conn: ConnectionLike,
    bi: BiStreamLike,
    inbound: boolean
  ): IrohConnectionInfo {
    const info: IrohConnectionInfo = {
      remoteNodeId: remoteId,
      connected: true,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      bytesSent: 0,
      bytesReceived: 0,
      inbound,
    };
    const cancel = this.startReadLoop(remoteId, bi, info);
    const entry: IrohCommunicatorConnection = { raw: conn, bi, info, cancelRead: cancel };
    this.connections.set(remoteId, entry);
    logger.info(
      `🔗 ${inbound ? '入站' : '出站'} 连接已建立: ${remoteId.slice(0, 8)}…`
    );
    this.emit('connection', info);
    return info;
  }

  public async disconnectFromNode(remoteId: string): Promise<void> {
    const entry = this.connections.get(remoteId);
    if (!entry) return;
    try {
      entry.cancelRead();
      await entry.bi.send.finish();
    } catch (e) {
      logger.warn(`断开 ${remoteId.slice(0, 8)}… 失败: ${e}`);
    }
    try {
      entry.raw.close(0n, new Uint8Array());
    } catch {
      /* ignore */
    }
    this.connections.delete(remoteId);
    this.emit('disconnection', remoteId);
    logger.info(`🔌 已断开: ${remoteId.slice(0, 8)}…`);
  }

  public async sendMessage(
    remoteId: string,
    message: IrohMessage
  ): Promise<void> {
    const entry = this.connections.get(remoteId);
    if (!entry) throw new Error(`节点未连接: ${remoteId}`);

    const json = JSON.stringify(message);
    const body = new TextEncoder().encode(json);
    if (body.byteLength > this.config.maxFrameSize) {
      throw new Error(
        `消息体 ${body.byteLength} 字节超过 maxFrameSize=${this.config.maxFrameSize}`
      );
    }

    // 4 字节大端长度前缀
    const lenBuf = new Uint8Array(4);
    new DataView(lenBuf.buffer).setUint32(0, body.byteLength, false);
    const frame = concatUint8Arrays(lenBuf, body);

    await entry.bi.send.writeAll(frame);

    entry.info.bytesSent += frame.byteLength;
    entry.info.lastActivity = Date.now();

    logger.debug(
      `📤 → ${remoteId.slice(0, 8)}… (${message.messageType}, ${body.byteLength}B)`
    );
  }

  /**
   * 后台读循环：不断 readExact 4 字节长度，再 readExact N 字节消息体。
   * 用 setImmediate + AbortController 风格的 cancel 函数来停止。
   */
  private startReadLoop(
    remoteId: string,
    bi: BiStreamLike,
    info: IrohConnectionInfo
  ): () => void {
    let stopped = false;
    const lenBuf = new Uint8Array(4);

    const loop = async () => {
      try {
        while (!stopped) {
          await bi.recv.readExact(lenBuf);
          const len = new DataView(lenBuf.buffer, lenBuf.byteOffset, 4).getUint32(0, false);
          if (len === 0) continue;
          if (len > this.config.maxFrameSize) {
            throw new Error(
              `收到 ${len} 字节帧，超过 maxFrameSize=${this.config.maxFrameSize}`
            );
          }
          const body = new Uint8Array(len);
          await bi.recv.readExact(body);
          info.bytesReceived += 4 + len;
          info.lastActivity = Date.now();

          let msg: IrohMessage;
          try {
            msg = JSON.parse(new TextDecoder().decode(body)) as IrohMessage;
          } catch (e) {
            this.emit('error', new Error(`解析消息失败: ${e}`));
            continue;
          }
          this.emit('message', msg, { ...info });
        }
      } catch (e) {
        if (!stopped) {
          logger.debug(`read loop 结束 (${remoteId.slice(0, 8)}…): ${(e as Error).message}`);
          // 远端断开：清理登记
          const entry = this.connections.get(remoteId);
          if (entry) {
            this.connections.delete(remoteId);
            this.emit('disconnection', remoteId);
          }
        }
      }
    };

    // 启动
    void loop();

    return () => {
      stopped = true;
    };
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      for (const [remoteId, entry] of this.connections) {
        if (!entry.info.connected) continue;
        const beat: IrohMessage = {
          messageId: generateId(),
          messageType: IrohMessageType.Heartbeat,
          fromDid: this.nodeId ?? '',
          content: 'ping',
          timestamp: Date.now(),
          metadata: {},
        };
        this.sendMessage(remoteId, beat).catch((e) =>
          logger.warn(`心跳到 ${remoteId.slice(0, 8)}… 失败: ${e}`)
        );
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeatLoop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public getConnections(): IrohConnectionInfo[] {
    return Array.from(this.connections.values()).map((e) => ({ ...e.info }));
  }

  public isConnected(remoteId: string): boolean {
    return this.connections.has(remoteId);
  }

  public getConnectionStats(): ConnectionStats {
    let active = 0;
    for (const e of this.connections.values()) {
      if (e.info.connected) active++;
    }
    return { totalConnections: this.connections.size, activeConnections: active };
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public getConfig(): IrohConfig {
    return { ...this.config };
  }

  // 事件 API
  public on<K extends IrohEventName>(event: K, handler: IrohEventHandler<K>): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler as Function);
  }

  public off<K extends IrohEventName>(event: K, handler: IrohEventHandler<K>): void {
    this.eventHandlers.get(event)?.delete(handler as Function);
  }

  private emit<K extends IrohEventName>(
    event: K,
    ...args: Parameters<IrohEventHandler<K>>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        (h as Function)(...(args as unknown[]));
      } catch (e) {
        logger.error(`事件 ${event} 处理器异常: ${e}`);
      }
    }
  }
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.byteLength;
  }
  return out;
}

function generateId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createIrohCommunicator(config?: IrohConfig): IrohCommunicator {
  return new IrohCommunicator(config);
}
