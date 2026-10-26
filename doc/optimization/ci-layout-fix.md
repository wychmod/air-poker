# GitHub Actions 40273935600 失败修复

2026-10-26，失败提交 6f194f5，Pages job 121412539665。远程报告显示 57 个浏览器场景中 56 个通过，仅 phone-320-subpath 的“教学示例选中反馈跟随草稿，手动编辑和清空会取消选中”失败，重试仍失败。

## 原因与证据

用例在 e2e/review-fixes.spec.js 点击 tutorial-clear-hand 时超时；日志明确记录 hand-workbench 与底部 tutorial-practice-actions 拦截点击。构建、134 项单测、浏览器安装都已通过，部署步骤被跳过。Node 20 Action 运行时警告与 ubuntu-latest 迁移提示不是本次测试断言失败的直接原因。

英文示例标题 Three-of-a-kind example 使用 white-space: nowrap，flex 文案列也未允许收缩。320px 窄屏上文字横向溢出；本地测量 clientWidth=320、scrollWidth=339、innerWidth=339，底部固定操作栏也超出实际视口。平台字体差异会影响具体排版和点击表现，不能以 Windows 上一次点击成功否定 CI 的失败。

原有构牌宽度断言使用 innerWidth，而移动端 innerWidth 也会随溢出扩大，因此漏掉这种情况。新增视口边界断言在未修复版本稳定失败，差值 19px。

## 修改

- styles/narrative.css：示例文案列 min-width: 0；标题允许换行及必要的长词断行，保持五张牌完整。
- e2e/review-fixes.spec.js：英文切换和重新填入示例后，检查页面实际宽度以及底部固定操作栏的视口边界，再执行原来的真实 Clear 点击。
- e2e/game.spec.js：同样使用 documentElement.clientWidth 核对横向溢出。
- 保留真实点击、原有超时和所有测试，不使用 force 或降低断言要求。

## 验证

- 修复前：新增窄屏边界断言失败，溢出 19px；output/harness/ci-layout-before.log。
- 修复后：320px 页面 clientWidth/scrollWidth/innerWidth 均为 320，底栏宽 296px、底边 844px，位于 320×844 视口内；英文示例截图 output/harness/ci-40273935600/candidates-fixed.png。
- 完整工程检查通过：134 项回归、语法、架构、格式、构建、资源预算及 48 个资源的 HTTP 检查；output/harness/ci-layout-check.log。
- 使用 CI=1、两个 worker 运行全部浏览器场景，57 项全部通过，无失败或 flaky；output/harness/ci-layout-browser-full.log。
- 推送修复后由 Project checks 与 Deploy to GitHub Pages 工作流执行远程 Linux 验证；远程发布结果应以该修复提交对应的 Actions 记录为准。

原始远程结果和失败截图保存在 output/harness/ci-40273935600/。本机 gh 未登录；通过公开仓库信息和 nightly.link 的公开附件下载入口，按范围提取 results.json 与失败截图，未下载整个约 466 MB 的 trace 附件。
