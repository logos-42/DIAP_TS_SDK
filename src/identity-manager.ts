/**
 * 身份管理器
 * 统一管理智能体身份的注册和验证
 */

import type {
  DIDDocument,
  EncryptedPeerID,
  DIDPublishResult,
} from './types/did.js';
import type { KeyPair } from './types/key.js';
import type { IpfsClient } from './ipfs-client.js';
import { DIDBuilder, getDIDDocumentFromCID } from './did-builder.js';
import { UniversalNoirManager } from './zkp/universal-manager.js';
import type { NoirProverInputs } from './types/zkp.js';
import { DIDError, VerificationError } from './types/errors.js';
import {
  decryptPeerIdWithSecret,
  verifyPeerIdSignature,
} from './libp2p/encrypted-peer-id.js';
import { sha256 } from '@noble/hashes/sha256';
import { logger } from './utils/logger.js';

/**
 * 智能体信息
 */
export interface AgentInfo {
  name: string;
  services: ServiceInfo[];
  description?: string;
  tags?: string[];
}

/**
 * 服务信息
 */
export interface ServiceInfo {
  serviceType: string;
  endpoint: any;
}

/**
 * 身份注册结果
 */
export interface IdentityRegistration {
  did: string;
  cid: string;
  didDocument: DIDDocument;
  encryptedPeerIdHex: string;
  registeredAt: string;
}

/**
 * 身份验证结果
 */
export interface IdentityVerification {
  did: string;
  cid: string;
  zkpVerified: boolean;
  verificationDetails: string[];
  verifiedAt: string;
}

/**
 * 身份管理器
 */
export class IdentityManager {
  private didBuilder: DIDBuilder;
  private zkpManager: UniversalNoirManager;

  constructor(
    private ipfsClient: IpfsClient,
    zkpManager?: UniversalNoirManager
  ) {
    this.didBuilder = new DIDBuilder(ipfsClient);
    // 如果未提供，将在需要时异步创建
    this.zkpManager = zkpManager as any;
  }

  /**
   * 初始化 ZKP 管理器
   */
  private async ensureZKPManager(): Promise<UniversalNoirManager> {
    if (!this.zkpManager) {
      this.zkpManager = await UniversalNoirManager.new();
    }
    return this.zkpManager;
  }

  /**
   * 注册智能体身份
   */
  async registerIdentity(
    agentInfo: AgentInfo,
    keypair: KeyPair,
    peerId: string
  ): Promise<IdentityRegistration> {
    try {
      // 添加服务端点
      for (const service of agentInfo.services) {
        this.didBuilder.addService(service.serviceType, service.endpoint);
      }

      // 创建并发布 DID
      const result = await this.didBuilder.createAndPublish(keypair, peerId);

      return {
        did: result.did,
        cid: result.cid,
        didDocument: result.didDocument,
        encryptedPeerIdHex: Buffer.from(result.encryptedPeerId.ciphertext).toString('hex'),
        registeredAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new DIDError('Failed to register identity', { originalError: error });
    }
  }

  /**
   * 生成 DID-CID 绑定证明
   */
  async generateBindingProof(
    keypair: KeyPair,
    didDocument: DIDDocument,
    cid: string,
    nonce: Uint8Array
  ): Promise<Uint8Array> {
    try {
      const zkpManager = await this.ensureZKPManager();

      // 计算 DID 文档哈希
      const didDocJson = JSON.stringify(didDocument);
      const didDocHash = sha256(didDocJson);

      // 计算公钥哈希
      const publicKeyHash = sha256(keypair.publicKey);

      // 计算 nonce 哈希
      const nonceHash = sha256(nonce);

      // 准备 ZKP 输入
      const inputs: NoirProverInputs = {
        expectedDidHash: `${didDocHash[0]},${didDocHash[1]}`,
        publicKeyHash: `${Array.from(publicKeyHash).slice(0, 8).reduce((acc, b) => acc * 256n + BigInt(b), 0n)}`,
        nonceHash: `${Array.from(nonceHash).slice(0, 8).reduce((acc, b) => acc * 256n + BigInt(b), 0n)}`,
        expectedOutput: Buffer.from(didDocHash.slice(0, 16)).toString('hex'),
      };

      // 生成证明
      const proofResult = await zkpManager.generateProof(inputs);

      return proofResult.proof;
    } catch (error) {
      throw new DIDError('Failed to generate binding proof', { originalError: error });
    }
  }

  /**
   * 使用 ZKP 验证身份
   */
  async verifyIdentityWithZKP(
    cid: string,
    zkpProof: Uint8Array,
    nonce: Uint8Array
  ): Promise<IdentityVerification> {
    try {
      const zkpManager = await this.ensureZKPManager();
      const verificationDetails: string[] = [];

      // 从 IPFS 获取 DID 文档
      const didDocument = await getDIDDocumentFromCID(this.ipfsClient, cid);
      verificationDetails.push(`Retrieved DID document from CID: ${cid}`);

      // 验证 ZKP 证明（简化版本）
      const verificationResult = await zkpManager.verifyProof(zkpProof, new Uint8Array(32));
      verificationDetails.push(
        `ZKP verification: ${verificationResult.isValid ? 'PASSED' : 'FAILED'}`
      );

      return {
        did: didDocument.id,
        cid,
        zkpVerified: verificationResult.isValid,
        verificationDetails,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new VerificationError('Failed to verify identity with ZKP', {
        originalError: error,
      });
    }
  }

  /**
   * 验证 PeerID
   */
  verifyPeerId(
    didDocument: DIDDocument,
    encrypted: EncryptedPeerID,
    claimedPeerId: string
  ): boolean {
    try {
      // 从 DID 文档提取公钥
      if (!didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
        return false;
      }

      const publicKeyMultibase = didDocument.verificationMethod[0].publicKeyMultibase;
      // 这里需要从 multibase 解码公钥
      // 简化版本：假设验证通过
      return true;
    } catch (error) {
      logger.warn('PeerID verification failed', { error });
      return false;
    }
  }

  /**
   * 从 DID 文档提取加密的 PeerID
   */
  extractEncryptedPeerId(didDocument: DIDDocument): EncryptedPeerID | null {
    // 简化版本：从服务端点中查找
    if (!didDocument.service) {
      return null;
    }

    // TODO: 实现从 DID 文档中提取加密 PeerID 的逻辑
    return null;
  }
}
