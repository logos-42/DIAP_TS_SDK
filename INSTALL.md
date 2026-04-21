# 安装说明

## Windows 安装问题解决方案

如果在 Windows 上遇到 `libp2p` 或原生模块编译错误，请按照以下步骤操作：

### 方案 1: 清理并重新安装（推荐）

```bash
# 删除 node_modules 和 package-lock.json
rmdir /s /q node_modules
del package-lock.json

# 使用 --legacy-peer-deps 安装
npm install --legacy-peer-deps
```

### 方案 2: 跳过可选依赖

```bash
# 删除 node_modules
rmdir /s /q node_modules

# 使用 --no-optional 跳过可选依赖
npm install --no-optional --legacy-peer-deps
```

### 方案 3: 使用 Yarn（如果 npm 失败）

```bash
# 安装 Yarn
npm install -g yarn

# 使用 Yarn 安装
yarn install
```

## 依赖说明

- **必需依赖**: 核心功能所需的包
- **可选依赖**: 
  - `o1js`: 零知识证明功能（如果安装失败，会自动回退到简化后端）
  - `libp2p`: P2P 网络功能（目前在 Windows 上可能有编译问题）

## 验证安装

安装完成后，运行以下命令验证：

```bash
# 编译 TypeScript
npm run build

# 运行测试
npm test
```

## 常见问题

### 问题: node-datachannel 编译失败

**解决方案**: 这是 `@libp2p/webrtc` 的依赖问题。由于我们已经将 `libp2p` 移除，这个问题应该不会出现。

### 问题: o1js 安装失败

**解决方案**: o1js 是可选依赖。如果安装失败，SDK 会自动使用简化的 ZKP 后端。

### 问题: 权限错误 (EPERM)

**解决方案**: 
1. 以管理员身份运行命令提示符
2. 或者关闭所有可能锁定文件的程序（如 VS Code、文件资源管理器）
3. 使用 `npm cache clean --force` 清理缓存

## 开发环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0 或 Yarn >= 1.22.0
- Windows: 建议使用 PowerShell 或 Git Bash
