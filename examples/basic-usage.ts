/**
 * 基本使用示例
 */

import { AgentAuthManager } from '../src/index.js';

async function main() {
  try {
    // 创建认证管理器
    console.log('Creating AgentAuthManager...');
    const authManager = await AgentAuthManager.new();

    // 创建智能体
    console.log('Creating agent...');
    const { agentInfo, keypair, peerId } = authManager.createAgent('TestAgent', 'test@example.com');
    console.log('Agent created:', {
      name: agentInfo.name,
      did: keypair.did,
      peerId: peerId.substring(0, 20) + '...',
    });

    // 注册身份
    console.log('Registering identity...');
    const registration = await authManager.registerAgent(agentInfo, keypair, peerId);
    console.log('Identity registered:', {
      did: registration.did,
      cid: registration.cid,
    });

    // 生成证明
    console.log('Generating proof...');
    const proofResult = await authManager.generateProof(keypair, registration.cid);
    console.log('Proof generated:', {
      success: proofResult.success,
      processingTime: proofResult.processingTimeMs + 'ms',
    });

    // 验证身份
    console.log('Verifying identity...');
    const verifyResult = await authManager.verifyIdentity(
      registration.cid,
      proofResult.proof!
    );
    console.log('Identity verified:', {
      success: verifyResult.success,
      verificationDetails: verifyResult.verificationDetails,
    });

    // 清理
    await authManager.stop();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
