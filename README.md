# PD2 Trader 中文版

这是 PD2 Trader 的中文本地化分支。本仓库当前整理为 **0.10.7 实验测试版**，保留中文版 0.10.6 中恢复出的中文界面和词缀翻译，并修复部分带触发技能的词缀在查价筛选中使用错误数值字段的问题。

## 版本说明

- 产品版本：0.10.7
- 本地化：Solaris
- 自动更新：已关闭；新版需手动安装。
- 安装身份与英文版、中文版 0.10.6 分开，测试安装不会覆盖它们。
- 此版本用于查价问题验证，安装包由项目维护者单独分发。

## 上游与许可

本项目基于 [errolgr/pd2-trade](https://github.com/errolgr/pd2-trade) 的开源源码整理和本地化。上游采用 MIT License；请保留本仓库中的 [LICENSE](LICENSE) 文件及版权声明。

## Windows 构建

需要 Node.js、Rust 工具链和 Windows C++ 构建工具。安装 npm 依赖后，可在仓库根目录运行：

```powershell
npm ci
npm run tauri -- build --bundles nsis
```

NSIS 安装包生成于 `src-tauri/target/release/bundle/nsis/`。
