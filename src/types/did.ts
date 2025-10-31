/**
 * DID 相关类型定义
 */

/**
 * W3C DID 文档
 */
export interface DIDDocument {
  /** DID Context */
  '@context': string[];
  /** DID 标识符 */
  id: string;
  /** 验证方法列表 */
  verificationMethod: VerificationMethod[];
  /** 认证方法引用 */
  authentication: string[];
  /** 服务端点列表（可选） */
  service?: Service[];
  /** 创建时间 (ISO 8601) */
  created: string;
}

/**
 * 验证方法
 */
export interface VerificationMethod {
  /** 验证方法 ID */
  id: string;
  /** 类型 */
  type: string;
  /** 控制器 DID */
  controller: string;
  /** Multibase 编码的公钥 */
  publicKeyMultibase: string;
}

/**
 * 服务端点
 */
export interface Service {
  /** 服务 ID */
  id: string;
  /** 服务类型 */
  type: string;
  /** 服务端点 */
  serviceEndpoint: any;
  /** PubSub 主题列表（可选） */
  pubsubTopics?: string[];
  /** 网络地址列表（可选） */
  networkAddresses?: string[];
}

/**
 * 加密的 PeerID
 */
export interface EncryptedPeerID {
  /** AES-256-GCM 加密的 PeerID */
  ciphertext: Uint8Array;
  /** 12 bytes nonce */
  nonce: Uint8Array;
  /** Ed25519 签名 */
  signature: Uint8Array;
  /** 加密方法标识 */
  method: string;
}

/**
 * DID 发布结果
 */
export interface DIDPublishResult {
  /** DID 标识符 */
  did: string;
  /** IPFS CID */
  cid: string;
  /** DID 文档 */
  didDocument: DIDDocument;
  /** 加密的 PeerID */
  encryptedPeerId: EncryptedPeerID;
}
