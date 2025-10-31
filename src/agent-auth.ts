/**
 * 智能体认证管理器
 * 提供统一的智能体认证 API
 */

import type {
  AgentInfo,
  IdentityRegistration,
  IdentityVerification,
} from './identity-manager.js';
import type { KeyPair } from './types/key.js';
import { IdentityManager } from './identity-manager.js';
import { IpfsClient } from './ipfs-client.js';
import { KeyManager } from './key-manager.js';
import { UniversalNoirManager } from './zkp/universal-manager.js';
import { generateRandomBytes } from './utils/crypto.js';
import { logger } from './utils/logger.js';

/**
 * 认证结果
 */
export interface AuthResult {
  success: boolean;
  agentId: string;
  proof?: Uint8Array;
  verificationDetails: string[];
  timestamp: number;
  processingTimeMs: number;
}

/**
 * 批量认证结果
 */
export interface BatchAuthResult {
  totalCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  totalTimeMs: number;
  averageTimeMs: number;
  results: AuthResult[];
}

/**
 * 智能体认证管理器
 */
export class AgentAuthManager {
  private identityManager: IdentityManager;
  private ipfsClient: IpfsClient;
  private zkpManager?: UniversalNoirManager;

  /**
   * 创建新的认证管理器（使用公共 IPFS）
   */
  static async new(): Promise<AgentAuthManager> {
    const ipfsClient = await IpfsClient.newPublicOnly();
    const manager = new AgentAuthManager(ipfsClient);
    return manager;
  }

  /**
   * 使用自定义 IPFS 节点创建认证管理器
   */
  static async newWithRemoteIpfs(
    apiUrl: string,
    gatewayUrl: string
  ): Promise<AgentAuthManager> {
    const ipfsClient = await IpfsClient.newWithRemoteNode(apiUrl, gatewayUrl);
    const manager = new AgentAuthManager(ipfsClient);
    return manager;
  }

  private constructor(ipfsClient: IpfsClient) {
    this.ipfsClient = ipfsClient;
    this.identityManager = new IdentityManager(ipfsClient);
  }

  /**
   * 创建智能体
   */
  createAgent(name: string, email?: string): {
    agentInfo: AgentInfo;
    keypair: KeyPair;
    peerId: string;
  } {
    // 生成密钥对
    const keypair = KeyManager.generate();

    // 生成 PeerID（简化版本：使用公钥的哈希）
    const peerIdBytes = generateRandomBytes(32);
    const peerId = Buffer.from(peerIdBytes).toString('base64url');

    // 创建智能体信息
    const agentInfo: AgentInfo = {
      name,
      services: [
        {
          serviceType: 'AgentService',
          endpoint: email ? { email } : {},
        },
      ],
      description: `Agent: ${name}`,
    };

    return {
      agentInfo,
      keypair,
      peerId,
    };
  }

  /**
   * 注册智能体
   */
  async registerAgent(
    agentInfo: AgentInfo,
    keypair: KeyPair,
    peerId: string
  ): Promise<IdentityRegistration> {
    return await this.identityManager.registerIdentity(agentInfo, keypair, peerId);
  }

  /**
   * 生成证明
   */
  async generateProof(keypair: KeyPair, cid: string): Promise<AuthResult> {
    const startTime = Date.now();

    try {
      // 获取 DID 文档
      const didDocument = await this.ipfsClient.get(cid);
      const parsedDoc = JSON.parse(didDocument);

      // 生成 nonce
      const nonce = generateRandomBytes(32);

      // 生成绑定证明
      const proof = await this.identityManager.generateBindingProof(
        keypair,
        parsedDoc,
        cid,
        nonce
      );

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        agentId: parsedDoc.id,
        proof,
        verificationDetails: ['Proof generated successfully'],
        timestamp: Date.now(),
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        agentId: '',
        verificationDetails: [`Failed to generate proof: ${error}`],
        timestamp: Date.now(),
        processingTimeMs: processingTime,
      };
    }
  }

  /**
   * 验证身份
   */
  async verifyIdentity(cid: string, proof: Uint8Array): Promise<AuthResult> {
    const startTime = Date.now();

    try {
      // 生成 nonce（实际应用中应该从验证请求中获取）
      const nonce = generateRandomBytes(32);

      // 验证身份
      const verification = await this.identityManager.verifyIdentityWithZKP(
        cid,
        proof,
        nonce
      );

      const processingTime = Date.now() - startTime;

      return {
        success: verification.zkpVerified,
        agentId: verification.did,
        verificationDetails: verification.verificationDetails,
        timestamp: Date.now(),
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        agentId: '',
        verificationDetails: [`Verification failed: ${error}`],
        timestamp: Date.now(),
        processingTimeMs: processingTime,
      };
    }
  }

  /**
   * 双向认证
   */
  async mutualAuthentication(
    aliceInfo: AgentInfo,
    aliceKeypair: KeyPair,
    alicePeerId: string,
    aliceCid: string,
    bobInfo: AgentInfo,
    bobKeypair: KeyPair,
    bobPeerId: string,
    bobCid: string
  ): Promise<[AuthResult, AuthResult, AuthResult, AuthResult]> {
    // Alice -> Bob 认证
    const aliceToBobProof = await this.generateProof(aliceKeypair, aliceCid);
    const aliceToBobVerify = await this.verifyIdentity(bobCid, aliceToBobProof.proof!);

    // Bob -> Alice 认证
    const bobToAliceProof = await this.generateProof(bobKeypair, bobCid);
    const bobToAliceVerify = await this.verifyIdentity(aliceCid, bobToAliceProof.proof!);

    return [aliceToBobProof, aliceToBobVerify, bobToAliceProof, bobToAliceVerify];
  }

  /**
   * 批量认证测试
   */
  async batchAuthenticationTest(
    agentInfo: AgentInfo,
    keypair: KeyPair,
    peerId: string,
    cid: string,
    count: number
  ): Promise<BatchAuthResult> {
    const startTime = Date.now();
    const results: AuthResult[] = [];

    for (let i = 0; i < count; i++) {
      const result = await this.generateProof(keypair, cid);
      results.push(result);
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = count - successCount;

    return {
      totalCount: count,
      successCount,
      failureCount,
      successRate: successCount / count,
      totalTimeMs: totalTime,
      averageTimeMs: totalTime / count,
      results,
    };
  }

  /**
   * 关闭管理器
   */
  async stop(): Promise<void> {
    await this.ipfsClient.stop();
  }
}
