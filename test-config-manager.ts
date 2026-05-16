import { ConfigManager, getDefaultConfig, loadConfig, saveConfig } from './src/index.js';

const TEST_CONFIG_PATH = '/tmp/test-diap-config.json';

async function runTests() {
  console.log('=== ConfigManager Test Suite ===\n');

  // Test 1: getDefaultConfig
  console.log('Test 1: getDefaultConfig()');
  try {
    const defaultConfig = getDefaultConfig();
    console.log('  ✓ getDefaultConfig() succeeded');
    console.log(`  - Agent name: ${defaultConfig.agent.name}`);
    console.log(`  - Cache enabled: ${defaultConfig.cache.enabled}`);
    console.log(`  - Log level: ${defaultConfig.logging.level}`);
  } catch (error) {
    console.log(`  ✗ getDefaultConfig() failed: ${error}`);
  }

  // Test 2: ConfigManager.load() - async load/create
  console.log('\nTest 2: ConfigManager.load()');
  try {
    const manager = await ConfigManager.load();
    console.log('  ✓ ConfigManager.load() succeeded');
    console.log(`  - Config path: ${manager.getConfigPath()}`);
    const cfg = manager.getConfig();
    console.log(`  - Agent name: ${cfg.agent.name}`);
  } catch (error) {
    console.log(`  ✗ ConfigManager.load() failed: ${error}`);
  }

  // Test 3: ConfigManager constructor
  console.log('\nTest 3: ConfigManager constructor');
  try {
    const config = getDefaultConfig();
    const manager = new ConfigManager(config, TEST_CONFIG_PATH);
    console.log('  ✓ ConfigManager constructor succeeded');
    console.log(`  - Config path: ${manager.getConfigPath()}`);
    console.log(`  - Retrieved config agent name: ${manager.getConfig().agent.name}`);
  } catch (error) {
    console.log(`  ✗ ConfigManager constructor failed: ${error}`);
  }

  // Test 4: ConfigManager.fromFile() with non-existent file
  console.log('\nTest 4: ConfigManager.fromFile() with non-existent file');
  try {
    ConfigManager.fromFile('/tmp/non-existent-config.json');
    console.log('  ✗ Should have thrown an error');
  } catch (error) {
    console.log(`  ✓ Correctly threw error: ${(error as Error).message}`);
  }

  // Test 5: Update config
  console.log('\nTest 5: updateConfig()');
  try {
    const config = getDefaultConfig();
    const manager = new ConfigManager(config, TEST_CONFIG_PATH);
    manager.updateConfig({
      agent: { name: 'Test Agent', privateKeyPath: '/tmp/test.key', autoGenerateKey: false },
      logging: { level: 'debug' }
    });
    const updated = manager.getConfig();
    console.log('  ✓ updateConfig() succeeded');
    console.log(`  - Updated agent name: ${updated.agent.name}`);
    console.log(`  - Updated log level: ${updated.logging.level}`);
  } catch (error) {
    console.log(`  ✗ updateConfig() failed: ${error}`);
  }

  // Test 6: Sub-config accessors
  console.log('\nTest 6: Sub-config accessors');
  try {
    const config = getDefaultConfig();
    const manager = new ConfigManager(config, TEST_CONFIG_PATH);
    console.log(`  - getAgentConfig(): ${manager.getAgentConfig().name}`);
    console.log(`  - getIpfsConfig() timeout: ${manager.getIpfsConfig().timeoutSeconds}`);
    console.log(`  - getCacheConfig() enabled: ${manager.getCacheConfig().enabled}`);
    console.log('  ✓ All sub-config accessors worked');
  } catch (error) {
    console.log(`  ✗ Sub-config accessors failed: ${error}`);
  }

  // Test 7: saveConfig (saveConfig function)
  console.log('\nTest 7: saveConfig()');
  try {
    const config = getDefaultConfig();
    config.agent.name = 'Saved Agent';
    await saveConfig(config, TEST_CONFIG_PATH);
    console.log('  ✓ saveConfig() succeeded');
  } catch (error) {
    console.log(`  ✗ saveConfig() failed: ${error}`);
  }

  // Test 8: Validate config
  console.log('\nTest 8: validate()');
  try {
    const config = getDefaultConfig();
    const manager = new ConfigManager(config, TEST_CONFIG_PATH);
    const result = manager.validate();
    console.log(`  - Validation valid: ${result.valid}`);
    console.log(`  - Errors: ${result.errors.length > 0 ? result.errors.join(', ') : 'none'}`);
    console.log('  ✓ validate() succeeded');
  } catch (error) {
    console.log(`  ✗ validate() failed: ${error}`);
  }

  // Test 9: Load saved config
  console.log('\nTest 9: Load saved config with fromFile()');
  try {
    const manager = ConfigManager.fromFile(TEST_CONFIG_PATH);
    console.log(`  - Loaded agent name: ${manager.getConfig().agent.name}`);
    console.log('  ✓ ConfigManager.fromFile() succeeded');
  } catch (error) {
    console.log(`  ✗ ConfigManager.fromFile() failed: ${error}`);
  }

  console.log('\n=== Test Suite Complete ===');
}

runTests().catch(console.error);
