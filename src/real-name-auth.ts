/**
 * DIAP TypeScript SDK - 实名认证模块
 * 支持身份证绑定、用户 DID 身份锚定、智能体签名授权
 */

import { logger } from './utils/logger.js';

/**
 * 认证级别
 */
export enum AuthLevel {
  /** 基础认证（仅手机号等） */
  Basic = 'basic',
  /** 中级认证（身份证绑定） */
  Medium = 'medium',
  /** 高级认证（人脸识别+身份证） */
  High = 'high',
}

/**
 * 用户类型
 */
export enum UserType {
  /** 实名用户 */
  RealName = 'realname',
  /** 匿名用户 */
  Anonymous = 'anonymous',
  /** 组织用户 */
  Organization = 'organization',
}

/**
 * 智能体授权级别
 */
export enum AgentAuthLevel {
  /** 只读权限 */
  ReadOnly = 'read',
  /** 读写权限 */
  ReadWrite = 'write',
  /** 管理员权限 */
  Admin = 'admin',
  /** 完全控制 */
  FullControl = 'full',
}

/**
 * 实名认证凭证
 */
export interface RealNameCredential {
  /** 凭证 ID（唯一标识） */
  credentialId: string;
  /** 用户 DID（实名认证后获得的 DID） */
  userDid: string;
  /** 加密的身份证号（Base64 编码） */
  encryptedIdNumber: string;
  /** 加密的姓名（Base64 编码） */
  encryptedName: string;
  /** 认证时间 */
  authTime: string;
  /** 认证机构（可选） */
  authAuthority?: string;
  /** 认证级别 */
  authLevel: AuthLevel;
}

/**
 * 用户身份信息
 */
export interface UserIdentity {
  /** 用户 DID */
  did: string;
  /** 关联的实名凭证 ID */
  credentialId: string;
  /** 用户类型 */
  userType: UserType;
  /** 创建时间 */
  createdAt: string;
  /** 用户公钥 */
  publicKey: string;
}

/**
 * 智能体授权信息
 */
export interface AgentAuthorization {
  /** 授权 ID */
  authorizationId: string;
  /** 授权者 DID（用户 DID） */
  authorizerDid: string;
  /** 被授权的智能体 DID */
  agentDid: string;
  /** 授权时间 */
  authorizedAt: string;
  /** 授权有效期（可选） */
  expiresAt?: string;
  /** 授权级别 */
  authLevel: AgentAuthLevel;
  /** 授权范围（可为空表示全部权限） */
  scope?: string[];
  /** 授权签名 */
  signature: string;
}

/**
 * 智能体元数据（用于签名）
 */
export interface AgentMetadata {
  /** 智能体 DID */
  agentDid: string;
  /** 智能体名称 */
  name: string;
  /** 智能体类型 */
  agentType: string;
  /** 创建时间 */
  createdAt: string;
  /** 智能体公钥 */
  publicKey: string;
  /** 附加数据（可选） */
  extra?: Record<string, unknown>;
}

/**
 * 签名数据
 */
export interface AgentSignature {
  /** 签名者 DID */
  signerDid: string;
  /** 被签名的智能体 DID */
  agentDid: string;
  /** 签名 */
  signature: string;
  /** 签名时间 */
  signedAt: string;
  /** 签名版本 */
  version: string;
}

/**
 * 授权链（用于验证智能体的授权来源）
 */
export interface AuthorizationChain {
  /** 链 ID */
  chainId: string;
  /** 根授权者（用户 DID） */
  rootAuthorizer: string;
  /** 授权路径 */
  authorizationPath: AgentAuthorization[];
  /** 链创建时间 */
  createdAt: string;
}

/**
 * 实名认证管理器
 */
export class RealNameAuthManager {
  private keypair: { did: string; publicKey: Uint8Array; privateKey: Uint8Array } | null = null;

  /**
   * 创建实名认证管理器
   */
  constructor() {
    logger.info('🔐 实名认证管理器已创建');
  }

  /**
   * 设置密钥对
   */
  public setKeypair(keypair: { did: string; publicKey: Uint8Array; privateKey: Uint8Array }): void {
    this.keypair = keypair;
    logger.info(`✅ 密钥对已设置: ${keypair.did}`);
  }

  /**
   * 创建用户 DID（基于实名认证）
   */
  public createUserDid(keypair: { did: string }): string {
    return keypair.did;
  }

  /**
   * 生成实名认证凭证
   */
  public async createCredential(
    keypair: { did: string; publicKey: Uint8Array },
    idNumber: string,
    name: string,
    authLevel: AuthLevel
  ): Promise<RealNameCredential> {
    // 加密身份证号
    const encryptedId = await this.encryptPersonalInfo(keypair, idNumber);

    // 加密姓名
    const encryptedName = await this.encryptPersonalInfo(keypair, name);

    // 生成凭证 ID
    const credentialId = await this.generateCredentialId(keypair.publicKey, idNumber);

    return {
      credentialId,
      userDid: keypair.did,
      encryptedIdNumber: encryptedId,
      encryptedName,
      authTime: new Date().toISOString(),
      authLevel,
    };
  }

  /**
   * 对智能体进行签名授权
   */
  public async authorizeAgent(
    authorizerKeypair: { did: string; privateKey: Uint8Array },
    agentDid: string,
    authLevel: AgentAuthLevel,
    scope?: string[],
    expiresAt?: string
  ): Promise<AgentAuthorization> {
    // 创建授权数据
    const authData = [
      authorizerKeypair.did,
      agentDid,
      Date.now().toString(),
      authLevel,
    ].join('|');

    // 签名
    const signature = await this.sign(authData, authorizerKeypair.privateKey);

    // 生成授权 ID
    const authorizationId = await this.generateHash(authorizerKeypair.did + agentDid);

    return {
      authorizationId,
      authorizerDid: authorizerKeypair.did,
      agentDid,
      authorizedAt: new Date().toISOString(),
      expiresAt,
      authLevel,
      scope,
      signature,
    };
  }

  /**
   * 验证智能体授权签名
   */
  public async verifyAgentAuthorization(
    authorization: AgentAuthorization,
    authorizerPublicKey: Uint8Array
  ): Promise<boolean> {
    try {
      // 重建授权数据
      const authTime = new Date(authorization.authorizedAt).getTime();
      const authData = [
        authorization.authorizerDid,
        authorization.agentDid,
        authTime.toString(),
        authorization.authLevel,
      ].join('|');

      // 验证签名
      return await this.verify(authData, authorization.signature, authorizerPublicKey);
    } catch (error) {
      logger.error(`❌ 验证失败: ${error}`);
      return false;
    }
  }

  /**
   * 创建智能体签名
   */
  public async signAgentCreation(
    signerKeypair: { did: string; privateKey: Uint8Array },
    agentMetadata: AgentMetadata
  ): Promise<AgentSignature> {
    const signData = JSON.stringify(agentMetadata);

    const signature = await this.sign(signData, signerKeypair.privateKey);

    return {
      signerDid: signerKeypair.did,
      agentDid: agentMetadata.agentDid,
      signature,
      signedAt: new Date().toISOString(),
      version: '1.0',
    };
  }

  /**
   * 验证智能体创建签名
   */
  public async verifyAgentSignature(
    agentSignature: AgentSignature,
    signerPublicKey: Uint8Array,
    agentMetadata: AgentMetadata
  ): Promise<boolean> {
    try {
      const signData = JSON.stringify(agentMetadata);
      return await this.verify(signData, agentSignature.signature, signerPublicKey);
    } catch {
      return false;
    }
  }

  /**
   * 加密个人信息
   */
  public async encryptPersonalInfo(
    keypair: { privateKey: Uint8Array },
    data: string
  ): Promise<string> {
    // 使用 AES-GCM 加密
    const key = await this.deriveAesKey(keypair.privateKey);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      new TextEncoder().encode(data)
    );

    // 组合 nonce + ciphertext 并转为 Base64
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);
    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);

    return this.arrayBufferToBase64(combined);
  }

  /**
   * 解密个人信息
   */
  public async decryptPersonalInfo(
    keypair: { privateKey: Uint8Array },
    encrypted: string
  ): Promise<string> {
    const combined = this.base64ToArrayBuffer(encrypted);
    const nonce = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await this.deriveAesKey(keypair.privateKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  // 私有辅助方法

  /**
   * 从私钥派生 AES 密钥
   */
  private async deriveAesKey(privateKey: Uint8Array): Promise<Uint8Array> {
    const data = new Uint8Array(privateKey.length + 16);
    data.set(privateKey);
    data.set(new TextEncoder().encode('DIAP_AES_KEY'), privateKey.length);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * 签名
   */
  private async sign(data: string, privateKey: Uint8Array): Promise<string> {
    const keyData = privateKey.slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return this.arrayBufferToBase64(new Uint8Array(signature));
  }

  /**
   * 验证签名
   */
  private async verify(data: string, signature: string, publicKey: Uint8Array): Promise<boolean> {
    const keyData = publicKey.slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = this.base64ToArrayBuffer(signature);
    return crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      new TextEncoder().encode(data)
    );
  }

  /**
   * 生成凭证 ID
   */
  private async generateCredentialId(publicKey: Uint8Array, idNumber: string): Promise<string> {
    const data = new Uint8Array(publicKey.length + new TextEncoder().encode(idNumber).length);
    data.set(publicKey);
    data.set(new TextEncoder().encode(idNumber), publicKey.length);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.arrayBufferToBase64(new Uint8Array(hashBuffer));
  }

  /**
   * 生成哈希
   */
  private async generateHash(data: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return this.arrayBufferToBase64(new Uint8Array(hashBuffer));
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建实名认证管理器
 */
export function createRealNameAuthManager(): RealNameAuthManager {
  return new RealNameAuthManager();
}

// ============================================================================
// 导出
// ============================================================================

export { RealNameAuthManager };
export type {
  RealNameCredential,
  UserIdentity,
  AgentAuthorization,
  AgentMetadata,
  AgentSignature,
  AuthorizationChain,
};
export { AuthLevel, UserType, AgentAuthLevel };
