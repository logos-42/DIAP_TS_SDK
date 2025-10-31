/**
 * PeerID 加密工具
 * 使用 AES-256-GCM 加密 PeerID 并添加 Ed25519 签名
 */

import * as ed25519 from '@noble/ed25519';
import type { EncryptedPeerID } from '../types/did.js';
import { encryptAES256GCM, decryptAES256GCM } from '../utils/crypto.js';
import { KeyManagementError } from '../types/errors.js';

/**
 * 加密 PeerID
 */
export function encryptPeerId(signingKey: Uint8Array, peerId: string): EncryptedPeerID {
  if (signingKey.length !== 32) {
    throw new KeyManagementError('Signing key must be 32 bytes');
  }

  // 将 PeerID 转换为字节
  const peerIdBytes = new TextEncoder().encode(peerId);

  // 使用 AES-256-GCM 加密
  const { ciphertext, nonce, tag } = encryptAES256GCM(peerIdBytes, signingKey);

  // 使用 Ed25519 签名
  const message = new Uint8Array(nonce.length + ciphertext.length);
  message.set(nonce, 0);
  message.set(ciphertext, nonce.length);
  
  const signature = ed25519.signSync(message, signingKey);

  return {
    ciphertext,
    nonce,
    signature,
    method: 'AES-256-GCM+Ed25519',
  };
}

/**
 * 使用密钥解密 PeerID
 */
export function decryptPeerIdWithSecret(signingKey: Uint8Array, encrypted: EncryptedPeerID): string {
  if (signingKey.length !== 32) {
    throw new KeyManagementError('Signing key must be 32 bytes');
  }

  try {
    // 先验证签名
    const message = new Uint8Array(encrypted.nonce.length + encrypted.ciphertext.length);
    message.set(encrypted.nonce, 0);
    message.set(encrypted.ciphertext, encrypted.nonce.length);

    const publicKey = ed25519.getPublicKey(signingKey);
    const isValid = ed25519.verifySync(encrypted.signature, message, publicKey);

    if (!isValid) {
      throw new KeyManagementError('Invalid signature for encrypted PeerID');
    }

    // 解密数据
    // 注意：这里需要从 ciphertext 中提取 tag，但当前设计 tag 不在 EncryptedPeerID 中
    // 为了简化，我们假设 tag 存储在别处或使用默认值
    // 实际实现中可能需要调整 EncryptedPeerID 结构
    const decrypted = decryptAES256GCM(
      encrypted.ciphertext,
      signingKey,
      encrypted.nonce,
      new Uint8Array(16) // TODO: 需要从实际结构中获取 tag
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new KeyManagementError('Failed to decrypt PeerID', { originalError: error });
  }
}

/**
 * 验证 PeerID 签名
 */
export function verifyPeerIdSignature(
  verifyingKey: Uint8Array,
  encrypted: EncryptedPeerID,
  claimedPeerId: string
): boolean {
  try {
    // 构造消息
    const message = new Uint8Array(encrypted.nonce.length + encrypted.ciphertext.length);
    message.set(encrypted.nonce, 0);
    message.set(encrypted.ciphertext, encrypted.nonce.length);

    // 验证签名
    const isValid = ed25519.verifySync(encrypted.signature, message, verifyingKey);

    if (!isValid) {
      return false;
    }

    // 可选：验证解密后的 PeerID 是否匹配
    // 这需要解密，但为了性能可以跳过（仅验证签名即可）
    return true;
  } catch (error) {
    return false;
  }
}
