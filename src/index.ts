// ============================================================================
// DIAP TypeScript SDK - 主入口文件
// Decentralized Intelligent Agent Protocol
// ============================================================================

// 类型定义
export * from './types/index.js';

// 密钥管理
export { KeyManager } from './key-manager.js';
export type { KeyInfo, KeyType, KeyGenerationOptions } from './types/key.js';

// IPFS 客户端
export { IpfsClient } from './ipfs-client.js';
export type { IpfsUploadResult, IpnsPublishResult, RemoteIpfsConfig } from './ipfs-client.js';

// IPFS 节点管理器
export { IpfsNodeManager } from './ipfs-node-manager.js';
export type { IpfsNodeConfig, IpfsNodeInfo } from './ipfs-node-manager.js';
export { IpfsNodeStatus } from './ipfs-node-manager.js';

// IPNS 管理器
export { IpnsManager } from './ipns-manager.js';
export type { IpnsConfig, IpnsPublishResult, IpnsResolveResult, KeyInfo as IpnsKeyInfo } from './ipns-manager.js';
export { IpnsRecordStatus } from './ipns-manager.js';

// DID 构建器
export {
  DIDBuilder,
  getDIDDocumentFromCID,
  verifyDIDDocumentIntegrity,
  verifyDIDDocumentIntegritySync
} from './did-builder.js';

// DID 缓存
export { DIDCache, createDIDCache, getGlobalDIDCache } from './did-cache.js';
export type { CacheEntry, CacheStats } from './did-cache.js';

// PeerID 加密
export {
  encryptPeerId,
  decryptPeerIdWithSecret,
  verifyPeerIdSignature,
  verifyEncryptedPeerIdOwnership,
} from './libp2p/encrypted-peer-id.js';

// 工具函数
export { logger, createLogger } from './utils/logger.js';
export type { LogLevel, LoggingConfig } from './utils/logger.js';

// ZKP 管理器（使用 snarkjs）
export { UniversalNoirManager } from './zkp/universal-manager.js';
export type { BackendInfo, PerformanceStats, NoirBackend } from './zkp/universal-manager.js';
export { SnarkjsBackend, groth16Prove, groth16Verify, plonkProve, plonkVerify } from './zkp/snarkjs-backend.js';
export { SimplifiedBackend } from './zkp/simplified-backend.js';
export type { NoirProverInputs, NoirProofResult, NoirVerificationResult, PerformanceMetrics } from './types/zkp.js';

// Hyperswarm P2P 通信器
export { HyperswarmCommunicator, createHyperswarmCommunicator } from './p2p/hyperswarm-communicator.js';
export type { HyperswarmConfig, P2PMessage, P2PConnection, P2PNodeAddr } from './p2p/hyperswarm-communicator.js';
export { P2PMessageType } from './p2p/hyperswarm-communicator.js';

// 身份管理
export { IdentityManager } from './identity-manager.js';
export type {
  AgentInfo,
  ServiceInfo,
  IdentityRegistration,
  IdentityVerification,
} from './identity-manager.js';

// 智能体认证
export { AgentAuthManager } from './agent-auth.js';
export type { AuthResult, BatchAuthResult } from './agent-auth.js';

// 智能体验证
export { AgentVerificationManager, createVerificationManager } from './agent-verification.js';
export type { VerificationRequest, VerificationResponse, VerificationResult } from './agent-verification.js';
export { VerificationStatus, VerificationType } from './agent-verification.js';

// Nonce 管理器
export { NonceManager, createNonceManager, getGlobalNonceManager } from './nonce-manager.js';
export type { NonceRecord, NonceManagerConfig, NonceValidationResult } from './nonce-manager.js';

// 配置管理
export { ConfigManager, loadConfig, getDefaultConfig, saveConfig } from './config-manager.js';
export type { DIAPConfig, AgentConfig, IpfsConfig, IpnsConfig, CacheConfig, LoggingConfig } from './config-manager.js';

// 实名认证
export { RealNameAuthManager, createRealNameAuthManager } from './real-name-auth.js';
export type {
  RealNameCredential,
  UserIdentity,
  AgentAuthorization,
  AgentMetadata,
  AgentSignature,
  AuthorizationChain
} from './real-name-auth.js';
export { AuthLevel, UserType, AgentAuthLevel } from './real-name-auth.js';

// PubSub 认证
export { PubsubAuthenticator, createPubsubAuthenticator } from './pubsub-authenticator.js';
export type {
  AuthenticatedMessage,
  PubsubAuthRequestPayload,
  PubsubAuthResponsePayload,
  MessageVerification,
  TopicConfig
} from './pubsub-authenticator.js';
export { PubSubMessageType, TopicPolicy } from './pubsub-authenticator.js';

// IPFS 双向验证
export {
  IpfsBidirectionalVerificationManager,
  createBidirectionalVerificationManager
} from './ipfs-bidirectional-verification.js';
export type {
  AgentSession,
  ProofData,
  VerificationResult as BidirectionalVerificationResult,
  VerificationChallenge,
  BidirectionalVerificationResult
} from './ipfs-bidirectional-verification.js';
export { SessionStatus, VerificationStatus as BidirectionalVerificationStatus } from './ipfs-bidirectional-verification.js';

// Kubo 安装器
export {
  KuboInstaller,
  createKuboInstaller,
  isKuboInstalled,
  installKubo
} from './kubo-installer.js';
export type { InstallationResult, KuboVersion, KuboInstallerConfig } from './kubo-installer.js';
export { InstallationStatus } from './kubo-installer.js';

// 版本信息
export const VERSION = '0.3.0';
export const DESCRIPTION = 'DIAP TypeScript SDK - Decentralized Intelligent Agent Protocol';
