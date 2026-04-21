/**
 * 智能体认证管理器
 * 提供统一的智能体认证 API
 * 基于 Rust SDK 的实现逻辑
 */

import type {
  AgentInfo,
  IdentityRegistration,
  IdentityVerification,
  ServiceInfo,
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

  /**
   * 创建新的认证管理器（使用公共 IPFS）
   */
  static async new(): Promise<AgentAuthManager> {
    logger.info('🚀 初始化智能体认证管理器（轻量级版本）');

    const ipfsClient = await IpfsClient.newPublicOnly(30);
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
    logger.info('🚀 初始化智能体认证管理器（使用远程IPFS）');

    const ipfsClient = await IpfsClient.newWithRemoteNode(apiUrl, gatewayUrl, 30);
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
  createAgent(name: string, _email?: string): {
    agentInfo: AgentInfo;
    keypair: KeyPair;
    peerId: string;
  } {
    logger.info(`🤖 创建智能体: ${name}`);

    const keypair = KeyManager.generate();

    const peerIdBytes = generateRandomBytes(32);
    const peerId = Buffer.from(peerIdBytes).toString('base64url');

    const agentInfo: AgentInfo = {
      name,
      services: [
        {
          serviceType: 'messaging',
          endpoint: `https://${name.toLowerCase()}.example.com/messaging`,
        },
      ],
      description: `${name}智能体`,
      tags: ['agent', name.toLowerCase()],
    };

    logger.info(`✅ 智能体创建成功: ${name}`);
    logger.info(`   DID: ${keypair.did}`);

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
    logger.info(`📝 注册智能体身份: ${agentInfo.name}`);

    const registration = await this.identityManager.registerIdentity(agentInfo, keypair, peerId);

    logger.info('✅ 身份注册成功');
    logger.info(`   CID: ${registration.cid}`);

    return registration;
  }

  /**
   * 生成证明
   */
  async generateProof(keypair: KeyPair, cid: string): Promise<AuthResult> {
    const startTime = Date.now();

    try {
      logger.info('🔐 生成身份证明');

      const timestamp = Math.floor(Date.now() / 1000);
      const nonceStr = `proof_${keypair.did}_${timestamp}`;
      const nonce = new TextEncoder().encode(nonceStr);

      const didDocument = await this.ipfsClient.get(cid);
      const parsedDoc = JSON.parse(didDocument);

      const proof = this.identityManager.generateBindingProof(
        keypair,
        parsedDoc,
        cid,
        nonce
      );

      const processingTime = Date.now() - startTime;

      logger.info('✅ 身份证明生成成功');
      logger.info(`   处理时间: ${processingTime}ms`);

      return {
        success: true,
        agentId: parsedDoc.id,
        proof: proof as any,
        verificationDetails: ['✓ 证明生成成功'],
        timestamp,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        agentId: '',
        verificationDetails: [`Failed to generate proof: ${error}`],
        timestamp: Math.floor(Date.now() / 1000),
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
      logger.info('🔍 验证身份');

      const timestamp = Math.floor(Date.now() / 1000);
      const nonceStr = `verify_${timestamp}`;
      const nonce = new TextEncoder().encode(nonceStr);

      const verification = await this.identityManager.verifyIdentityWithZKP(
        cid,
        proof,
        nonce
      );

      const processingTime = Date.now() - startTime;

      logger.info('✅ 身份验证完成');
      logger.info(`   验证结果: ${verification.zkpVerified ? '通过' : '失败'}`);
      logger.info(`   处理时间: ${processingTime}ms`);

      return {
        success: verification.zkpVerified,
        agentId: verification.did,
        verificationDetails: verification.verificationDetails,
        timestamp,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        agentId: '',
        verificationDetails: [`Verification failed: ${error}`],
        timestamp: Math.floor(Date.now() / 1000),
        processingTimeMs: processingTime,
      };
    }
  }

  /**
   * 双向认证
   */
  async mutualAuthentication(
    _aliceInfo: AgentInfo,
    aliceKeypair: KeyPair,
    _alicePeerId: string,
    aliceCid: string,
    _bobInfo: AgentInfo,
    bobKeypair: KeyPair,
    _bobPeerId: string,
    bobCid: string
  ): Promise<[AuthResult, AuthResult, AuthResult, AuthResult]> {
    logger.info('🔄 开始双向认证流程');

    const aliceProof = await this.generateProof(aliceKeypair, aliceCid);
    const bobVerifyAlice = await this.verifyIdentity(aliceCid, aliceProof.proof!);

    const bobProof = await this.generateProof(bobKeypair, bobCid);
    const aliceVerifyBob = await this.verifyIdentity(bobCid, bobProof.proof!);

    logger.info('✅ 双向认证完成');
    logger.info(`   Alice → Bob: ${bobVerifyAlice.success ? '✅' : '❌'}`);
    logger.info(`   Bob → Alice: ${aliceVerifyBob.success ? '✅' : '❌'}`);

    return [aliceProof, bobVerifyAlice, bobProof, aliceVerifyBob];
  }

  /**
   * 批量认证测试
   */
  async batchAuthenticationTest(
    _agentInfo: AgentInfo,
    keypair: KeyPair,
    _peerId: string,
    cid: string,
    count: number
  ): Promise<BatchAuthResult> {
    logger.info(`🔄 开始批量认证测试: ${count}次`);

    const startTime = Date.now();
    const results: AuthResult[] = [];
    let successCount = 0;

    for (let i = 0; i < count; i++) {
      logger.info(`   处理第${i + 1}个认证...`);

      const proofResult = await this.generateProof(keypair, cid);
      if (proofResult.success) {
        successCount++;
      }

      results.push(proofResult);
    }

    const totalTime = Date.now() - startTime;
    const failureCount = count - successCount;
    const successRate = (successCount / count) * 100;

    return {
      totalCount: count,
      successCount,
      failureCount,
      successRate,
      totalTimeMs: totalTime,
      averageTimeMs: Math.floor(totalTime / count),
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