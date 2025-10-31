/**
 * 错误处理框架
 */

/**
 * DIAP SDK 基础错误类
 */
export class DIAPError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DIAPError';
    // 确保 instanceof 检查正常工作
    Object.setPrototypeOf(this, DIAPError.prototype);
  }
}

/**
 * 密钥管理错误
 */
export class KeyManagementError extends DIAPError {
  constructor(message: string, details?: any) {
    super(message, 'KEY_MANAGEMENT_ERROR', details);
    this.name = 'KeyManagementError';
    Object.setPrototypeOf(this, KeyManagementError.prototype);
  }
}

/**
 * IPFS 错误
 */
export class IPFSError extends DIAPError {
  constructor(message: string, details?: any) {
    super(message, 'IPFS_ERROR', details);
    this.name = 'IPFSError';
    Object.setPrototypeOf(this, IPFSError.prototype);
  }
}

/**
 * ZKP 错误
 */
export class ZKPError extends DIAPError {
  constructor(message: string, details?: any) {
    super(message, 'ZKP_ERROR', details);
    this.name = 'ZKPError';
    Object.setPrototypeOf(this, ZKPError.prototype);
  }
}

/**
 * DID 错误
 */
export class DIDError extends DIAPError {
  constructor(message: string, details?: any) {
    super(message, 'DID_ERROR', details);
    this.name = 'DIDError';
    Object.setPrototypeOf(this, DIDError.prototype);
  }
}

/**
 * 验证错误
 */
export class VerificationError extends DIAPError {
  constructor(message: string, details?: any) {
    super(message, 'VERIFICATION_ERROR', details);
    this.name = 'VerificationError';
    Object.setPrototypeOf(this, VerificationError.prototype);
  }
}
