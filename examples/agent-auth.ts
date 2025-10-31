/**
 * 智能体认证示例
 */

import { AgentAuthManager } from '../src/index.js';

async function main() {
  try {
    // 创建认证管理器
    const authManager = await AgentAuthManager.new();

    // 创建两个智能体进行双向认证
    console.log('Creating agents for mutual authentication...');
    const alice = authManager.createAgent('Alice', 'alice@example.com');
    const bob = authManager.createAgent('Bob', 'bob@example.com');

    // 注册身份
    console.log('Registering identities...');
    const aliceRegistration = await authManager.registerAgent(
      alice.agentInfo,
      alice.keypair,
      alice.peerId
    );
    const bobRegistration = await authManager.registerAgent(
      bob.agentInfo,
      bob.keypair,
      bob.peerId
    );

    console.log('Identities registered:', {
      alice: aliceRegistration.did,
      bob: bobRegistration.did,
    });

    // 执行双向认证
    console.log('Performing mutual authentication...');
    const [aliceToBobProof, aliceToBobVerify, bobToAliceProof, bobToAliceVerify] =
      await authManager.mutualAuthentication(
        alice.agentInfo,
        alice.keypair,
        alice.peerId,
        aliceRegistration.cid,
        bob.agentInfo,
        bob.keypair,
        bob.peerId,
        bobRegistration.cid
      );

    console.log('Mutual authentication results:');
    console.log('  Alice -> Bob:', {
      proof: aliceToBobProof.success,
      verify: aliceToBobVerify.success,
    });
    console.log('  Bob -> Alice:', {
      proof: bobToAliceProof.success,
      verify: bobToAliceVerify.success,
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
