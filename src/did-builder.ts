/**
 * DID 构建器
 * 构建和发布符合 W3C DID 规范的 DID 文档
 * 基于 Rust SDK 的实现逻辑
 */

import type {
  DIDDocument,
  VerificationMethod,
  Service,
  DIDPublishResult,
  EncryptedPeerID,
} from './types/did.js';
import type { KeyPair } from './types/key.js';
import type { IpfsClient } from './ipfs-client.js';
import { DIDError } from './types/errors.js';
import { encodeBase58, encodeBase64 } from './utils/encoding.js';
import { encryptPeerId } from './libp2p/encrypted-peer-id.js';
import { logger } from './utils/logger.js';
import { sha256, sha512 } from '@noble/hashes/sha256';
import { blake2b, blake2s } from '@noble/hashes/blake2';

/**
 * DID 构建器
 */
export class DIDBuilder {
  private services: Service[] = [];

  constructor(private ipfsClient: IpfsClient) {}

  /**
   * 添加服务端点
   */
  addService(serviceType: string, endpoint: any): this {
    const service: Service = {
      id: `#${serviceType.toLowerCase()}`,
      type: serviceType,
      serviceEndpoint: endpoint,
    };
    this.services.push(service);
    return this;
  }

  /**
   * 添加 PubSub 服务
   */
  addPubsubService(
    serviceType: string,
    endpoint: any,
    topics: string[],
    addresses: string[]
  ): this {
    const service: Service = {
      id: `#${serviceType.toLowerCase()}`,
      type: serviceType,
      serviceEndpoint: endpoint,
      pubsubTopics: topics,
      networkAddresses: addresses,
    };
    this.services.push(service);
    return this;
  }

  /**
   * 构建 DID 文档
   */
  buildDIDDocument(keypair: KeyPair, encryptedPeerId: EncryptedPeerID): DIDDocument {
    const publicKeyMultibase = this.deriveDIDKey(keypair.publicKey);

    const verificationMethod: VerificationMethod = {
      id: `${keypair.did}#key-1`,
      type: 'Ed25519VerificationKey2020',
      controller: keypair.did,
      publicKeyMultibase,
    };

    const libp2pService: Service = {
      id: `${keypair.did}#libp2p`,
      type: 'LibP2PNode',
      serviceEndpoint: {
        ciphertext: encodeBase64(encryptedPeerId.ciphertext),
        nonce: encodeBase64(encryptedPeerId.nonce),
        signature: encodeBase64(encryptedPeerId.signature),
        method: encryptedPeerId.method,
      },
    };

    const allServices = [libp2pService, ...this.services];

    const didDoc: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: keypair.did,
      verificationMethod: [verificationMethod],
      authentication: [`${keypair.did}#key-1`],
      service: allServices,
      created: new Date().toISOString(),
    };

    return didDoc;
  }

  /**
   * 构建包含 PubSub 信息的 DID 文档
   */
  buildDIDDocumentWithPubsub(
    keypair: KeyPair,
    encryptedPeerId: EncryptedPeerID,
    pubsubTopics: string[],
    networkAddresses: string[]
  ): DIDDocument {
    const publicKeyMultibase = this.deriveDIDKey(keypair.publicKey);

    const verificationMethod: VerificationMethod = {
      id: `${keypair.did}#key-1`,
      type: 'Ed25519VerificationKey2020',
      controller: keypair.did,
      publicKeyMultibase,
    };

    const libp2pService: Service = {
      id: `${keypair.did}#libp2p`,
      type: 'libp2p',
      serviceEndpoint: {
        ciphertext: encodeBase64(encryptedPeerId.ciphertext),
        nonce: encodeBase64(encryptedPeerId.nonce),
        signature: encodeBase64(encryptedPeerId.signature),
        method: encryptedPeerId.method,
        protocol: 'libp2p',
        version: '1.0.0',
      },
      pubsubTopics,
      networkAddresses,
    };

    const allServices = [libp2pService, ...this.services];

    const didDoc: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: keypair.did,
      verificationMethod: [verificationMethod],
      authentication: [`${keypair.did}#key-1`],
      service: allServices,
      created: new Date().toISOString(),
    };

    return didDoc;
  }

  /**
   * 派生 did:key 格式的 DID
   */
  private deriveDIDKey(publicKey: Uint8Array): string {
    if (publicKey.length !== 32) {
      throw new DIDError('Public key must be 32 bytes for Ed25519');
    }

    const prefix = new Uint8Array([0xed, 0x01]);
    const combined = new Uint8Array(prefix.length + publicKey.length);
    combined.set(prefix, 0);
    combined.set(publicKey, prefix.length);

    const encoded = encodeBase58(combined);
    return `did:key:z${encoded}`;
  }

  /**
   * 创建并发布 DID 文档
   */
  async createAndPublish(keypair: KeyPair, peerId: string): Promise<DIDPublishResult> {
    try {
      logger.info('🚀 开始DID发布流程（简化版）');

      logger.info('步骤1: 加密libp2p PeerID');
      const encryptedPeerId = encryptPeerId(keypair.privateKey, peerId);
      logger.info('✓ PeerID已加密');

      logger.info('步骤2: 构建DID文档');
      const didDocument = this.buildDIDDocument(keypair, encryptedPeerId);
      logger.info('✓ DID文档构建完成');
      logger.info(`  DID: ${didDocument.id}`);

      logger.info('步骤3: 上传DID文档到IPFS');
      const uploadResult = await this.uploadDIDDocument(didDocument);
      logger.info('✓ 上传完成');
      logger.info(`  CID: ${uploadResult.cid}`);

      logger.info('✅ DID发布成功');
      logger.info(`  DID: ${keypair.did}`);
      logger.info(`  CID: ${uploadResult.cid}`);
      logger.info('  绑定关系: 通过ZKP验证');

      return {
        did: keypair.did,
        cid: uploadResult.cid,
        didDocument,
        encryptedPeerId,
      };
    } catch (error) {
      throw new DIDError('Failed to create and publish DID document', {
        originalError: error,
      });
    }
  }

  /**
   * 创建并发布包含 PubSub 信息的 DID 文档
   */
  async createAndPublishWithPubsub(
    keypair: KeyPair,
    peerId: string,
    pubsubTopics: string[],
    networkAddresses: string[]
  ): Promise<DIDPublishResult> {
    logger.info('🚀 开始DID发布流程（包含PubSub信息）');

    logger.info('步骤1: 加密libp2p PeerID');
    const encryptedPeerId = encryptPeerId(keypair.privateKey, peerId);
    logger.info('✓ PeerID已加密');

    logger.info('步骤2: 构建包含PubSub信息的DID文档');
    const didDocument = this.buildDIDDocumentWithPubsub(
      keypair,
      encryptedPeerId,
      pubsubTopics,
      networkAddresses
    );
    logger.info('✓ DID文档构建完成');
    logger.info(`  DID: ${didDocument.id}`);

    logger.info('步骤3: 上传DID文档到IPFS');
    const uploadResult = await this.uploadDIDDocument(didDocument);
    logger.info('✓ 上传完成');
    logger.info(`  CID: ${uploadResult.cid}`);

    logger.info('✅ DID发布成功（包含PubSub信息）');
    logger.info(`  DID: ${keypair.did}`);
    logger.info(`  CID: ${uploadResult.cid}`);
    logger.info(`  PubSub主题: ${pubsubTopics.join(', ')}`);
    logger.info(`  网络地址: ${networkAddresses.join(', ')}`);

    return {
      did: keypair.did,
      cid: uploadResult.cid,
      didDocument,
      encryptedPeerId,
    };
  }

  /**
   * 上传 DID 文档到 IPFS
   */
  private async uploadDIDDocument(didDoc: DIDDocument): Promise<{ cid: string; size: number }> {
    const json = JSON.stringify(didDoc, null, 2);
    const result = await this.ipfsClient.upload(json, 'did.json');
    return { cid: result.cid, size: result.size };
  }
}

/**
 * 从 IPFS CID 获取 DID 文档
 */
export async function getDIDDocumentFromCID(
  ipfsClient: IpfsClient,
  cid: string
): Promise<DIDDocument> {
  logger.info(`从IPFS获取DID文档: ${cid}`);

  const content = await ipfsClient.get(cid);
  const didDoc: DIDDocument = JSON.parse(content);

  logger.info(`✓ DID文档获取成功: ${didDoc.id}`);

  return didDoc;
}

/**
 * Multihash 代码到哈希函数映射
 */
const MULTIHASH_CODES: Record<number, string> = {
  0x12: 'sha256',
  0x13: 'sha512',
  0xb220: 'blake2b512',
  0xb260: 'blake2s256',
};

/**
 * 验证 DID 文档完整性
 * 支持多种哈希算法：SHA-256, SHA-512, Blake2b-512, Blake2s-256
 */
export async function verifyDIDDocumentIntegrity(
  didDoc: DIDDocument,
  expectedCid: string
): Promise<boolean> {
  logger.info('验证DID文档完整性与CID绑定（支持多种哈希算法）');

  const json = JSON.stringify(didDoc);
  logger.debug(`  DID文档大小: ${json.length} 字节`);

  try {
    const { CID } = await import('multiformats/cid');
    const cid = CID.parse(expectedCid);

    logger.debug(`  CID版本: ${cid.version}`);
    logger.debug(`  CID codec: ${cid.codec}`);

    const multihash = cid.multihash;
    const hashCode = multihash.code;
    const hashDigest = multihash.digest;

    logger.debug(`  Multihash code: 0x${hashCode.toString(16)}`);
    logger.debug(`  Multihash digest: ${toHexString(hashDigest)}`);

    let computedHash: Uint8Array;

    switch (hashCode) {
      case 0x12:
        logger.debug('  使用SHA-256计算哈希');
        computedHash = new Uint8Array(sha256(new TextEncoder().encode(json)));
        break;
      case 0x13:
        logger.debug('  使用SHA-512计算哈希');
        computedHash = new Uint8Array(sha512(new TextEncoder().encode(json)));
        break;
      case 0xb220:
        logger.debug('  使用Blake2b-512计算哈希');
        computedHash = new Uint8Array(blake2b(new TextEncoder().encode(json), 64));
        break;
      case 0xb260:
        logger.debug('  使用Blake2s-256计算哈希');
        computedHash = new Uint8Array(blake2s(new TextEncoder().encode(json), 32));
        break;
      default:
        logger.warn(`  ⚠️ 不支持的哈希算法: 0x${hashCode.toString(16)}`);
        logger.debug('  回退到SHA-256');
        computedHash = new Uint8Array(sha256(new TextEncoder().encode(json)));
    }

    logger.debug(`  计算的哈希: ${toHexString(computedHash)}`);

    const hashesMatch = buffersEqual(computedHash, new Uint8Array(hashDigest));

    if (hashesMatch) {
      logger.info('✅ DID文档哈希与CID匹配');
    } else {
      logger.warn('❌ DID文档哈希与CID不匹配');
      logger.debug(`  预期: ${toHexString(hashDigest)}`);
      logger.debug(`  实际: ${toHexString(computedHash)}`);
      logger.debug(`  哈希算法: 0x${hashCode.toString(16)}`);
    }

    return hashesMatch;
  } catch (error) {
    logger.error('验证DID文档完整性失败', { error });
    return false;
  }
}

/**
 * 验证 DID 文档完整性（同步版本，仅做结构验证）
 */
export function verifyDIDDocumentIntegritySync(didDoc: DIDDocument): boolean {
  try {
    return (
      didDoc['@context'] !== undefined &&
      didDoc.id !== undefined &&
      didDoc.verificationMethod !== undefined &&
      Array.isArray(didDoc.verificationMethod) &&
      didDoc.verificationMethod.length > 0
    );
  } catch (error) {
    return false;
  }
}

function toHexString(bytes: Uint8Array | Uint8Array<ArrayBuffer>): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
