/**
 * 编码工具函数
 */

import bs58 from 'bs58';

/**
 * Base58 编码
 */
export function encodeBase58(data: Uint8Array): string {
  return bs58.encode(data);
}

/**
 * Base58 解码
 */
export function decodeBase58(encoded: string): Uint8Array {
  try {
    return new Uint8Array(bs58.decode(encoded));
  } catch (error) {
    throw new Error(`Invalid Base58 string: ${error}`);
  }
}

/**
 * Base64 编码
 */
export function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Base64 解码
 */
export function decodeBase64(encoded: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  } catch (error) {
    throw new Error(`Invalid Base64 string: ${error}`);
  }
}

/**
 * Hex 编码
 */
export function encodeHex(data: Uint8Array): string {
  return Buffer.from(data).toString('hex');
}

/**
 * Hex 解码
 */
export function decodeHex(encoded: string): Uint8Array {
  try {
    // 移除可能的 0x 前缀
    const hex = encoded.startsWith('0x') ? encoded.slice(2) : encoded;
    return new Uint8Array(Buffer.from(hex, 'hex'));
  } catch (error) {
    throw new Error(`Invalid Hex string: ${error}`);
  }
}

/**
 * Multibase 编码（Base64，z前缀表示base58btc）
 */
export function encodeMultibase(data: Uint8Array): string {
  // z 前缀表示 base58btc 编码
  return 'z' + encodeBase58(data);
}

/**
 * Multibase 解码
 */
export function decodeMultibase(encoded: string): Uint8Array {
  try {
    if (!encoded.startsWith('z')) {
      throw new Error('Only base58btc (z prefix) is supported');
    }
    // 移除 z 前缀，然后 base58 解码
    return decodeBase58(encoded.slice(1));
  } catch (error) {
    throw new Error(`Invalid Multibase string: ${error}`);
  }
}
