/**
 * DIAP TypeScript SDK - 智能体验证模块
 * 验证智能体身份和认证状态
 */

import { logger } from './utils/logger.js';

/**
 * 验证状态
 */
export enum VerificationStatus {
  /** 未验证 */
  Unverified = 'unverified',
  /** 验证中 */
  Verifying = 'verifying',
  /** 已验证 */
  Verified = 'verified',
  /** 验证失败 */
  Failed = 'failed',
  /** 已过期 */
  Expired = 'expired',
}

/**
 * 验证请求
 */
export interface VerificationRequest {
  /** 请求 ID */
  requestId: string;
  /** 智能体 DID */
  agentDid: string;
  /** 验证者 DID */
  verifierDid: string;
  /** 验证类型 */
  verificationType: VerificationType;
  /** 请求时间 */
  requestedAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 元数据 */
  metadata?: Record<string, string>;
}

/**
 * 验证类型
 */
export enum VerificationType {
  /** 身份验证 */
  Identity = 'identity',
  /** ZKP 验证 */
  ZKP = 'zkp',
  /** 双向验证 */
  Bidirectional = 'bidirectional',
  /** 实名认证 */
  RealName = 'real_name',
}

/**
 * 验证响应
 */
export interface VerificationResponse {
  /** 请求 ID */
  requestId: string;
  /** 验证状态 */
  status: VerificationStatus;
  /** 验证时间 */
  verifiedAt?: number;
  /** 验证者签名 */
  verifierSignature?: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 验证详情 */
  details?: Record<string, any>;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 验证状态 */
  status: VerificationStatus;
  /** 验证时间 */
  verifiedAt: number;
  /** 验证者 DID */
  verifierDid?: string;
  /** 详细信息 */
  details?: Record<string, any>;
}

/**
 * 智能体验证管理器
 */
export class AgentVerificationManager {
  /** 待验证请求 */
  private pendingRequests: Map<string, VerificationRequest>;
  /** 已验证记录 */
  private verifiedRecords: Map<string, VerificationResult>;
  /** 验证超时（毫秒） */
  private verificationTimeout: number;

  /**
   * 创建验证管理器
   */
  constructor(verificationTimeout: number = 300000) {
    this.pendingRequests = new Map();
    this.verifiedRecords = new Map();
    this.verificationTimeout = verificationTimeout;
    logger.info('✅ 智能体验证管理器已创建');
  }

  /**
   * 创建验证请求
   */
  public createVerificationRequest(
    agentDid: string,
    verifierDid: string,
    verificationType: VerificationType,
    metadata?: Record<string, string>
  ): VerificationRequest {
    const requestId = this.generateRequestId();
    const now = Date.now();

    const request: VerificationRequest = {
      requestId,
      agentDid,
      verifierDid,
      verificationType,
      requestedAt: now,
      expiresAt: now + this.verificationTimeout,
      metadata,
    };

    this.pendingRequests.set(requestId, request);
    logger.info(`📝 创建验证请求: ${requestId}`);

    return request;
  }

  /**
   * 验证身份
   */
  public async verifyIdentity(
    request: VerificationRequest,
    proof?: Uint8Array
  ): Promise<VerificationResult> {
    logger.info(`🔍 验证身份: ${request.agentDid}`);

    try {
      // 模拟验证过程
      await this.simulateVerification(request.verificationType);

      const result: VerificationResult = {
        isValid: true,
        status: VerificationStatus.Verified,
        verifiedAt: Date.now(),
        verifierDid: request.verifierDid,
        details: {
          verificationType: request.verificationType,
          proofProvided: !!proof,
        },
      };

      // 存储验证结果
      this.verifiedRecords.set(request.agentDid, result);

      // 从待验证队列移除
      this.pendingRequests.delete(request.requestId);

      logger.info(`✅ 身份验证成功: ${request.agentDid}`);
      return result;
    } catch (error) {
      logger.error(`❌ 身份验证失败: ${error}`);

      const result: VerificationResult = {
        isValid: false,
        status: VerificationStatus.Failed,
        verifiedAt: Date.now(),
        details: { error: String(error) },
      };

      this.verifiedRecords.set(request.agentDid, result);
      this.pendingRequests.delete(request.requestId);

      return result;
    }
  }

  /**
   * 验证 ZKP 证明
   */
  public async verifyZKP(
    agentDid: string,
    proof: Uint8Array,
    publicInputs: Uint8Array
  ): Promise<VerificationResult> {
    logger.info(`🔐 验证 ZKP: ${agentDid}`);

    try {
      // 模拟 ZKP 验证
      await this.simulateVerification(VerificationType.ZKP);

      const result: VerificationResult = {
        isValid: true,
        status: VerificationStatus.Verified,
        verifiedAt: Date.now(),
        details: {
          verificationType: VerificationType.ZKP,
          proofLength: proof.length,
        },
      };

      this.verifiedRecords.set(agentDid, result);
      return result;
    } catch (error) {
      logger.error(`❌ ZKP 验证失败: ${error}`);

      return {
        isValid: false,
        status: VerificationStatus.Failed,
        verifiedAt: Date.now(),
        details: { error: String(error) },
      };
    }
  }

  /**
   * 执行双向验证
   */
  public async verifyBidirectional(
    agent1Did: string,
    agent2Did: string
  ): Promise<{ result1: VerificationResult; result2: VerificationResult }> {
    logger.info(`🔄 双向验证: ${agent1Did} <-> ${agent2Did}`);

    const [result1, result2] = await Promise.all([
      this.verifyIdentity(
        this.createVerificationRequest(agent1Did, agent2Did, VerificationType.Bidirectional)
      ),
      this.verifyIdentity(
        this.createVerificationRequest(agent2Did, agent1Did, VerificationType.Bidirectional)
      ),
    ]);

    logger.info(`✅ 双向验证完成`);
    return { result1, result2 };
  }

  /**
   * 获取验证状态
   */
  public getVerificationStatus(agentDid: string): VerificationStatus {
    const record = this.verifiedRecords.get(agentDid);
    if (!record) {
      return VerificationStatus.Unverified;
    }

    // 检查是否过期
    if (record.verifiedAt + this.verificationTimeout < Date.now()) {
      return VerificationStatus.Expired;
    }

    return record.status;
  }

  /**
   * 检查是否已验证
   */
  public isVerified(agentDid: string): boolean {
    return this.getVerificationStatus(agentDid) === VerificationStatus.Verified;
  }

  /**
   * 获取验证结果
   */
  public getVerificationResult(agentDid: string): VerificationResult | null {
    return this.verifiedRecords.get(agentDid) || null;
  }

  /**
   * 撤销验证
   */
  public revokeVerification(agentDid: string): boolean {
    if (this.verifiedRecords.has(agentDid)) {
      this.verifiedRecords.delete(agentDid);
      logger.info(`🔙 撤销验证: ${agentDid}`);
      return true;
    }
    return false;
  }

  /**
   * 获取待验证请求数
   */
  public getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 获取已验证记录数
   */
  public getVerifiedCount(): number {
    return this.verifiedRecords.size;
  }

  /**
   * 清空所有记录
   */
  public clear(): void {
    this.pendingRequests.clear();
    this.verifiedRecords.clear();
    logger.info('🧹 已清空所有验证记录');
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `vr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 模拟验证过程
   */
  private async simulateVerification(type: VerificationType): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建验证管理器（便捷函数）
 */
export function createVerificationManager(verificationTimeout?: number): AgentVerificationManager {
  return new AgentVerificationManager(verificationTimeout);
}

// ============================================================================
// 导出
// ============================================================================
// 注意: 所有类型已在声明时导出
