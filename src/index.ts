// 类型定义
export * from './types/index.js';

// 密钥管理
export { KeyManager } from './key-manager.js';

// IPFS 客户端
export { IpfsClient } from './ipfs-client.js';
export type { IpfsUploadResult, IpnsPublishResult, RemoteIpfsConfig } from './ipfs-client.js';

// DID 构建器
export {
  DIDBuilder,
  getDIDDocumentFromCID,
  verifyDIDDocumentIntegrity,
  verifyDIDDocumentIntegritySync
} from './did-builder.js';

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

// 版本信息
export const VERSION = '0.1.1';
export const DESCRIPTION = 'DIAP TypeScript SDK - Decentralized Intelligent Agent Protocol';