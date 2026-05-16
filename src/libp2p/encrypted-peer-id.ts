/**
 * PeerID 加密工具
 * 使用 Ed25519 私钥派生 AES-256 密钥加密 PeerID
 * 基于 Rust SDK 的实现逻辑
 */

import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { EncryptedPeerID } from '../types/did.js';
import { KeyManagementError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

type NobleEd25519 = typeof ed25519;
// @ts-ignore - types incorrect for these async methods
const ed = ed25519 as NobleEd25519 & {
  getPublicKeyAsync: (key: Uint8Array) => Promise<Uint8Array>;
  signAsync: (msg: Uint8Array, key: Uint8Array) => Promise<Uint8Array>;
  verifyAsync: (sig: Uint8Array, msg: Uint8Array, key: Uint8Array) => Promise<boolean>;
};

/**
 * 从 Ed25519 私钥派生 AES-256 密钥
 */
function deriveAesKeyFromEd25519(signingKey: Uint8Array): Uint8Array {
  const keyMaterial = signingKey;
  const info = new TextEncoder().encode('DIAP_AES_KEY_V3');

  const combined = new Uint8Array(keyMaterial.length + info.length);
  combined.set(keyMaterial, 0);
  combined.set(info, keyMaterial.length);

  const hash = sha256(combined);
  return hash;
}

/**
 * 加密 PeerID
 * 使用 Ed25519 私钥派生 AES-256 密钥加密 PeerID
 */
export async function encryptPeerId(signingKey: Uint8Array, peerId: string): Promise<EncryptedPeerID> {
  if (signingKey.length !== 32) {
    throw new KeyManagementError('Signing key must be 32 bytes');
  }

  const aesKey = deriveAesKeyFromEd25519(signingKey);

  const peerIdBytes = new TextEncoder().encode(peerId);

  const { ciphertext, nonce } = aesGcmEncrypt(peerIdBytes, aesKey);

  const sigData = new Uint8Array(ciphertext.length + nonce.length);
  sigData.set(ciphertext, 0);
  sigData.set(nonce, ciphertext.length);

  const signature = await ed.signAsync(sigData, signingKey);

  logger.debug('✓ PeerID已加密（AES-256-GCM）');
  logger.debug(`  原始PeerID: ${peerId}`);
  logger.debug(`  密文长度: ${ciphertext.length} 字节`);
  logger.debug(`  Nonce长度: ${nonce.length} 字节`);
  logger.debug(`  签名长度: ${signature.length} 字节`);

  return {
    ciphertext,
    nonce,
    signature,
    method: 'AES-256-GCM-Ed25519-V3',
  };
}

/**
 * 使用密钥解密 PeerID
 */
export async function decryptPeerIdWithSecret(
  signingKey: Uint8Array,
  encrypted: EncryptedPeerID
): Promise<string> {
  logger.info('🔓 解密PeerID（持有私钥）');

  if (signingKey.length !== 32) {
    throw new KeyManagementError('Signing key must be 32 bytes');
  }

  try {
    const sigData = new Uint8Array(encrypted.ciphertext.length + encrypted.nonce.length);
    sigData.set(encrypted.ciphertext, 0);
    sigData.set(encrypted.nonce, encrypted.ciphertext.length);

    const publicKey = await ed.getPublicKeyAsync(signingKey);
    const isValid = await ed.verifyAsync(encrypted.signature, sigData, publicKey);

    if (!isValid) {
      throw new KeyManagementError('签名验证失败：数据可能被篡改');
    }

    logger.debug('✓ 签名验证通过');

    const aesKey = deriveAesKeyFromEd25519(signingKey);
    const plaintext = aesGcmDecrypt(encrypted.ciphertext, aesKey, encrypted.nonce);

    const peerId = new TextDecoder().decode(plaintext);

    logger.info('✓ PeerID解密成功');
    logger.debug(`  解密的PeerID: ${peerId}`);

    return peerId;
  } catch (error) {
    if (error instanceof KeyManagementError) {
      throw error;
    }
    throw new KeyManagementError('Failed to decrypt PeerID', { originalError: error });
  }
}

/**
 * 验证 PeerID 签名
 */
export async function verifyPeerIdSignature(
  verifyingKey: Uint8Array,
  encrypted: EncryptedPeerID,
  _claimedPeerId: string
): Promise<boolean> {
  logger.info('验证PeerID签名（公开验证）');

  try {
    const sigData = new Uint8Array(encrypted.ciphertext.length + encrypted.nonce.length);
    sigData.set(encrypted.ciphertext, 0);
    sigData.set(encrypted.nonce, encrypted.ciphertext.length);

    const isValid = await ed.verifyAsync(encrypted.signature, sigData, verifyingKey);

    if (isValid) {
      logger.info('✓ PeerID签名验证通过');
      return true;
    } else {
      logger.warn('PeerID签名验证失败');
      return false;
    }
  } catch (error) {
    logger.warn('PeerID签名验证失败', { error });
    return false;
  }
}

/**
 * 验证 PeerID 所有权（通过签名）
 */
export async function verifyEncryptedPeerIdOwnership(
  verifyingKey: Uint8Array,
  encrypted: EncryptedPeerID,
  claimedPeerId: string
): Promise<boolean> {
  logger.info('验证PeerID所有权（通过签名）');

  return verifyPeerIdSignature(verifyingKey, encrypted, claimedPeerId);
}

/**
 * AES-256-GCM 加密
 */
function aesGcmEncrypt(plaintext: Uint8Array, key: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', key, nonce);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
  };
}

/**
 * AES-256-GCM 解密
 */
function aesGcmDecrypt(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return new Uint8Array(plaintext);
}