/**
 * 通用 ZKP 管理器
 * 统一接口，支持多种后端（snarkjs, simplified）
 */

import type { NoirProverInputs, NoirProofResult, NoirVerificationResult } from '../types/zkp.js';
import { NoirBackend } from '../types/zkp.js';
import { ZKPError } from '../types/errors.js';
import { SnarkjsBackend } from './snarkjs-backend.js';
import { SimplifiedBackend } from './simplified-backend.js';
import { logger } from '../utils/logger.js';

/**
 * 通用 ZKP 管理器
 */
export class UniversalNoirManager {
  private backend: NoirBackend;
  private snarkjsBackend?: SnarkjsBackend;
  private simplifiedBackend: SimplifiedBackend;

  /**
   * 创建新的管理器（自动选择后端）
   */
  static async new(): Promise<UniversalNoirManager> {
    const manager = new UniversalNoirManager();

    try {
      const snarkjsBackend = new SnarkjsBackend({});
      manager.backend = NoirBackend.SNARKJS_GROTH16;
      manager.snarkjsBackend = snarkjsBackend;
      logger.info('Using snarkjs backend for ZKP');
      return manager;
    } catch (error) {
      logger.warn('snarkjs backend not available, using simplified backend', { error });
    }

    manager.backend = NoirBackend.SIMPLIFIED;
    manager.simplifiedBackend = new SimplifiedBackend();
    logger.info('Using simplified backend for ZKP');
    return manager;
  }

  /**
   * 使用指定后端创建管理器
   */
  static async withBackend(backend: NoirBackend): Promise<UniversalNoirManager> {
    const manager = new UniversalNoirManager();

    if (backend === NoirBackend.SNARKJS_GROTH16 || backend === NoirBackend.SNARKJS_PLONK) {
      try {
        const snarkjsBackend = new SnarkjsBackend();
        await snarkjsBackend.initialize();
        manager.backend = backend;
        manager.snarkjsBackend = snarkjsBackend;
        return manager;
      } catch (error) {
        throw new ZKPError('Failed to initialize snarkjs backend', { originalError: error });
      }
    } else {
      manager.backend = NoirBackend.SIMPLIFIED;
      manager.simplifiedBackend = new SimplifiedBackend();
      return manager;
    }
  }

  private constructor() {
    this.simplifiedBackend = new SimplifiedBackend();
    this.backend = NoirBackend.SIMPLIFIED;
  }

  /**
   * 生成证明
   */
  async generateProof(inputs: NoirProverInputs): Promise<NoirProofResult> {
    try {
      if (
        (this.backend === NoirBackend.SNARKJS_GROTH16 ||
          this.backend === NoirBackend.SNARKJS_PLONK) &&
        this.snarkjsBackend
      ) {
        return await this.snarkjsBackend.generateProof(inputs);
      } else {
        return await this.simplifiedBackend.generateProof(inputs);
      }
    } catch (error) {
      logger.warn('Proof generation failed, falling back to simplified backend', { error });
      return await this.simplifiedBackend.generateProof(inputs);
    }
  }

  /**
   * 验证证明
   */
  async verifyProof(proof: Uint8Array, publicInputs: Uint8Array): Promise<NoirVerificationResult> {
    try {
      if (
        (this.backend === NoirBackend.SNARKJS_GROTH16 ||
          this.backend === NoirBackend.SNARKJS_PLONK) &&
        this.snarkjsBackend
      ) {
        return await this.snarkjsBackend.verifyProof(proof, publicInputs);
      } else {
        return await this.simplifiedBackend.verifyProof(proof, publicInputs);
      }
    } catch (error) {
      logger.warn('Proof verification failed, falling back to simplified backend', { error });
      return await this.simplifiedBackend.verifyProof(proof, publicInputs);
    }
  }

  /**
   * 获取后端信息
   */
  getBackendInfo(): BackendInfo {
    if (
      (this.backend === NoirBackend.SNARKJS_GROTH16 ||
        this.backend === NoirBackend.SNARKJS_PLONK) &&
      this.snarkjsBackend
    ) {
      return {
        backendType: this.backend,
        isAvailable: this.snarkjsBackend.isAvailable(),
      };
    } else {
      return {
        backendType: NoirBackend.SIMPLIFIED,
        isAvailable: this.simplifiedBackend.isAvailable(),
      };
    }
  }

  /**
   * 切换后端
   */
  async switchBackend(newBackend: NoirBackend): Promise<void> {
    if (newBackend === this.backend) {
      return;
    }

    if (newBackend === NoirBackend.SNARKJS_GROTH16 || newBackend === NoirBackend.SNARKJS_PLONK) {
      try {
        const snarkjsBackend = new SnarkjsBackend();
        await snarkjsBackend.initialize();
        this.backend = newBackend;
        this.snarkjsBackend = snarkjsBackend;
        logger.info(`Switched to ${newBackend} backend`);
        return;
      } catch (error) {
        throw new ZKPError('Failed to switch to snarkjs backend', { originalError: error });
      }
    } else {
      this.backend = NoirBackend.SIMPLIFIED;
      this.simplifiedBackend = new SimplifiedBackend();
      logger.info('Switched to simplified backend');
    }
  }
}

/**
 * @deprecated 使用 UniversalNoirManager
 */
export const NoirUniversalManager = UniversalNoirManager;
