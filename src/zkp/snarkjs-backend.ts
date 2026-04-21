/**
 * DIAP TypeScript SDK - Snarkjs ZKP 后端
 * 使用 snarkjs 实现零知识证明
 * 
 * 安装: npm install snarkjs
 * 
 * @example
 * ```typescript
 * import { groth16 } from 'snarkjs';
 * 
 * // 生成证明
 * const { proof, publicSignals } = await groth16.fullProve(
 *   { in: 10 },
 *   'circuit.wasm',
 *   'circuit_final.zkey'
 * );
 * 
 * // 验证证明
 * const vKey = await fetch('verification_key.json').then(r => r.json());
 * const isValid = await groth16.verify(vKey, publicSignals, proof);
 * ```
 */

import { logger } from '../utils/logger.js';

/**
 * Snarkjs 证明结果
 */
export interface SnarkjsProofResult {
  /** 证明 */
  proof: {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
  };
  /** 公共信号 */
  publicSignals: string[];
}

/**
 * Snarkjs 验证密钥
 */
export interface SnarkjsVerificationKey {
  /** 协议类型 */
  protocol: 'groth16' | 'plonk' | 'fflonk';
  /** 验证密钥数据 */
  vk_alpha_x: string;
  vk_alpha_x1: string;
  vk_alpha_x2: string;
  vk_beta_x1: string;
  vk_beta_x2: string;
  vk_gamma_x1: string;
  vk_gamma_x2: string;
  vk_delta_x1: string;
  vk_delta_x2: string;
  /** IC 数组 */
  IC: [string, string][];
}

/**
 * Snarkjs 证明输入
 */
export interface SnarkjsProverInputs {
  /** 私有输入（witness） */
  privateInputs: Record<string, unknown>;
  /** 公共输入 */
  publicInputs?: Record<string, unknown>;
}

/**
 * Snarkjs 后端配置
 */
export interface SnarkjsBackendConfig {
  /** WASM 文件路径 */
  wasmPath: string;
  /** zKey 文件路径 */
  zkeyPath: string;
  /** 验证密钥文件路径 */
  vkeyPath?: string;
}

/**
 * Snarkjs ZKP 后端
 * 
 * 提供与 snarkjs 的集成，用于生成和验证零知识证明
 */
export class SnarkjsBackend {
  private config: SnarkjsBackendConfig;
  private verificationKey: SnarkjsVerificationKey | null = null;

  /**
   * 创建 Snarkjs 后端
   */
  constructor(config: SnarkjsBackendConfig) {
    this.config = config;
    logger.info('🔧 Snarkjs ZKP 后端已创建');
    logger.info(`  WASM: ${config.wasmPath}`);
    logger.info(`  zKey: ${config.zkeyPath}`);
  }

  /**
   * 加载验证密钥
   */
  public async loadVerificationKey(): Promise<SnarkjsVerificationKey> {
    if (this.verificationKey) {
      return this.verificationKey;
    }

    if (!this.config.vkeyPath) {
      throw new Error('验证密钥路径未配置');
    }

    try {
      const response = await fetch(this.config.vkeyPath);
      this.verificationKey = await response.json();
      logger.info('✅ 验证密钥加载成功');
      return this.verificationKey;
    } catch (error) {
      logger.error(`❌ 加载验证密钥失败: ${error}`);
      throw error;
    }
  }

  /**
   * 生成证明
   * 
   * @param inputs - 证明输入
   * @returns 证明结果和公共信号
   */
  public async generateProof(inputs: SnarkjsProverInputs): Promise<SnarkjsProofResult> {
    logger.info('🔐 生成零知识证明...');

    try {
      // 动态导入 snarkjs
      const { groth16 } = await import('snarkjs');

      // 合并输入
      const fullInputs = {
        ...inputs.privateInputs,
        ...inputs.publicInputs,
      };

      // 生成证明
      const result = await groth16.fullProve(
        fullInputs,
        this.config.wasmPath,
        this.config.zkeyPath
      );

      logger.info('✅ 证明生成成功');

      return {
        proof: result.proof,
        publicSignals: result.publicSignals,
      };
    } catch (error) {
      logger.error(`❌ 证明生成失败: ${error}`);
      throw error;
    }
  }

  /**
   * 验证证明
   * 
   * @param publicSignals - 公共信号
   * @param proof - 证明
   * @returns 是否验证通过
   */
  public async verifyProof(
    publicSignals: string[],
    proof: SnarkjsProofResult['proof']
  ): Promise<boolean> {
    logger.info('🔍 验证零知识证明...');

    try {
      const vKey = await this.loadVerificationKey();
      const { groth16 } = await import('snarkjs');

      const isValid = await groth16.verify(vKey, publicSignals, proof);

      if (isValid) {
        logger.info('✅ 证明验证通过');
      } else {
        logger.warn('❌ 证明验证失败');
      }

      return isValid;
    } catch (error) {
      logger.error(`❌ 验证失败: ${error}`);
      return false;
    }
  }

  /**
   * 生成证明并验证（便捷方法）
   */
  public async proveAndVerify(inputs: SnarkjsProverInputs): Promise<{
    proof: SnarkjsProofResult;
    isValid: boolean;
  }> {
    const proof = await this.generateProof(inputs);
    const isValid = await this.verifyProof(proof.publicSignals, proof.proof);

    return { proof, isValid };
  }

  /**
   * 获取验证密钥
   */
  public getVerificationKey(): SnarkjsVerificationKey | null {
    return this.verificationKey;
  }

  /**
   * 获取配置
   */
  public getConfig(): SnarkjsBackendConfig {
    return { ...this.config };
  }
}

/**
 * 创建 Snarkjs 后端
 */
export function createSnarkjsBackend(config: SnarkjsBackendConfig): SnarkjsBackend {
  return new SnarkjsBackend(config);
}

/**
 * 完整的 Groth16 证明流程
 */
export async function groth16Prove(
  inputs: Record<string, unknown>,
  wasmPath: string,
  zkeyPath: string
): Promise<SnarkjsProofResult> {
  const { groth16 } = await import('snarkjs');
  
  logger.info('🔐 使用 Groth16 生成证明...');
  
  const result = await groth16.fullProve(inputs, wasmPath, zkeyPath);
  
  logger.info('✅ Groth16 证明生成成功');
  
  return {
    proof: result.proof,
    publicSignals: result.publicSignals,
  };
}

/**
 * 完整的 Groth16 验证流程
 */
export async function groth16Verify(
  vKey: SnarkjsVerificationKey,
  publicSignals: string[],
  proof: SnarkjsProofResult['proof']
): Promise<boolean> {
  const { groth16 } = await import('snarkjs');
  
  logger.info('🔍 使用 Groth16 验证证明...');
  
  const isValid = await groth16.verify(vKey, publicSignals, proof);
  
  if (isValid) {
    logger.info('✅ Groth16 验证通过');
  } else {
    logger.warn('❌ Groth16 验证失败');
  }
  
  return isValid;
}

/**
 * 导出验证密钥（用于将验证密钥部署到链上或前端）
 */
export async function exportSolidityVerifier(
  zkeyPath: string
): Promise<string> {
  const { zkey } = await import('snarkjs');
  
  logger.info('📝 导出 Solidity 验证器...');
  
  const vKey = await zkey.loadZKey(zkeyPath);
  const { groth16 } = await import('snarkjs');
  
  // @ts-ignore - snarkjs 的类型定义不完整
  const solidityCode = await groth16.exportSolidityVerifier(vKey);
  
  logger.info('✅ Solidity 验证器导出成功');
  
  return solidityCode;
}

/**
 * 导出 Solidity Verifier 合约
 */
export async function exportVnMixVerifier(
  zkeyPath: string
): Promise<string> {
  const { zkey } = await import('snarkjs');
  
  logger.info('📝 导出 Verifier Mix 合约...');
  
  const vKey = await zkey.loadZKey(zkeyPath);
  const { zkevm } = await import('snarkjs');
  
  // @ts-ignore - snarkjs 的类型定义不完整
  const solidityCode = await zkevm.exportSolidityVerifier(vKey);
  
  logger.info('✅ Verifier Mix 合约导出成功');
  
  return solidityCode;
}

// ============================================================================
// 导出
// ============================================================================

export {
  SnarkjsBackend,
  createSnarkjsBackend,
  groth16Prove,
  groth16Verify,
  exportSolidityVerifier,
  exportVnMixVerifier,
};

export type {
  SnarkjsProofResult,
  SnarkjsVerificationKey,
  SnarkjsProverInputs,
  SnarkjsBackendConfig,
};
