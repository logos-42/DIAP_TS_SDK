/**
 * IPFS (Kubo) 本地节点——全自动安装配置
 *
 * 三步自动搞定：
 *   1. 检测是否已安装
 *   2. 未安装 → 自动下载安装
 *   3. 初始化 + 启动守护进程
 *
 * 用户零操作，程序全自动。
 */
import { logger } from './utils/logger.js';

// 默认 Kubo 版本（可以覆盖）
const DEFAULT_KUBO_VERSION = 'v0.43.0';

export interface KuboSetupResult {
  /** 是否就绪 */
  ready: boolean;
  /** ipfs 二进制是否在 PATH 中 */
  binaryFound: boolean;
  /** 守护进程是否运行 */
  daemonRunning: boolean;
  /** Kubo 版本 */
  version?: string;
  /** 配置的 API 地址 */
  apiUrl?: string;
  /** 配置的网关地址 */
  gatewayUrl?: string;
  /** 安装路径 */
  installPath?: string;
  /** 消息 */
  message?: string;
}

// ============================================================================
// 平台检测
// ============================================================================

function detectPlatform(): string {
  const p = typeof process !== 'undefined' ? process.platform : 'linux';
  if (p === 'darwin') return 'darwin';
  if (p === 'win32') return 'windows';
  return 'linux';
}

function detectArch(): string {
  const a = typeof process !== 'undefined' ? process.arch : 'x64';
  if (a === 'arm64') return 'arm64';
  if (a === 'x64') return 'amd64';
  if (a === 'arm') return 'arm';
  return 'amd64';
}

function getInstallDir(): string {
  const home = typeof process !== 'undefined'
    ? (process.env.HOME || process.env.USERPROFILE || '/tmp')
    : '/tmp';
  return `${home}/.diap/kubo`;
}

// ============================================================================
// 检查二进制
// ============================================================================

async function checkBinary(): Promise<{ found: boolean; version?: string; path?: string }> {
  try {
    const { execSync } = await import('child_process');
    const out = execSync('ipfs version --enc=json', {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 5000,
    }).toString().trim();
    const parsed = JSON.parse(out);
    logger.info(`  ipfs 已在 PATH 中 (v${parsed.Version || parsed.version || '?'})`);
    return { found: true, version: parsed.Version || parsed.version, path: 'ipfs' };
  } catch {
    // also check the install dir
    const installDir = getInstallDir();
    const binPath = detectPlatform() === 'windows'
      ? `${installDir}/ipfs.exe`
      : `${installDir}/ipfs`;
    try {
      const { execSync } = await import('child_process');
      const out = execSync(`"${binPath}" version --enc=json`, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 5000,
      }).toString().trim();
      const parsed = JSON.parse(out);
      logger.info(`  在安装目录找到 ipfs (v${parsed.Version || parsed.version || '?'})`);
      // add to PATH for current process
      process.env.PATH = `${installDir}:${process.env.PATH || ''}`;
      return { found: true, version: parsed.Version || parsed.version, path: binPath };
    } catch {
      return { found: false };
    }
  }
}

// ============================================================================
// 检查守护进程
// ============================================================================

async function checkDaemon(): Promise<{ running: boolean; apiUrl: string; gatewayUrl: string }> {
  const apiUrl = 'http://127.0.0.1:5001';
  const gatewayUrl = 'http://127.0.0.1:8080';

  try {
    const resp = await fetch(`${apiUrl}/api/v0/id`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      logger.info(`  节点 ID: ${(data.ID || '').substring(0, 12)}...`);
      return { running: true, apiUrl, gatewayUrl };
    }
  } catch {
    // not running
  }
  return { running: false, apiUrl, gatewayUrl };
}

// ============================================================================
// 自动下载安装 Kubo
// ============================================================================

/**
 * 获取最新 Kubo 版本号：优先查 dist.ipfs.tech 的版本列表取最新稳定版，
 * 查不到再退回固定版本 (避免长时间落后上游)。
 */
async function getKuboVersion(): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch('https://dist.ipfs.tech/kubo/versions', { signal: ctrl.signal });
    clearTimeout(t);
    if (resp.ok) {
      const text = await resp.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      // 只取正式版 (vX.Y.Z, 无 rc/beta/dev)
      const stable = lines.filter(l => /^v\d+\.\d+\.\d+$/.test(l));
      if (stable.length > 0) {
        const latest = stable[stable.length - 1];
        logger.info(`  Kubo 最新稳定版: ${latest} (本地默认 ${DEFAULT_KUBO_VERSION})`);
        return latest;
      }
    }
  } catch {
    // 网络失败 → 退回固定版本
  }
  return DEFAULT_KUBO_VERSION;
}

/**
 * 自动下载并安装 Kubo
 */
async function downloadAndInstall(version: string): Promise<boolean> {
  const platform = detectPlatform();
  const arch = detectArch();
  const installDir = getInstallDir();
  const fs = await import('fs');
  const path = await import('path');

  // 创建安装目录
  fs.mkdirSync(installDir, { recursive: true });

  // 确定文件名和下载 URL
  const ext = platform === 'windows' ? '.zip' : '.tar.gz';
  const archiveName = `kubo_${version}_${platform}-${arch}${ext}`;
  const downloadUrl = `https://dist.ipfs.tech/kubo/${version}/${archiveName}`;
  const archivePath = path.join(installDir, archiveName);

  logger.info(`📥 下载 Kubo ${version} (${platform}-${arch})...`);
  logger.info(`   来自: ${downloadUrl}`);

  // 下载
  const resp = await fetch(downloadUrl);
  if (!resp.ok) {
    throw new Error(`下载失败 HTTP ${resp.status}: ${resp.statusText}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(archivePath, buffer);
  logger.info(`   已下载 ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

  // 解压
  logger.info('📦 解压中...');
  if (platform === 'windows') {
    // Windows: 用 unzip 或解压 ZIP
    const { execSync } = await import('child_process');
    execSync(`unzip -o "${archivePath}" -d "${installDir}"`, { stdio: 'pipe', timeout: 30000 });
  } else {
    // macOS/Linux: tar.gz
    const { execSync } = await import('child_process');
    execSync(`tar -xzf "${archivePath}" -C "${installDir}"`, { stdio: 'pipe', timeout: 30000 });
  }

  // 把 kubo/kubo 二进制移到安装目录根
  const kuboSubdir = path.join(installDir, 'kubo');
  const kuboBin = platform === 'windows' ? 'ipfs.exe' : 'ipfs';
  if (fs.existsSync(path.join(kuboSubdir, kuboBin))) {
    // 移动二进制到安装目录根
    const src = path.join(kuboSubdir, kuboBin);
    const dst = path.join(installDir, kuboBin);
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst);
    }
    // 设置可执行权限
    try {
      fs.chmodSync(dst, 0o755);
    } catch { /* windows 忽略 */ }
  }

  // 清理：删除下载的压缩包和子目录
  try {
    fs.rmSync(archivePath, { force: true });
    fs.rmSync(kuboSubdir, { recursive: true, force: true });
  } catch { /* 清理失败不影响 */ }

  // 把安装目录加到 PATH
  process.env.PATH = `${installDir}:${process.env.PATH || ''}`;

  logger.info(`✅ 安装完成: ${installDir}/${kuboBin}`);
  return true;
}

/**
 * 初始化 Kubo 仓库（如果未初始化）
 */
async function initKuboRepo(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    // ipfs init 如果已初始化会报错，我们先试试
    execSync('ipfs init --profile server', {
      stdio: 'pipe',
      timeout: 15000,
    });
    logger.info('  ipfs 仓库已初始化');
    return true;
  } catch (e: any) {
    const msg = e.stderr?.toString() || e.message || '';
    if (msg.includes('already')) {
      logger.info('  ipfs 仓库已存在（跳过初始化）');
      return true;
    }
    logger.warn(`  ipfs init 失败: ${msg.substring(0, 100)}`);
    return false;
  }
}

/**
 * 配置 Kubo API 地址（确保本地访问）
 */
async function configureKubo(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync('ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001', {
      stdio: 'pipe',
      timeout: 10000,
    });
    execSync('ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080', {
      stdio: 'pipe',
      timeout: 10000,
    });
    logger.info('  API 地址已配置为 127.0.0.1:5001');
    return true;
  } catch (e: any) {
    logger.warn(`  配置失败: ${e.message?.substring(0, 100) || e}`);
    return false;
  }
}

// ============================================================================
// 启动守护进程
// ============================================================================

/**
 * 启动本地 Kubo 守护进程
 */
export async function startLocalKubo(): Promise<boolean> {
  try {
    const { execSync, spawn } = await import('child_process');

    // 用 swarm peers 判断 daemon 是否真正运行（ipfs id 在仓库存在时也能返回）
    try {
      execSync('ipfs swarm peers', { stdio: 'pipe', timeout: 3000 });
      logger.info('  ✅ 守护进程已在运行');
      return true;
    } catch {
      // 未运行
    }

    logger.info('  🚀 启动守护进程...');
    const daemon = spawn('ipfs', ['daemon', '--enable-pubsub-experiment'], {
      detached: true,
      stdio: 'ignore',
    });
    daemon.unref();

    // 等待启动（最多 20s）
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        execSync('ipfs swarm peers', { stdio: 'pipe', timeout: 2000 });
        logger.info('  ✅ 守护进程已就绪');
        return true;
      } catch {
        // 继续等
        if (i % 5 === 4) logger.info(`  ⏳ 等待守护进程启动... (${i + 1}s)`);
      }
    }

    logger.warn('  ⚠️ 守护进程启动超时，可稍后手动运行 `ipfs daemon`');
    return false;
  } catch (error) {
    logger.error(`  ❌ 启动失败: ${error}`);
    return false;
  }
}

// ============================================================================
// 一键全套
// ============================================================================

/**
 * 一键检测 + 自动安装 + 初始化 + 启动
 *
 * 调用一次，确保本地 Kubo 节点可用。
 * 用户完全不需要手动操作。
 */
export async function checkKuboSetup(
  autoInstall: boolean = true,
  autoStart: boolean = true
): Promise<KuboSetupResult> {
  logger.info('🔍 检查 IPFS (Kubo) 本地节点...');

  // === 步骤 1: 检查二进制 ===
  let binary = await checkBinary();

  // === 步骤 2: 未安装 → 自动下载安装 ===
  if (!binary.found && autoInstall) {
    logger.info('  ipfs 未找到，自动安装中...');
    try {
      const version = await getKuboVersion();
      const installed = await downloadAndInstall(version);
      if (installed) {
        binary = await checkBinary();
      }
    } catch (e: any) {
      return {
        ready: false,
        binaryFound: false,
        daemonRunning: false,
        message: `自动安装失败: ${e.message}`,
      };
    }
  }

  if (!binary.found) {
    return {
      ready: false,
      binaryFound: false,
      daemonRunning: false,
      message: 'Kubo 安装失败',
    };
  }

  logger.info(`  ✅ ipfs 就绪 (v${binary.version})`);

  // === 步骤 3: 初始化仓库 ===
  const initOk = await initKuboRepo();

  // === 步骤 4: 配置 API 地址 ===
  if (initOk) {
    await configureKubo();
  }

  // === 步骤 5: 检查/启动守护进程 ===
  let daemon = await checkDaemon();
  if (!daemon.running && autoStart) {
    logger.info('  守护进程未运行，自动启动中...');
    const started = await startLocalKubo();
    if (started) {
      // 重新检测
      await new Promise((r) => setTimeout(r, 1000));
      daemon = await checkDaemon();
    }
  }

  if (daemon.running) {
    logger.info('✅ Kubo 本地节点完全就绪');
    return {
      ready: true,
      binaryFound: true,
      daemonRunning: true,
      version: binary.version,
      apiUrl: daemon.apiUrl,
      gatewayUrl: daemon.gatewayUrl,
      installPath: binary.path,
      message: '本地 Kubo 已就绪',
    };
  }

  logger.warn('⚠️ 守护进程未运行，DID 发布将降级为仅 CID 模式');
  return {
    ready: true,
    binaryFound: true,
    daemonRunning: false,
    version: binary.version,
    installPath: binary.path,
    message: 'ipfs 已安装但守护进程未运行',
  };
}

/**
 * 确保本地 Kubo 节点可用（最简接口）
 *
 * 返回 { apiUrl, gatewayUrl } 或 null
 */
export async function ensureLocalIpfsNode(): Promise<{
  apiUrl: string;
  gatewayUrl: string;
} | null> {
  const setup = await checkKuboSetup(true, true);
  if (setup.ready && setup.daemonRunning && setup.apiUrl && setup.gatewayUrl) {
    return { apiUrl: setup.apiUrl, gatewayUrl: setup.gatewayUrl };
  }
  return null;
}
