# DIAP TypeScript SDK

基于零知识证明的去中心化智能体身份协议 TypeScript SDK。

这是 DIAP Rust SDK 的 TypeScript 翻译版本，保持相同的功能逻辑和 API 设计，但使用 TypeScript/Node.js 生态系统的依赖。

## 功能特性

- 🔐 密钥管理：Ed25519 密钥对生成、存储和管理
- 🌐 IPFS 集成：轻量级 Helia 客户端，支持文件上传和检索
- 🆔 DID 构建：符合 W3C 规范的 DID 文档构建和发布
- 🔒 零知识证明：基于 o1js 的 ZKP 证明生成和验证
- 🤖 智能体认证：完整的身份注册和验证流程
- 🌍 libp2p 网络：点对点网络通信支持

## 安装

```bash
npm install @diap/sdk
```

## 快速开始

```typescript
import { AgentAuthManager } from '@diap/sdk';

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

## 链接

- [Rust SDK](https://github.com/logos-42/DIAP_TS_SDK)
- [项目主页](https://alou.fun)
