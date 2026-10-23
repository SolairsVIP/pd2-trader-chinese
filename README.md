# PD2 Trader 中文本地化项目

当前版本：**0.10.7 实验测试版**。本项目由 Solaris 维护，包含 PD2 Trader 中文界面、词缀翻译和查价筛选修复。

## 项目文件

- `pd2-trader-cn-0.10.7-src.zip`：完整源码快照，可直接解压查看。
- `pd2-trader-cn-0.10.7.bundle`：包含 `main` 分支及初始 Git 提交的 Git bundle。下载后运行 `git clone .\pd2-trader-cn-0.10.7.bundle pd2-trader-cn`，即可得到带提交历史的源码仓库。

本地化源码基于 `errolgr/pd2-trade` 整理；上游采用 MIT License。请保留源码包内的 `LICENSE` 文件和版权声明。

## 本地构建

Windows 构建需要 Node.js、Rust 工具链和 Windows C++ 构建工具。在源码目录运行：

```powershell
npm ci
npm run tauri -- build --bundles nsis
```

NSIS 安装包会生成在 `src-tauri/target/release/bundle/nsis/`。
