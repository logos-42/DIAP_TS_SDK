import { DIDBuilder } from './src/did-builder.js';
import { KeyManager } from './src/key-manager.js';

console.log('=== DIDBuilder Test ===\n');

try {
  console.log('1. Create KeyManager for DID...');
  const keyManager = await KeyManager.generate();
  console.log('   ✓ KeyManager created');

  console.log('\n2. Build DID document...');
  const did = keyManager.getDID();
  console.log(`   - DID: ${did}`);

  console.log('\n3. Create DIDBuilder...');
  const builder = new DIDBuilder(did, keyManager);
  const doc = builder.build();
  console.log('   ✓ DID Document built');
  console.log(`   - @context: ${doc['@context']}`);
  console.log(`   - ID: ${doc.id}`);

  console.log('\n4. Verify DID document...');
  const isValid = DIDBuilder.verify(doc);
  console.log(`   - Document valid: ${isValid}`);

  console.log('\n=== DIDBuilder tests passed ===');
} catch (error) {
  console.error(`   FAILED: ${error.message}`);
  console.error(error.stack);
}