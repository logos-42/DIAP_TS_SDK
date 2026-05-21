import { logger } from '../utils/logger.js';
import type { PeerId } from '@libp2p/interface-peer-id';
import type { Libp2p } from 'libp2p';
import type { PubSub } from '@chainsafe/libp2p-gossipsub';
import type { Connection } from '@libp2p/interface-connection';

export interface Libp2pConfig {
  listenAddresses?: string[];
  bootstrapPeers?: string[];
  enableNatTraversal?: boolean;
  enableRelay?: boolean;
  maxConnections?: number;
}

export interface Libp2pMessage {
  id: string;
  from: string;
  to?: string;
  topic: string;
  data: Uint8Array;
  timestamp: number;
  signature?: Uint8Array;
}

export interface Libp2pConnection {
  peerId: string;
  multiaddrs: string[];
  connectedAt: number;
  protocols: string[];
}

export type Libp2pEventCallback<T = unknown> = (data: T) => void;

export class Libp2pCommunicator {
  private config: Required<Libp2pConfig>;
  private node: Libp2p | null = null;
  private pubsub: PubSub | null = null;
  private connections: Map<string, Libp2pConnection> = new Map();
  private eventHandlers: Map<string, Set<Libp2pEventCallback>> = new Map();
  private isRunning: boolean = false;
  private messageHandlers: Map<string, (msg: Libp2pMessage) => void> = new Map();

  constructor(config: Libp2pConfig = {}) {
    this.config = {
      listenAddresses: config.listenAddresses ?? ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws'],
      bootstrapPeers: config.bootstrapPeers ?? [],
      enableNatTraversal: config.enableNatTraversal ?? true,
      enableRelay: config.enableRelay ?? true,
      maxConnections: config.maxConnections ?? 100,
    };

    logger.info('🔧 Libp2p P2P 通信器已创建');
    logger.info(`  监听地址: ${this.config.listenAddresses.join(', ')}`);
    logger.info(`  最大连接数: ${this.config.maxConnections}`);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Libp2p 节点已在运行');
      return;
    }

    try {
      logger.info('🚀 启动 Libp2p P2P 网络...');

      const { createLibp2p } = await import('libp2p');
      const { gossipsub } = await import('@chainsafe/libp2p-gossipsub');
      const { tcp } = await import('@libp2p/tcp');
      const { webSockets } = await import('@libp2p/websockets');
      const { webRTCStar } = await import('@libp2p/webrtc-star');
      const { mplex } = await import('@libp2p/mplex');
      const { noise } = await import('@libp2p/noise');
      const { identify } = await import('@libp2p/identify');
      const { gater } = await import('@libp2p/gater');
      const { mdns } = await import('@libp2p/mdns');
      const { bootstrap } = await import('@libp2p/bootstrap');

      this.node = await createLibp2p({
        addresses: {
          listen: this.config.listenAddresses,
        },
        transports: [
          tcp(),
          webSockets(),
          webRTCStar(),
        ],
        streamMuxers: [mplex],
        connectionEncryption: [noise],
        peerDiscovery: [
          mdns({ interval: 20000 }),
          bootstrap({ list: this.config.bootstrapPeers }),
        ],
        pubsub: gossipsub({ 
          allowSelfOrigin: true,
          fallbackToAnnounceSelf: true,
        }),
        services: {
          identify: identify(),
          gater: gater({
            maxConnections: this.config.maxConnections,
          }),
        },
      });

      this.pubsub = this.node.services.pubsub as PubSub;

      this.setupEventHandlers();

      await this.node.start();
      this.isRunning = true;

      logger.info('✅ Libp2p P2P 网络已启动');
      logger.info(`   节点 ID: ${this.node.peerId.toString()}`);
      logger.info(`   监听地址: ${this.node.getMultiaddrs().map(a => a.toString()).join(', ')}`);
    } catch (error) {
      logger.error(`❌ 启动 Libp2p 节点失败: ${error}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.node) {
      return;
    }

    try {
      logger.info('🛑 停止 Libp2p P2P 网络...');

      await this.node.stop();
      this.connections.clear();
      this.isRunning = false;

      logger.info('✅ Libp2p P2P 网络已停止');
    } catch (error) {
      logger.error(`❌ 停止 Libp2p 节点失败: ${error}`);
      throw error;
    }
  }

  public async subscribe(topic: string, handler: (msg: Libp2pMessage) => void): Promise<void> {
    if (!this.isRunning || !this.pubsub) {
      throw new Error('Libp2p 节点未启动');
    }

    this.messageHandlers.set(topic, handler);
    this.pubsub.subscribe(topic);

    logger.info(`🔔 已订阅主题: ${topic}`);
  }

  public async unsubscribe(topic: string): Promise<void> {
    if (!this.isRunning || !this.pubsub) {
      return;
    }

    this.messageHandlers.delete(topic);
    this.pubsub.unsubscribe(topic);

    logger.info(`🔕 已取消订阅主题: ${topic}`);
  }

  public async publish(topic: string, data: Uint8Array | string): Promise<void> {
    if (!this.isRunning || !this.pubsub) {
      throw new Error('Libp2p 节点未启动');
    }

    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const message: Libp2pMessage = {
      id: this.generateId(),
      from: this.node!.peerId.toString(),
      topic,
      data: dataBuffer,
      timestamp: Date.now(),
    };

    await this.pubsub.publish(topic, new Uint8Array(this.encodeMessage(message)));

    logger.debug(`📢 已发布消息到主题: ${topic}`);
  }

  public async connectToPeer(peerAddr: string): Promise<Libp2pConnection> {
    if (!this.isRunning || !this.node) {
      throw new Error('Libp2p 节点未启动');
    }

    try {
      const { multiaddr } = await import('@multiformats/multiaddr');
      const ma = multiaddr(peerAddr);

      const connection = await this.node.dial(ma);
      const peerId = connection.remotePeer.toString();

      const conn: Libp2pConnection = {
        peerId,
        multiaddrs: connection.remoteAddr.toArray().map(a => a.toString()),
        connectedAt: Date.now(),
        protocols: connection.remoteAddrProtocols,
      };

      this.connections.set(peerId, conn);

      logger.info(`🔗 已连接到节点: ${peerId.substring(0, 8)}...`);
      return conn;
    } catch (error) {
      logger.error(`❌ 连接节点失败: ${error}`);
      throw error;
    }
  }

  public getConnections(): Libp2pConnection[] {
    return Array.from(this.connections.values());
  }

  public getPeerId(): string | null {
    return this.node?.peerId.toString() ?? null;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public on(event: string, handler: Libp2pEventCallback): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  public off(event: string, handler: Libp2pEventCallback): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private setupEventHandlers(): void {
    if (!this.node) return;

    this.node.addEventListener('peer:connect', (evt) => {
      const connection = evt.detail as Connection;
      const peerId = connection.remotePeer.toString();
      
      const conn: Libp2pConnection = {
        peerId,
        multiaddrs: connection.remoteAddr.toArray().map(a => a.toString()),
        connectedAt: Date.now(),
        protocols: [],
      };
      
      this.connections.set(peerId, conn);
      this.emit('peer:connect', conn);
      logger.info(`🔗 新连接: ${peerId.substring(0, 8)}...`);
    });

    this.node.addEventListener('peer:disconnect', (evt) => {
      const connection = evt.detail as Connection;
      const peerId = connection.remotePeer.toString();
      
      this.connections.delete(peerId);
      this.emit('peer:disconnect', peerId);
      logger.info(`🔌 连接断开: ${peerId.substring(0, 8)}...`);
    });

    if (this.pubsub) {
      this.pubsub.addEventListener('message', (evt) => {
        const { topic, data } = evt.detail;
        const message = this.decodeMessage(new Uint8Array(data)) as Libp2pMessage;
        
        const handler = this.messageHandlers.get(topic);
        if (handler) {
          handler(message);
        }
        this.emit('message', message);
      });
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          logger.error(`❌ 事件处理器错误: ${error}`);
        }
      }
    }
  }

  private generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private encodeMessage(msg: Libp2pMessage): Buffer {
    const json = JSON.stringify({
      id: msg.id,
      from: msg.from,
      to: msg.to,
      topic: msg.topic,
      data: Buffer.from(msg.data).toString('base64'),
      timestamp: msg.timestamp,
    });
    return Buffer.from(json);
  }

  private decodeMessage(data: Uint8Array): Libp2pMessage {
    const json = JSON.parse(new TextDecoder().decode(data));
    return {
      id: json.id,
      from: json.from,
      to: json.to,
      topic: json.topic,
      data: Uint8Array.from(Buffer.from(json.data, 'base64')),
      timestamp: json.timestamp,
    };
  }
}

export function createLibp2pCommunicator(config?: Libp2pConfig): Libp2pCommunicator {
  return new Libp2pCommunicator(config);
}