/**
 * 自动安装配置示例
 *
 * 一次调用 checkKuboSetup() 搞定全部：
 *   1. 检测 ipfs 是否已安装
 *   2. 未安装 → 自动下载 Kubo 二进制
 *   3. 自动初始化仓库 (ipfs init)
 *   4. 自动配置 API 地址
 *   5. 自动启动守护进程
 *   6. 用本地节点完成 DID 发布 + IPNS
 *
 * 用户零操作。
 */

import { checkKuboSetup, AgentAuthManager, IpfsClient, MemoryIpfsClient } from '../src/index.js';

async function main() {
  // === 步骤 1: 一键检测 + 自动安装 ===
  console.log('\n🔧 检查本地 Kubo 节点（未安装则自动下载）...');
  const setup = await checkKuboSetup(true, true);

  if (!setup.ready) {
    console.log(`\n❌ Kubo 自动安装失败: ${setup.message}`);
    console.log('   降级为内存模式（不上传到 IPFS 网络）');
  } else if (!setup.daemonRunning) {
    console.log(`\nℹ️  Kubo 已安装但守护进程未运行`);
    console.log(`   ${setup.message}`);
    console.log('   降级为内存模式');
  } else {
    console.log(`\n✅ Kubo 就绪: ${setup.apiUrl}`);
  }

  // === 步骤 2: 创建认证管理器 ===
  let authManager: AgentAuthManager;
  let mode: string;

  if (setup.ready && setup.daemonRunning) {
    // 本地节点模式下，用远程 IPFS 上传
    console.log('\n🌐 使用本地 Kubo 节点...');
    const ipfs = await IpfsClient.newWithRemoteNode(
      setup.apiUrl!,
      setup.gatewayUrl!
    );
    authManager = new (AgentAuthManager as any)(ipfs);
    mode = 'local-kubo';
  } else {
    // 降级到内存模式（不上传真实 IPFS，但流程完整）
    console.log('\n📦 使用内存模式...');
    const ipfs = await MemoryIpfsClient.newMemory();
    authManager = new (AgentAuthManager as any)(ipfs);
    mode = 'memory';
  }

  console.log(`   模式: ${mode}`);

  // === 步骤 3: 创建智能体 ===
  console.log('\n🤖 创建智能体...');
  const { agentInfo, keypair, peerId } = authManager.createAgent('AutoSetupAgent');

  console.log(`   Name:   ${agentInfo.name}`);
  console.log(`   DID:    ${keypair.did}`);
  console.log(`   PeerID: ${peerId.substring(0, 20)}...`);

  // === 步骤 4: 注册身份 ===
  console.log('\n📝 注册身份...');
  const registration = await authManager.registerAgent(agentInfo, keypair, peerId);
  console.log(`   DID:  ${registration.did}`);
  console.log(`   CID:  ${registration.cid}`);

  // === 步骤 5: 生成证明 ===
  console.log('\n🔐 生成身份证明...');
  const proofResult = await authManager.generateProof(keypair, registration.cid);
  console.log(`   结果: ${proofResult.success ? '✅' : '❌'} (${proofResult.processingTimeMs}ms)`);

  // === 步骤 6: 验证身份 ===
  console.log('\n🔍 验证身份...');
  const verifyResult = await authManager.verifyIdentity(registration.cid, proofResult.proof!);
  console.log(`   结果: ${verifyResult.success ? '✅' : '❌'}`);

  // === 总结 ===
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 DIAP 全流程完成`);
  console.log('='.repeat(50));
  console.log(`   节点模式: ${mode}`);
  console.log(`   DID:      ${keypair.did}`);
  console.log(`   CID:      ${registration.cid}`);
  console.log(`   证明:      ${proofResult.success ? '✅' : '❌'}`);
  console.log(`   验证:      ${verifyResult.success ? '✅' : '❌'}`);
  console.log(`   总耗时:    ${proofResult.processingTimeMs + verifyResult.processingTimeMs}ms`);
  console.log('');

  await authManager.stop();
  process.exit(0);
}

main();
