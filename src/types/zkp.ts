/**
 * 零知识证明相关类型定义
 */

/**
 * ZKP 证明输入
 */
export interface NoirProverInputs {
  /** 期望的 DID 哈希 */
  expectedDidHash: string;
  /** 公钥哈希 */
  publicKeyHash: string;
  /** nonce 哈希 */
  nonceHash: string;
  /** 期望的输出 */
  expectedOutput: string;
}

/**
 * ZKP 证明结果
 */
export interface NoirProofResult {
  /** 证明数据 */
  proof: Uint8Array;
  /** 公共输入 */
  publicInputs: Uint8Array;
  /** 电路输出 */
  circuitOutput: string;
  /** 生成时间 (ISO 8601) */
  timestamp: string;
  /** 生成耗时（毫秒） */
  generationTimeMs: number;
}

/**
 * ZKP 验证结果
 */
export interface NoirVerificationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 验证耗时（毫秒） */
  verificationTimeMs: number;
  /** 错误消息（可选） */
  errorMessage?: string;
}

/**
 * ZKP 后端类型
 */
export enum NoirBackend {
  /** o1js 后端 */
  O1JS = 'o1js',
  /** 简化后端（用于测试和回退） */
  SIMPLIFIED = 'simplified',
}
