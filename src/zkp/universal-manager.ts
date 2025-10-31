/**
 * 通用 ZKP 管理器
 * 统一接口，支持多种后端（o1js, simplified）
 */

import type {
  NoirProverInputs,
  NoirProofResult,
  NoirVerificationResult,
  NoirBackend,
} from '../types/zkp.js';
import { ZKPError } from '../types/errors.js';
import { O1JSBackend } from './o1js-backend.js';
import { SimplifiedBackend } from './simplified-backend.js';
import { logger } from '../utils/logger.js';

/**
 * 通用 ZKP 管理器
 */
export class UniversalNoirManager {
  private backend: NoirBackend;
  private o1jsBackend?: O1JSBackend;
  private simplifiedBackend: SimplifiedBackend;

  /**
   * 创建新的管理器（自动选择后端）
   */
  static async new(): Promise<UniversalNoirManager> {
    const manager = new UniversalNoirManager();
    
    // 尝试初始化 o1js 后端
    try {
      const o1jsBackend = new O1JSBackend();
      if (o1jsBackend.isAvailable()) {
        await o1jsBackend.initialize();
        manager.backend = NoirBackend.O1JS;
        manager.o1jsBackend = o1jsBackend;
        logger.info('Using o1js backend for ZKP');
        return manager;
      }
    } catch (error) {
      logger.warn('o1js backend not available, using simplified backend', { error });
    }

    // 回退到简化后端
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
    
    if (backend === NoirBackend.O1JS) {
      try {
        const o1jsBackend = new O1JSBackend();
        if (o1jsBackend.isAvailable()) {
          await o1jsBackend.initialize();
          manager.backend = NoirBackend.O1JS;
          manager.o1jsBackend = o1jsBackend;
          return manager;
        }
        throw new ZKPError('o1js backend not available');
      } catch (error) {
        throw new ZKPError('Failed to initialize o1js backend', { originalError: error });
      }
    } else {
      manager.backend = NoirBackend.SIMPLIFIED;
      manager.simplifiedBackend = new SimplifiedBackend();
      return manager;
    }
  }

  private constructor() {
    this.simplifiedBackend = new SimplifiedBackend();
  }

  /**
   * 生成证明
   */
  async generateProof(inputs: NoirProverInputs): Promise<NoirProofResult> {
    try {
      if (this.backend === NoirBackend.O1JS && this.o1jsBackend) {
        return await this.o1jsBackend.generateProof(inputs);
      } else {
        return await this.simplifiedBackend.generateProof(inputs);
      }
    } catch (error) {
      // 如果 o1js 失败，回退到简化后端
      if (this.backend === NoirBackend.O1JS && this.o1jsBackend) {
        logger.warn('o1js proof generation failed, falling back to simplified backend', {
          error,
        });
        return await this.simplifiedBackend.generateProof(inputs);
      }
      throw new ZKPError('Failed to generate proof', { originalError: error });
    }
  }

  /**
   * 验证证明
   */
  async verifyProof(
    proof: Uint8Array,
    publicInputs: Uint8Array
  ): Promise<NoirVerificationResult> {
    try {
      if (this.backend === NoirBackend.O1JS && this.o1jsBackend) {
        return await this.o1jsBackend.verifyProof(proof, publicInputs);
      } else {
        return await this.simplifiedBackend.verifyProof(proof, publicInputs);
      }
    } catch (error) {
      // 如果 o1js 失败，回退到简化后端
      if (this.backend === NoirBackend.O1JS && this.o1jsBackend) {
        logger.warn('o1js proof verification failed, falling back to simplified backend', {
          error,
        });
        return await this.simplifiedBackend.verifyProof(proof, publicInputs);
      }
      throw new ZKPError('Failed to verify proof', { originalError: error });
    }
  }

  /**
   * 获取后端信息
   */
  getBackendInfo(): { backend: NoirBackend; isAvailable: boolean } {
    if (this.backend === NoirBackend.O1JS && this.o1jsBackend) {
      return {
        backend: NoirBackend.O1JS,
        isAvailable: this.o1jsBackend.isAvailable(),
      };
    } else {
      return {
        backend: NoirBackend.SIMPLIFIED,
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

    if (newBackend === NoirBackend.O1JS) {
      try {
        const o1jsBackend = new O1JSBackend();
        if (o1jsBackend.isAvailable()) {
          await o1jsBackend.initialize();
          this.backend = NoirBackend.O1JS;
          this.o1jsBackend = o1jsBackend;
          logger.info('Switched to o1js backend');
          return;
        }
        throw new ZKPError('o1js backend not available');
      } catch (error) {
        throw new ZKPError('Failed to switch to o1js backend', { originalError: error });
      }
    } else {
      this.backend = NoirBackend.SIMPLIFIED;
      this.simplifiedBackend = new SimplifiedBackend();
      logger.info('Switched to simplified backend');
    }
  }
}
