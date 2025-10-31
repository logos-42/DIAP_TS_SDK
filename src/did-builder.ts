/**
 * DID 构建器
 * 构建和发布符合 W3C DID 规范的 DID 文档
 */

import type {
  DIDDocument,
  VerificationMethod,
  Service,
  EncryptedPeerID,
  DIDPublishResult,
} from './types/did.js';
import type { KeyPair } from './types/key.js';
import type { IpfsClient } from './ipfs-client.js';
import { DIDError } from './types/errors.js';
import { encodeMultibase } from './utils/encoding.js';
import { encryptPeerId } from './libp2p/encrypted-peer-id.js';
import { logger } from './utils/logger.js';

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
      id: `#service-${this.services.length + 1}`,
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
      id: `#pubsub-service-${this.services.length + 1}`,
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
  buildDIDDocument(keypair: KeyPair): DIDDocument {
    // 构建验证方法
    const verificationMethod: VerificationMethod = {
      id: '#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: keypair.did,
      publicKeyMultibase: encodeMultibase(keypair.publicKey),
    };

    const didDoc: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: keypair.did,
      verificationMethod: [verificationMethod],
      authentication: ['#key-1'],
      created: new Date().toISOString(),
    };

    // 添加服务端点（如果有）
    if (this.services.length > 0) {
      didDoc.service = this.services;
    }

    return didDoc;
  }

  /**
   * 创建并发布 DID 文档
   */
  async createAndPublish(keypair: KeyPair, peerId: string): Promise<DIDPublishResult> {
    try {
      // 构建 DID 文档
      const didDocument = this.buildDIDDocument(keypair);

      // 加密 PeerID
      const encryptedPeerId = encryptPeerId(keypair.privateKey, peerId);

      // 将加密的 PeerID 添加到 DID 文档的验证方法中（可选）
      // 或者作为服务的一部分存储

      // 序列化 DID 文档
      const didDocJson = JSON.stringify(didDocument, null, 2);

      // 上传到 IPFS
      const uploadResult = await this.ipfsClient.upload(didDocJson, 'did-document.json');

      const result: DIDPublishResult = {
        did: keypair.did,
        cid: uploadResult.cid,
        didDocument,
        encryptedPeerId,
      };

      logger.debug('Published DID document', {
        did: result.did,
        cid: result.cid,
      });

      return result;
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
    topics: string[],
    addresses: string[]
  ): Promise<DIDPublishResult> {
    // 添加 PubSub 服务
    this.addPubsubService('PubSub', 'libp2p', topics, addresses);

    // 发布
    return this.createAndPublish(keypair, peerId);
  }
}

/**
 * 从 IPFS CID 获取 DID 文档
 */
export async function getDIDDocumentFromCID(
  ipfsClient: IpfsClient,
  cid: string
): Promise<DIDDocument> {
  try {
    const content = await ipfsClient.get(cid);
    const didDoc: DIDDocument = JSON.parse(content);
    return didDoc;
  } catch (error) {
    throw new DIDError(`Failed to get DID document from CID: ${cid}`, {
      originalError: error,
    });
  }
}

/**
 * 验证 DID 文档完整性
 */
export function verifyDIDDocumentIntegrity(
  didDoc: DIDDocument,
  expectedCid: string
): boolean {
  try {
    // 重新序列化 DID 文档
    const jsonStr = JSON.stringify(didDoc);
    
    // 计算哈希（简化版本，实际应该使用 IPFS 的哈希算法）
    // 这里只是基本验证，完整验证需要重新计算 CID
    const hash = Buffer.from(jsonStr).toString('hex');
    
    // TODO: 实现完整的 CID 验证
    // 目前只做基本的结构验证
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
