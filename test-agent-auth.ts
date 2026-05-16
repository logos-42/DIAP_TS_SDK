import { AgentAuthManager } from './src/agent-auth.js';

console.log('=== AgentAuthManager Test ===\n');

async function runTest() {
  try {
    console.log('1. Create AgentAuthManager...');
    const authManager = await AgentAuthManager.new();
    console.log('   ✓ AgentAuthManager created');

    console.log('\n2. Create an agent...');
    const result = authManager.createAgent('TestAgent');
    console.log('   ✓ Agent created');
    console.log(`   - Agent Name: ${result.agentInfo.name}`);
    console.log(`   - DID: ${result.keypair.did}`);
    console.log(`   - PeerID: ${result.peerId.substring(0, 20)}...`);

    console.log('\n=== AgentAuth tests passed ===');
    await authManager.stop();
  } catch (error) {
    console.error(`   FAILED: ${error.message}`);
  }
}

runTest();