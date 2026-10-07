---
title: 发布与更新
description: 发布稳定的 GitHub 插件归档，验证需要明确操作的更新流程。
---

## 准备稳定的插件身份

把 `plugin.json` 的 `repository` 指向你的 HTTPS GitHub 源码仓库。发布更新时保持 `name` 不变。所有包内容变化，包括内置 Skill，都要提升源码版本：兼容修复升 patch、兼容新增升 minor、不兼容包 API 升 major。已发布标签和归档保持不可变。

OpenAgent 从仓库最新的**稳定版** GitHub Release 发现更新，预发布版本不会成为更新候选。插件协议兼容性与版本排序分别判断。

## 校验并运行插件

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/project-notes --require-i18n
```

安装准备发布的实际包，逐项使用所有声明的组件。检查已安装副本、支持语言、适用的主题切换、数据持久化和失败路径。归档需要包含运行所需代码和资源，清单不会自动打包外部依赖。

## 创建发布归档

在插件独立仓库中提交校验后的包，让 `plugin.json` 位于仓库根目录。例如：

```sh
git archive --format=zip --output=../project-notes-1.0.0.zip HEAD
```

把归档作为附件上传到同一提交的稳定版 GitHub Release，附件必须同时符合：

| 要求 | 内容 |
| --- | --- |
| 下载地址 | HTTPS GitHub Release 附件 |
| 格式 | `.zip`、`.tar.gz` 或 `.tgz` |
| 摘要 | GitHub 提供的 `sha256:` 摘要，与实际字节一致 |
| 大小 | 压缩后不超过 50 MiB，解压后不超过 100 MiB |
| 根目录 | 直接包含 `plugin.json` |
| 身份 | 清单 `name` 与已安装插件一致 |

通过 GitHub Release 附件 API 核验摘要。单独上传校验和文本不能替代 GitHub 附件摘要。排除凭据和开发状态，解压时不接受路径穿越与链接。

## 从旧安装验证更新

在隔离测试环境安装旧版，创建有代表性的插件数据，然后在设置中检查更新。检查不会下载或执行包代码。明确点击**更新**后，OpenAgent 才下载、核验、在暂存目录校验并原子替换插件。激活失败会恢复旧包，`PLUGIN_DATA` 保留。

确认新版版本号、命令与工具、保留的数据，并验证损坏归档或摘要错误能给出有用提示。插件数据迁移由插件自己管理，需要独立恢复方案。卸载也会保留插件数据，不应承诺卸载会清除全部状态。

完整发布规则见 [Plugin Kit 发布文档](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/publishing.md)。
