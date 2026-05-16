import { SimplifiedBackend } from './src/zkp/simplified-backend.js';
import { UniversalNoirManager } from './src/zkp/universal-manager.js';

console.log('=== ZKP Module Test ===\n');

async function runTest() {
  try {
    console.log('1. Create SimplifiedBackend...');
    const backend = new SimplifiedBackend();
    console.log('   ✓ SimplifiedBackend created');

    console.log('\n2. Check backend methods...');
    console.log(`   - generateProof: ${typeof backend.generateProof}`);
    console.log(`   - verifyProof: ${typeof backend.verifyProof}`);
    console.log(`   - isAvailable: ${typeof backend.isAvailable}`);

    console.log('\n3. Create UniversalNoirManager...');
    const manager = await UniversalNoirManager.new();
    console.log('   ✓ UniversalNoirManager created');

    console.log('\n4. Get backend info...');
    const info = manager.getBackendInfo();
    console.log(`   - Backend type: ${info.backendType}`);
    console.log(`   - Available: ${info.isAvailable}`);

    console.log('\n=== ZKP tests passed ===');
  } catch (error) {
    console.error(`   FAILED: ${error.message}`);
  }
}

runTest();