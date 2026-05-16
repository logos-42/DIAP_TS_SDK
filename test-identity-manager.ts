import { IdentityManager } from './src/identity-manager.js';
import { IpfsClient } from './src/ipfs-client.js';
import { KeyManager } from './src/key-manager.js';

console.log('=== IdentityManager Test ===\n');

async function runTest() {
  try {
    console.log('1. Create IPFS client...');
    const ipfsClient = await IpfsClient.newPublicOnly(30);
    console.log('   ✓ IPFS client created');

    console.log('\n2. Create IdentityManager...');
    const identityManager = new IdentityManager(ipfsClient);
    console.log('   ✓ IdentityManager created');

    console.log('\n3. Create keypair...');
    const keypair = KeyManager.generate();
    console.log('   ✓ Keypair generated');
    console.log(`   - DID: ${keypair.did}`);

    console.log('\n=== IdentityManager tests passed ===');
    await ipfsClient.stop();
  } catch (error) {
    console.error(`   FAILED: ${error.message}`);
  }
}

runTest();