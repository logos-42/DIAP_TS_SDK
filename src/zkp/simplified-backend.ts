/**
 * 简化 ZKP 后端
 * 用于测试和回退，使用哈希函数模拟 ZKP
 */

import type { NoirProverInputs, NoirProofResult, NoirVerificationResult } from '../types/zkp.js';
import { ZKPError } from '../types/errors.js';
import { sha256 } from '@noble/hashes/sha256';
import { logger } from '../utils/logger.js';

/**
 * 简化后端实现
 */
export class SimplifiedBackend {
  /**
   * 生成证明（模拟）
   */
  async generateProof(inputs: NoirProverInputs): Promise<NoirProofResult> {
    const startTime = Date.now();

    try {
      logger.debug('Generating proof with simplified backend', { inputs });

      // 模拟证明生成：使用哈希函数
      const proofData = JSON.stringify({
        expectedDidHash: inputs.expectedDidHash,
        publicKeyHash: inputs.publicKeyHash,
        nonceHash: inputs.nonceHash,
        timestamp: Date.now(),
      });

      const proof = sha256(proofData);
      const publicInputs = sha256(
        JSON.stringify({
          expectedDidHash: inputs.expectedDidHash,
          publicKeyHash: inputs.publicKeyHash,
          nonceHash: inputs.nonceHash,
        })
      );

      const generationTime = Date.now() - startTime;

      return {
        proof: new Uint8Array(proof),
        publicInputs: new Uint8Array(publicInputs),
        circuitOutput: inputs.expectedOutput,
        timestamp: new Date().toISOString(),
        generationTimeMs: generationTime,
      };
    } catch (error) {
      throw new ZKPError('Failed to generate proof with simplified backend', {
        originalError: error,
      });
    }
  }

  /**
   * 验证证明（模拟）
   */
  async verifyProof(
    proof: Uint8Array,
    publicInputs: Uint8Array
  ): Promise<NoirVerificationResult> {
    const startTime = Date.now();

    try {
      // 模拟验证：检查证明和公共输入是否有效
      const isValid = proof.length > 0 && publicInputs.length > 0;

      const verificationTime = Date.now() - startTime;

      return {
        isValid,
        verificationTimeMs: verificationTime,
        ...(!isValid ? { errorMessage: 'Invalid proof format' } : {}),
      };
    } catch (error) {
      return {
        isValid: false,
        verificationTimeMs: Date.now() - startTime,
        errorMessage: `Verification failed: ${error}`,
      };
    }
  }

  /**
   * 检查后端是否可用
   */
  isAvailable(): boolean {
    return true; // 简化后端总是可用
  }
}
