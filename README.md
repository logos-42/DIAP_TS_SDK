# DIAP TypeScript SDK

基于零知识证明的去中心化智能体身份协议 TypeScript SDK。

这是 DIAP Rust SDK 的 TypeScript 翻译版本，保持相同的功能逻辑和 API 设计，但使用 TypeScript/Node.js 生态系统的依赖。

## 功能特性

- 🔐 **密钥管理**：Ed25519 密钥对生成、存储和管理
- 🌐 **IPFS 集成**：轻量级 Helia 客户端，支持文件上传和检索
- 🆔 **DID 构建**：符合 W3C 规范的 DID 文档构建和发布
- 🔒 **零知识证明**：基于 snarkjs 的 ZKP 证明生成和验证
- 🤖 **智能体认证**：完整的身份注册和验证流程
- 🌍 **libp2p 网络**：点对点网络通信支持

## 安装

```bash
npm install @diap/sdk
```

### Node.js 版本要求

- Node.js >= 18.0.0

### Windows 用户注意事项

如果在 Windows 上遇到安装问题，请参考 [INSTALL.md](./INSTALL.md) 获取详细的解决方案。

推荐使用以下命令安装：

```bash
npm install --legacy-peer-deps
```

## 快速开始

```typescript
import { AgentAuthManager, KeyManager } from '@diap/sdk';

async function main() {
  // 创建认证管理器
  const authManager = await AgentAuthManager.new();

  // 创建智能体
  const { agentInfo, keypair, peerId } = authManager.createAgent('MyAgent');

  // 注册身份
  const registration = await authManager.registerAgent(agentInfo, keypair, peerId);
  console.log('Agent registered:', registration.did);
  console.log('CID:', registration.cid);
}

main().catch(console.error);
```

## API 概览

### 密钥管理

```typescript
import { KeyManager } from '@diap/sdk';

// 生成密钥对
const keypair = KeyManager.generate();
console.log('DID:', keypair.did);

// 签名
const message = new TextEncoder().encode('Hello DIAP');
const signature = await KeyManager.sign(keypair, message);

// 验证
const isValid = await KeyManager.verify(keypair, message, signature);
```

### ZKP 证明

```typescript
import { UniversalNoirManager } from '@diap/sdk';

const manager = await UniversalNoirManager.new();
const info = manager.getBackendInfo();
console.log('Backend:', info.backendType);
```

### 配置管理

```typescript
import { ConfigManager, getDefaultConfig } from '@diap/sdk';

const config = getDefaultConfig();
const manager = await ConfigManager.load();
```

### IPFS 多节点发布

SDK 支持多节点 IPNS 发布，可结合本地节点和云服务实现高可用。

#### 本地节点

```typescript
import { createMultiPublisher } from '@diap/sdk';

const publisher = await createMultiPublisher('my-key');
const result = await publisher.publishMultiNode('Qm...');

console.log('IPNS Name:', result.ipnsName);
console.log('Published to:', result.publishedNodes);
console.log('Failed:', result.failedNodes);
```

#### Pinata

```typescript
import { createPinataPublisher } from '@diap/sdk';

const publisher = await createPinataPublisher(
  'my-key',
  'PINATA_API_KEY',
  'PINATA_SECRET_KEY'
);

const result = await publisher.publishMultiNode('Qm...');
```

#### Infura

```typescript
import { createInfuraPublisher } from '@diap/sdk';

const publisher = await createInfuraPublisher(
  'my-key',
  'INFURA_PROJECT_ID',
  'INFURA_PROJECT_SECRET'
);

const result = await publisher.publishMultiNode('Qm...');
```

#### Web3.Storage

```typescript
import { createWeb3StoragePublisher } from '@diap/sdk';

const publisher = await createWeb3StoragePublisher(
  'my-key',
  'WEB3_STORAGE_TOKEN'
);

const result = await publisher.publishMultiNode('Qm...');
```

#### 自定义网关

```typescript
import { createCustomPublisher } from '@diap/sdk';

const publisher = await createCustomPublisher(
  'my-key',
  'https://your-gateway.com/api/v0',
  'https://your-gateway.com',
  { Authorization: 'Bearer YOUR_TOKEN' }
);

const result = await publisher.publishMultiNode('Qm...');
```

## 开发

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查
npm run lint

# 格式化代码
npm run format
```

## 文档

详细文档请参考：
- [API 文档](./docs/API.md)
- [使用指南](./docs/GUIDE.md)
- [架构文档](./docs/ARCHITECTURE.md)

## 许可证

MIT License

## 更新日志

### v0.2.1 (2026-07-28)

- **修复**: `HyperswarmConfig.seed` 类型从 `Buffer[]` 改为 `Buffer | Uint8Array`，匹配 hyperswarm 4.x 实际期望的 32 字节单值
- **修复**: `global.d.ts` 中 `join()` 返回类型从 `{ update: () => void }` 更正为 `{ refresh(), flushed(), destroy() }`，匹配 hyperswarm 4.x `PeerDiscoverySession` API
- **移除**: 移除 `global.d.ts` 中不存在的 `connect()` 方法声明，hyperswarm 4.x 没有该 API
- **兼容**: `seed` 内部处理逻辑从传递数组改为传递单值给 Hyperswarm 构造器

### v0.2.0

- 初始发布

## 链接

- [Rust SDK](https://github.com/logos-42/DIAP_TS_SDK)
- [项目主页](https://alou.fun)