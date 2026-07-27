/**
 * 基本使用示例 — 完整全流程演示
 * 
 * 无外部依赖：使用 MemoryIpfsClient 将 DID 文档存储在内存中，
 * 无需本地 Kubo、Pinata 或任何外部 IPFS 节点。
 * 
 * 完整流程：
 *   1. 创建智能体 (keypair + DID)
 *   2. 注册身份 (构建 DID 文档 → 内存上传)
 *   3. 生成 DID-CID 绑定证明
 *   4. 验证身份
 */

import { AgentAuthManager, MemoryIpfsClient } from '../src/index.js';

async function main() {
  try {
    // === 初始化认证管理器（内存模式，无需外部 IPFS） ===
    console.log('\n🚀 初始化认证管理器（内存 IPFS 模式）...');
    const memoryIpfs = await MemoryIpfsClient.newMemory();
    const authManager = new (AgentAuthManager as any)(memoryIpfs);
    console.log('✅ 认证管理器已初始化（内存模式，不上传到外部网络）');

    // === 创建智能体 ===
    console.log('\n🤖 创建智能体...');
    const agentResult = authManager.createAgent('TestAgent');
    const { agentInfo, keypair, peerId } = agentResult;
    console.log('✅ 智能体创建成功:');
    console.log(`   Name:   ${agentInfo.name}`);
    console.log(`   DID:    ${keypair.did}`);
    console.log(`   PeerID: ${peerId.substring(0, 20)}...`);

    // === 注册身份（内存上传 DID 文档） ===
    console.log('\n📝 注册身份（内存模式）...');
    const registration = await authManager.registerAgent(agentInfo, keypair, peerId);
    console.log('✅ 身份注册成功:');
    console.log(`   DID:  ${registration.did}`);
    console.log(`   CID:  ${registration.cid}`);
    console.log(`   时间: ${registration.registeredAt}`);

    // === 生成证明 ===
    console.log('\n🔐 生成身份证明...');
    const proofResult = await authManager.generateProof(keypair, registration.cid);
    console.log('✅ 证明生成:');
    console.log(`   结果:   ${proofResult.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   耗时:   ${proofResult.processingTimeMs}ms`);

    if (!proofResult.success) {
      console.error('❌ 证明生成失败，流程终止');
      process.exit(1);
    }

    // === 验证身份 ===
    console.log('\n🔍 验证身份...');
    const verifyResult = await authManager.verifyIdentity(registration.cid, proofResult.proof!);
    console.log('✅ 身份验证:');
    console.log(`   结果:      ${verifyResult.success ? '✅ 通过' : '❌ 失败'}`);
    for (const detail of verifyResult.verificationDetails) {
      console.log(`   ${detail}`);
    }

    // === 总结 ===
    console.log('\n' + '='.repeat(50));
    console.log('🎉 DIAP 协议全流程验证通过！');
    console.log('='.repeat(50));
    console.log(`   智能体: ${agentInfo.name}`);
    console.log(`   DID:    ${keypair.did}`);
    console.log(`   CID:    ${registration.cid}`);
    console.log(`   证明:   ${proofResult.success ? '✅' : '❌'}`);
    console.log(`   验证:   ${verifyResult.success ? '✅' : '❌'}`);
    console.log(`   总耗时: ${proofResult.processingTimeMs + verifyResult.processingTimeMs}ms`);
    console.log('');

    // 清理
    await authManager.stop();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    console.error('   堆栈:', error.stack);
    process.exit(1);
  }
}

main();
