/**
 * DIAP TypeScript SDK - IPFS PubSub 认证通讯模块
 * 基于 Iroh 实现认证的发布/订阅通信
 */

import { logger } from './utils/logger.js';

/**
 * PubSub 消息类型
 */
export enum PubSubMessageType {
  /** 身份验证请求 */
  AuthRequest = 'auth_request',
  /** 身份验证响应 */
  AuthResponse = 'auth_response',
  /** 资源访问请求 */
  ResourceRequest = 'resource_request',
  /** 资源访问响应 */
  ResourceResponse = 'resource_response',
  /** 心跳消息 */
  Heartbeat = 'heartbeat',
  /** 自定义消息 */
  Custom = 'custom',
}

/**
 * 主题授权策略
 */
export enum TopicPolicy {
  /** 允许所有经过认证的用户 */
  AllowAuthenticated = 'allow_authenticated',
  /** 仅允许特定 DID 列表 */
  AllowList = 'allow_list',
  /** 拒绝特定 DID 列表 */
  DenyList = 'deny_list',
  /** 自定义验证函数 */
  Custom = 'custom',
}

/**
 * 认证的 PubSub 消息
 */
export interface AuthenticatedMessage {
  /** 消息 ID */
  messageId: string;
  /** 消息类型 */
  messageType: PubSubMessageType;
  /** 发送者 DID */
  fromDid: string;
  /** 接收者 DID（可选，为空表示广播） */
  toDid?: string;
  /** 发送者 PeerID */
  fromPeerId: string;
  /** DID 文档的 CID */
  didCid: string;
  /** 主题 */
  topic: string;
  /** 消息内容（原始数据） */
  content: Uint8Array;
  /** Nonce（防重放） */
  nonce: string;
  /** ZKP 证明 */
  zkpProof: Uint8Array;
  /** 内容签名 */
  signature: Uint8Array;
  /** 时间戳 */
  timestamp: number;
}

/**
 * PubSub 认证请求负载
 */
export interface PubsubAuthRequestPayload {
  /** 目标身份的 CID */
  targetCid: string;
  /** 建议的响应主题（可选） */
  responseTopic?: string;
  /** 附加说明 */
  note?: string;
}

/**
 * PubSub 认证响应负载
 */
export interface PubsubAuthResponsePayload {
  /** 请求方的 nonce（用于匹配请求） */
  requestNonce: string;
  /** 目标身份的 CID */
  targetCid: string;
  /** 是否成功生成证明 */
  success: boolean;
  /** 附加说明 */
  note?: string;
}

/**
 * PubSub 消息验证结果
 */
export interface MessageVerification {
  /** 是否验证通过 */
  verified: boolean;
  /** 发送者 DID */
  fromDid: string;
  /** 验证详情 */
  details: string[];
  /** 验证时间戳 */
  verifiedAt: number;
}

/**
 * 主题配置
 */
export interface TopicConfig {
  /** 主题名称 */
  name: string;
  /** 授权策略 */
  policy: TopicPolicy;
  /** 允许/拒绝列表（根据策略） */
  list?: string[];
  /** 是否需要 ZKP 验证 */
  requireZkp: boolean;
  /** 是否需要签名验证 */
  requireSignature: boolean;
}

/**
 * PubSub 认证器
 */
export class PubsubAuthenticator {
  private keypair: { did: string; publicKey: Uint8Array; privateKey: Uint8Array } | null = null;
  private peerId: string | null = null;
  private localCid: string | null = null;
  private topicConfigs: Map<string, TopicConfig> = new Map();
  private subscribedTopics: string[] = [];
  private messageStats: Map<string, number> = new Map();
  private usedNonces: Set<string> = new Set();

  /**
   * 构造函数
   */
  constructor() {
    logger.info('🔐 PubSub 认证器已创建');
  }

  /**
   * 判断给定标识是否为 IPNS 格式
   */
  public isIpnsFormat(value: string): boolean {
    const v = value.trim();
    if (v.startsWith('/ipns/')) {
      return true;
    }
    if (v.length >= 46 && v.length <= 100) {
      try {
        return this.isBase58(v);
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * 检查字符串是否为 Base58 编码
   */
  private isBase58(value: string): boolean {
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    for (const char of value) {
      if (!base58Chars.includes(char)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 从 DID 文档中提取 PubSub 认证主题
   */
  public extractAuthTopicFromDid(didDocument: {
    service?: Array<{
      serviceType: string;
      serviceEndpoint: { topic?: string } | string;
    }>;
  }): string | null {
    if (!didDocument.service) {
      return null;
    }

    for (const svc of didDocument.service) {
      if (svc.serviceType.toLowerCase() === 'pubsubauth') {
        const endpoint = svc.serviceEndpoint;
        if (typeof endpoint === 'object' && endpoint.topic) {
          return endpoint.topic;
        }
      }
    }
    return null;
  }

  /**
   * 设置本地身份
   */
  public setLocalIdentity(
    keypair: { did: string; publicKey: Uint8Array; privateKey: Uint8Array },
    peerId: string,
    cid: string
  ): void {
    this.keypair = keypair;
    this.peerId = peerId;
    this.localCid = cid;

    logger.info(`✅ 本地身份已设置`);
    logger.info(`  DID: ${keypair.did}`);
    logger.info(`  CID: ${cid}`);
  }

  /**
   * 配置主题策略
   */
  public configureTopic(config: TopicConfig): void {
    this.topicConfigs.set(config.name, config);
    logger.info(`✅ 主题已配置: ${config.name}`);
  }

  /**
   * 订阅主题
   */
  public subscribeTopic(topic: string): void {
    if (!this.subscribedTopics.includes(topic)) {
      this.subscribedTopics.push(topic);
      logger.info(`✅ 已订阅主题: ${topic}`);
    }
  }

  /**
   * 取消订阅主题
   */
  public unsubscribeTopic(topic: string): void {
    const index = this.subscribedTopics.indexOf(topic);
    if (index !== -1) {
      this.subscribedTopics.splice(index, 1);
      logger.info(`✅ 已取消订阅主题: ${topic}`);
    }
  }

  /**
   * 获取订阅的主题列表
   */
  public getSubscribedTopics(): string[] {
    return [...this.subscribedTopics];
  }

  /**
   * 创建认证消息
   */
  public async createAuthenticatedMessage(
    topic: string,
    messageType: PubSubMessageType,
    content: Uint8Array,
    toDid?: string
  ): Promise<AuthenticatedMessage> {
    if (!this.keypair || !this.peerId || !this.localCid) {
      throw new Error('本地身份未设置');
    }

    // 生成 nonce
    const nonce = this.generateNonce();

    // 签名消息内容
    const signature = await this.signMessage(content, nonce, topic);

    const message: AuthenticatedMessage = {
      messageId: this.generateUUID(),
      messageType,
      fromDid: this.keypair.did,
      toDid,
      fromPeerId: this.peerId,
      didCid: this.localCid,
      topic,
      content,
      nonce,
      zkpProof: new Uint8Array(), // 简化版本
      signature,
      timestamp: Date.now(),
    };

    logger.debug(`✅ 认证消息已创建: ${message.messageId}`);

    return message;
  }

  /**
   * 构建身份认证请求消息
   */
  public async sendAuthRequest(
    authTopic: string,
    targetCid: string,
    responseTopic?: string,
    toDid?: string,
    note?: string
  ): Promise<AuthenticatedMessage> {
    const payload: PubsubAuthRequestPayload = {
      targetCid,
      responseTopic,
      note,
    };

    const content = new TextEncoder().encode(JSON.stringify(payload));
    return this.createAuthenticatedMessage(
      authTopic,
      PubSubMessageType.AuthRequest,
      content,
      toDid
    );
  }

  /**
   * 处理身份认证请求消息
   */
  public async handleAuthRequest(
    request: AuthenticatedMessage,
    overrideResponseTopic?: string,
    note?: string
  ): Promise<{ message: AuthenticatedMessage; payload: PubsubAuthResponsePayload }> {
    if (request.messageType !== PubSubMessageType.AuthRequest) {
      throw new Error('消息类型不是 AuthRequest');
    }

    const requestPayload = this.parseAuthRequest(request);

    if (!this.localCid) {
      throw new Error('本地身份 CID 未设置');
    }

    const responseTopic = overrideResponseTopic || request.topic;

    const responsePayload: PubsubAuthResponsePayload = {
      requestNonce: request.nonce,
      targetCid: this.localCid,
      success: true,
      note,
    };

    const content = new TextEncoder().encode(JSON.stringify(responsePayload));
    const message = await this.createAuthenticatedMessage(
      responseTopic,
      PubSubMessageType.AuthResponse,
      content,
      request.fromDid
    );

    return { message, payload: responsePayload };
  }

  /**
   * 解析认证请求消息的负载
   */
  public parseAuthRequest(message: AuthenticatedMessage): PubsubAuthRequestPayload {
    if (message.messageType !== PubSubMessageType.AuthRequest) {
      throw new Error('消息类型不是 AuthRequest');
    }
    return JSON.parse(new TextDecoder().decode(message.content));
  }

  /**
   * 解析认证响应消息的负载
   */
  public parseAuthResponse(message: AuthenticatedMessage): PubsubAuthResponsePayload {
    if (message.messageType !== PubSubMessageType.AuthResponse) {
      throw new Error('消息类型不是 AuthResponse');
    }
    return JSON.parse(new TextDecoder().decode(message.content));
  }

  /**
   * 验证认证消息
   */
  public async verifyMessage(message: AuthenticatedMessage): Promise<MessageVerification> {
    const details: string[] = [];
    let verified = true;

    logger.info(`🔍 验证消息: ${message.messageId}`);
    logger.info(`  发送者 DID: ${message.fromDid}`);

    // 1. 验证 nonce（防重放）
    if (this.usedNonces.has(message.nonce)) {
      verified = false;
      details.push('✗ Nonce 已被使用（重放攻击）');
      logger.warn('检测到重放攻击！');
    } else {
      this.usedNonces.add(message.nonce);
      details.push('✓ Nonce 验证通过');
    }

    // 2. 检查主题授权
    const topicConfig = this.topicConfigs.get(message.topic);
    if (topicConfig) {
      if (topicConfig.policy === TopicPolicy.AllowList && topicConfig.list) {
        if (!topicConfig.list.includes(message.fromDid)) {
          verified = false;
          details.push('✗ DID 不在允许列表中');
        }
      } else if (topicConfig.policy === TopicPolicy.DenyList && topicConfig.list) {
        if (topicConfig.list.includes(message.fromDid)) {
          verified = false;
          details.push('✗ DID 在拒绝列表中');
        }
      }
    }

    // 3. 验证签名
    const isValidSignature = await this.verifyMessageSignature(
      message.content,
      message.nonce,
      message.topic,
      message.signature
    );

    if (isValidSignature) {
      details.push('✓ 消息签名验证通过');
    } else {
      verified = false;
      details.push('✗ 消息签名验证失败');
    }

    logger.info(`验证结果: ${verified ? '✅ 通过' : '❌ 失败'}`);

    return {
      verified,
      fromDid: message.fromDid,
      details,
      verifiedAt: Date.now(),
    };
  }

  /**
   * 创建心跳消息
   */
  public async createHeartbeat(topic: string): Promise<AuthenticatedMessage> {
    const content = new TextEncoder().encode(`HEARTBEAT:${Date.now()}`);
    return this.createAuthenticatedMessage(topic, PubSubMessageType.Heartbeat, content);
  }

  /**
   * 创建简化的认证消息
   */
  public async createSimpleMessage(topic: string, content: string): Promise<AuthenticatedMessage> {
    return this.createAuthenticatedMessage(
      topic,
      PubSubMessageType.Custom,
      new TextEncoder().encode(content)
    );
  }

  /**
   * 序列化消息为字节
   */
  public serializeMessage(message: AuthenticatedMessage): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(message));
  }

  /**
   * 反序列化消息
   */
  public deserializeMessage(data: Uint8Array): AuthenticatedMessage {
    return JSON.parse(new TextDecoder().decode(data));
  }

  /**
   * 更新消息统计
   */
  public updateMessageStats(topic: string): void {
    const count = this.messageStats.get(topic) || 0;
    this.messageStats.set(topic, count + 1);
  }

  /**
   * 获取消息统计
   */
  public getMessageStats(): Map<string, number> {
    return new Map(this.messageStats);
  }

  // 私有辅助方法

  /**
   * 生成 nonce
   */
  private generateNonce(): string {
    const array = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 生成 UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 签名消息
   */
  private async signMessage(
    content: Uint8Array,
    nonce: string,
    topic: string
  ): Promise<Uint8Array> {
    if (!this.keypair) {
      throw new Error('密钥对未设置');
    }

    const data = new Uint8Array(content.length + nonce.length + topic.length);
    data.set(content);
    data.set(new TextEncoder().encode(nonce), content.length);
    data.set(new TextEncoder().encode(topic), content.length + nonce.length);

    const keyData = this.keypair.privateKey.slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(signature);
  }

  /**
   * 验证消息签名
   */
  private async verifyMessageSignature(
    content: Uint8Array,
    nonce: string,
    topic: string,
    signature: Uint8Array
  ): Promise<boolean> {
    if (!this.keypair) {
      return false;
    }

    const data = new Uint8Array(content.length + nonce.length + topic.length);
    data.set(content);
    data.set(new TextEncoder().encode(nonce), content.length);
    data.set(new TextEncoder().encode(topic), content.length + nonce.length);

    const keyData = this.keypair.publicKey.slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    try {
      return await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signature as BufferSource,
        data as BufferSource
      );
    } catch {
      return false;
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 PubSub 认证器
 */
export function createPubsubAuthenticator(): PubsubAuthenticator {
  return new PubsubAuthenticator();
}

// ============================================================================
// 导出
// ============================================================================
// 注意: AuthenticatedMessage, PubSubMessageType, TopicPolicy 等已在声明时导出
