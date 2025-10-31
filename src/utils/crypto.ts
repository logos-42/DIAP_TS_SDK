/**
 * 加密工具函数
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { KeyManagementError } from '../types/errors.js';

/**
 * AES-256-GCM 加密
 */
export function encryptAES256GCM(
  data: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array } {
  if (key.length !== 32) {
    throw new KeyManagementError('AES-256-GCM requires a 32-byte key');
  }

  const iv = nonce || randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(data)),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    ciphertext: new Uint8Array(encrypted),
    nonce: new Uint8Array(iv),
    tag: new Uint8Array(tag),
  };
}

/**
 * AES-256-GCM 解密
 */
export function decryptAES256GCM(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  tag: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new KeyManagementError('AES-256-GCM requires a 32-byte key');
  }
  if (nonce.length !== 12) {
    throw new KeyManagementError('AES-256-GCM requires a 12-byte nonce');
  }
  if (tag.length !== 16) {
    throw new KeyManagementError('AES-256-GCM requires a 16-byte auth tag');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    decipher.setAuthTag(Buffer.from(tag));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext)),
      decipher.final(),
    ]);

    return new Uint8Array(decrypted);
  } catch (error) {
    throw new KeyManagementError('Decryption failed', { originalError: error });
  }
}

/**
 * 使用 PBKDF2 派生密钥
 */
export function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = 100000
): Uint8Array {
  const key = pbkdf2Sync(password, Buffer.from(salt), iterations, 32, 'sha256');
  return new Uint8Array(key);
}

/**
 * 生成随机字节
 */
export function generateRandomBytes(length: number): Uint8Array {
  return new Uint8Array(randomBytes(length));
}
