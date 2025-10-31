/**
 * 密钥相关类型定义
 */

/**
 * Ed25519 密钥对
 */
export interface KeyPair {
  /** 32 bytes Ed25519 私钥 */
  privateKey: Uint8Array;
  /** 32 bytes Ed25519 公钥 */
  publicKey: Uint8Array;
  /** did:key 格式的 DID */
  did: string;
}

/**
 * 密钥文件格式
 */
export interface KeyFile {
  /** 密钥类型 */
  keyType: string;
  /** 十六进制编码的私钥 */
  privateKey: string;
  /** 十六进制编码的公钥 */
  publicKey: string;
  /** did:key 格式的 DID */
  did: string;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 版本号 */
  version: string;
}

/**
 * 密钥备份格式（加密）
 */
export interface KeyBackup {
  /** 加密后的数据（Base64 编码） */
  encryptedData: string;
  /** 助记词（可选） */
  mnemonic?: string;
  /** 导出时间 (ISO 8601) */
  exportedAt: string;
}
