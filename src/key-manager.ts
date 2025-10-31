/**
 * 密钥管理模块
 * 负责密钥的生成、存储、加载和管理
 */

import * as ed25519 from '@noble/ed25519';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { KeyPair, KeyFile, KeyBackup } from './types/key.js';
import { KeyManagementError } from './types/errors.js';
import { encodeHex, decodeHex } from './utils/encoding.js';
import { encryptAES256GCM, decryptAES256GCM, deriveKey, generateRandomBytes } from './utils/crypto.js';
import { encodeBase58 } from './utils/encoding.js';
import { logger } from './utils/logger.js';

/**
 * 密钥管理器
 */
export class KeyManager {
  /**
   * 生成新的 Ed25519 密钥对
   */
  static generate(): KeyPair {
    try {
      // 生成32字节随机私钥
      const privateKey = ed25519.utils.randomPrivateKey();
      
      // 从私钥派生公钥
      const publicKey = ed25519.getPublicKey(privateKey);
      
      // 派生 did:key 格式的 DID
      const did = KeyManager.deriveDIDKey(publicKey);
      
      logger.debug('Generated new Ed25519 keypair', { did });
      
      return {
        privateKey,
        publicKey,
        did,
      };
    } catch (error) {
      throw new KeyManagementError('Failed to generate keypair', { originalError: error });
    }
  }

  /**
   * 从私钥加载密钥对
   */
  static fromPrivateKey(privateKey: Uint8Array): KeyPair {
    if (privateKey.length !== 32) {
      throw new KeyManagementError('Private key must be 32 bytes');
    }

    try {
      // 从私钥派生公钥
      const publicKey = ed25519.getPublicKey(privateKey);
      
      // 派生 did:key 格式的 DID
      const did = KeyManager.deriveDIDKey(publicKey);
      
      return {
        privateKey,
        publicKey,
        did,
      };
    } catch (error) {
      throw new KeyManagementError('Failed to load keypair from private key', { originalError: error });
    }
  }

  /**
   * 从文件加载密钥对
   */
  static async fromFile(path: string): Promise<KeyPair> {
    try {
      const content = await fs.readFile(path, 'utf-8');
      const keyFile: KeyFile = JSON.parse(content);
      
      // 解码私钥
      const privateKeyBytes = decodeHex(keyFile.privateKey);
      
      if (privateKeyBytes.length !== 32) {
        throw new KeyManagementError('Invalid private key length in file');
      }
      
      return KeyManager.fromPrivateKey(privateKeyBytes);
    } catch (error) {
      if (error instanceof KeyManagementError) {
        throw error;
      }
      throw new KeyManagementError(`Failed to load keypair from file: ${path}`, { originalError: error });
    }
  }

  /**
   * 保存密钥对到文件
   */
  static async saveToFile(keypair: KeyPair, path: string): Promise<void> {
    try {
      const keyFile: KeyFile = {
        keyType: 'Ed25519',
        privateKey: encodeHex(keypair.privateKey),
        publicKey: encodeHex(keypair.publicKey),
        did: keypair.did,
        createdAt: new Date().toISOString(),
        version: '2.0',
      };
      
      const content = JSON.stringify(keyFile, null, 2);
      
      // 确保目录存在
      const dir = join(path, '..');
      await fs.mkdir(dir, { recursive: true });
      
      // 写入文件
      await fs.writeFile(path, content, { mode: 0o600 }); // 设置权限为 600
      
      logger.debug('Saved keypair to file', { path });
    } catch (error) {
      throw new KeyManagementError(`Failed to save keypair to file: ${path}`, { originalError: error });
    }
  }

  /**
   * 导出密钥备份（加密）
   */
  static exportBackup(keypair: KeyPair, password?: string): KeyBackup {
    try {
      const keyFile: KeyFile = {
        keyType: 'Ed25519',
        privateKey: encodeHex(keypair.privateKey),
        publicKey: encodeHex(keypair.publicKey),
        did: keypair.did,
        createdAt: new Date().toISOString(),
        version: '2.0',
      };
      
      const jsonData = JSON.stringify(keyFile);
      
      let encryptedData: string;
      
      if (password) {
        // 使用密码加密
        const salt = generateRandomBytes(16);
        const key = deriveKey(password, salt);
        const { ciphertext, nonce, tag } = encryptAES256GCM(
          new TextEncoder().encode(jsonData),
          key,
          generateRandomBytes(12)
        );
        
        // 组合: salt + nonce + tag + ciphertext
        const combined = new Uint8Array(salt.length + nonce.length + tag.length + ciphertext.length);
        let offset = 0;
        combined.set(salt, offset);
        offset += salt.length;
        combined.set(nonce, offset);
        offset += nonce.length;
        combined.set(tag, offset);
        offset += tag.length;
        combined.set(ciphertext, offset);
        
        encryptedData = Buffer.from(combined).toString('base64');
      } else {
        // 无密码时使用 base64 编码
        encryptedData = Buffer.from(jsonData).toString('base64');
      }
      
      return {
        encryptedData,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new KeyManagementError('Failed to export key backup', { originalError: error });
    }
  }

  /**
   * 从备份导入密钥
   */
  static importFromBackup(backup: KeyBackup, password?: string): KeyPair {
    try {
      const encryptedBuffer = Buffer.from(backup.encryptedData, 'base64');
      
      let jsonData: string;
      
      if (password) {
        // 解密数据
        const salt = new Uint8Array(encryptedBuffer.slice(0, 16));
        const nonce = new Uint8Array(encryptedBuffer.slice(16, 28));
        const tag = new Uint8Array(encryptedBuffer.slice(28, 44));
        const ciphertext = new Uint8Array(encryptedBuffer.slice(44));
        
        const key = deriveKey(password, salt);
        const decrypted = decryptAES256GCM(ciphertext, key, nonce, tag);
        
        jsonData = new TextDecoder().decode(decrypted);
      } else {
        // 直接解码 base64
        jsonData = encryptedBuffer.toString('utf-8');
      }
      
      const keyFile: KeyFile = JSON.parse(jsonData);
      const privateKeyBytes = decodeHex(keyFile.privateKey);
      
      if (privateKeyBytes.length !== 32) {
        throw new KeyManagementError('Invalid private key length in backup');
      }
      
      return KeyManager.fromPrivateKey(privateKeyBytes);
    } catch (error) {
      if (error instanceof KeyManagementError) {
        throw error;
      }
      throw new KeyManagementError('Failed to import key from backup', { originalError: error });
    }
  }

  /**
   * 使用 Ed25519 签名数据
   */
  static async sign(keypair: KeyPair, data: Uint8Array): Promise<Uint8Array> {
    try {
      const signature = await ed25519.sign(data, keypair.privateKey);
      return signature;
    } catch (error) {
      throw new KeyManagementError('Failed to sign data', { originalError: error });
    }
  }

  /**
   * 验证 Ed25519 签名
   */
  static async verify(keypair: KeyPair, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    try {
      const isValid = await ed25519.verify(signature, data, keypair.publicKey);
      return isValid;
    } catch (error) {
      logger.warn('Signature verification failed', { error });
      return false;
    }
  }

  /**
   * 派生 did:key 格式的 DID
   * 参考: https://w3c-ccg.github.io/did-method-key/#ed25519-x25519
   */
  private static deriveDIDKey(publicKey: Uint8Array): string {
    if (publicKey.length !== 32) {
      throw new KeyManagementError('Public key must be 32 bytes for Ed25519');
    }

    // 构造 multicodec 前缀: 0xed01 (Ed25519 public key)
    // multibase base58btc编码: z
    const prefix = new Uint8Array([0xed, 0x01]);
    const combined = new Uint8Array(prefix.length + publicKey.length);
    combined.set(prefix, 0);
    combined.set(publicKey, prefix.length);
    
    // Base58 编码
    const encoded = encodeBase58(combined);
    
    return `did:key:z${encoded}`;
  }
}
