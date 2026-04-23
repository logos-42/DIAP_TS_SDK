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
  static async newWithRemoteIpfs(apiUrl: string, gatewayUrl: string): Promise<AgentAuthManager> {
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
  createAgent(
    name: string,
    _email?: string
  ): {
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

      const proof = this.identityManager.generateBindingProof(keypair, parsedDoc, cid, nonce);

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

      const verification = await this.identityManager.verifyIdentityWithZKP(cid, proof, nonce);

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
  ): Promise<[AuthResult, AuthResult, AuthResult]> {
    logger.info('🔄 开始双向认证流程');

    const aliceProof = await this.generateProof(aliceKeypair, aliceCid);
    const bobVerifyAlice = await this.verifyIdentity(aliceCid, aliceProof.proof!);

    const bobProof = await this.generateProof(bobKeypair, bobCid);
    const aliceVerifyBob = await this.verifyIdentity(bobCid, bobProof.proof!);

    logger.info('✅ 双向认证完成');
    logger.info(`   Alice → Bob: ${bobVerifyAlice.success ? '✅' : '❌'}`);
    logger.info(`   Bob → Alice: ${aliceVerifyBob.success ? '✅' : '❌'}`);

    return [aliceProof, bobVerifyAlice, aliceVerifyBob];
  }

  /**
   * 批量认证测试（串行版本）
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
   * 并发批量认证测试（真并行）
   */
  async concurrentBatchAuthenticationTest(
    _agentInfo: AgentInfo,
    keypair: KeyPair,
    _peerId: string,
    cid: string,
    count: number,
    maxConcurrency: number = 10
  ): Promise<BatchAuthResult> {
    logger.info(`⚡ 开始并发批量认证测试: ${count}次 (最大并发: ${maxConcurrency})`);

    const startTime = Date.now();
    const results: AuthResult[] = [];
    let successCount = 0;

    // 使用信号量控制并发数
    let running = 0;
    let index = 0;

    const executeBatch = async (): Promise<void> => {
      while (index < count) {
        const currentIndex = index++;
        const currentRunning = ++running;

        if (currentRunning > maxConcurrency) {
          running--;
          await new Promise(resolve => setTimeout(resolve, 10));
          continue;
        }

        logger.info(`   处理第${currentIndex + 1}个认证... (并发: ${currentRunning})`);

        try {
          const proofResult = await this.generateProof(keypair, cid);
          if (proofResult.success) {
            successCount++;
          }
          results.push(proofResult);
        } catch (error) {
          logger.error(`   第${currentIndex + 1}个认证失败: ${error}`);
          results.push({
            success: false,
            agentId: '',
            verificationDetails: [`并发认证失败: ${error}`],
            timestamp: Math.floor(Date.now() / 1000),
            processingTimeMs: 0,
          });
        }

        running--;
      }
    };

    // 启动多个并发任务
    const tasks: Promise<void>[] = [];
    const numWorkers = Math.min(maxConcurrency, count);
    for (let i = 0; i < numWorkers; i++) {
      tasks.push(executeBatch());
    }

    await Promise.all(tasks);

    const totalTime = Date.now() - startTime;
    const failureCount = count - successCount;
    const successRate = (successCount / count) * 100;

    logger.info(`✅ 并发批量认证完成`);
    logger.info(`   总处理数: ${count}`);
    logger.info(`   成功数: ${successCount}`);
    logger.info(`   成功率: ${successRate.toFixed(2)}%`);
    logger.info(`   总时间: ${totalTime}ms`);
    logger.info(`   平均时间: ${Math.floor(totalTime / count)}ms`);

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
   * 并发生成证明（仅生成，不验证）
   */
  async concurrentGenerateProofs(
    keypair: KeyPair,
    cid: string,
    count: number,
    maxConcurrency: number = 20
  ): Promise<AuthResult[]> {
    logger.info(`⚡ 并发生成 ${count} 个证明 (并发: ${maxConcurrency})`);

    const promises: Promise<AuthResult>[] = [];

    for (let i = 0; i < count; i++) {
      const promise = this.generateProof(keypair, cid);
      promises.push(promise);
    }

    // 使用 Promise.allSettled 进行并发控制
    const batchSize = maxConcurrency;
    const results: AuthResult[] = [];

    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error(`证明生成失败: ${result.reason}`);
          results.push({
            success: false,
            agentId: '',
            verificationDetails: [`并发生成失败: ${result.reason}`],
            timestamp: Math.floor(Date.now() / 1000),
            processingTimeMs: 0,
          });
        }
      }
    }

    return results;
  }

  /**
   * 压力测试模式：同时进行生成和验证
   */
  async stressTest(
    keypair: KeyPair,
    cid: string,
    iterations: number,
    maxConcurrency: number = 10
  ): Promise<{
    proofResults: AuthResult[];
    verifyResults: AuthResult[];
    totalTimeMs: number;
    successRate: number;
  }> {
    logger.info(`💥 开始压力测试: ${iterations} 次迭代 (并发: ${maxConcurrency})`);

    const startTime = Date.now();

    // 第一批：并发生成证明
    const proofResults = await this.concurrentGenerateProofs(keypair, cid, iterations, maxConcurrency);

    // 过滤成功的证明
    const validProofs = proofResults.filter(r => r.success && r.proof);

    // 第二批：并发验证
    const verifyPromises: Promise<AuthResult>[] = validProofs.map(proof =>
      this.verifyIdentity(cid, proof.proof!)
    );

    const verifyResults: AuthResult[] = [];
    for (let i = 0; i < verifyPromises.length; i += maxConcurrency) {
      const batch = verifyPromises.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(batch);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          verifyResults.push(result.value);
        } else {
          verifyResults.push({
            success: false,
            agentId: '',
            verificationDetails: [`验证失败: ${result.reason}`],
            timestamp: Math.floor(Date.now() / 1000),
            processingTimeMs: 0,
          });
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = verifyResults.filter(r => r.success).length;
    const successRate = (successCount / verifyResults.length) * 100;

    logger.info(`✅ 压力测试完成`);
    logger.info(`   生成成功: ${proofResults.filter(r => r.success).length}/${iterations}`);
    logger.info(`   验证成功: ${successCount}/${verifyResults.length}`);
    logger.info(`   成功率: ${successRate.toFixed(2)}%`);
    logger.info(`   总时间: ${totalTime}ms`);

    return {
      proofResults,
      verifyResults,
      totalTimeMs: totalTime,
      successRate,
    };
  }

  /**
   * 关闭管理器
   */
  async stop(): Promise<void> {
    await this.ipfsClient.stop();
  }
}
