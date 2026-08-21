# 句子组合人物头像 Design QA

## 验收基准

- 主站布局参考：`/var/folders/fb/7sgk08r930q57br6vt0570qc0000gn/T/codex-clipboard-2e9b836f-afdd-4f52-8185-57e2b85f19ce.png`
- 对话人物形式参考：`/var/folders/fb/7sgk08r930q57br6vt0570qc0000gn/T/codex-clipboard-19b679a7-e37b-413c-a85e-d0dfa44326aa.png`
- 桌面实现截图：`qa/sentence-avatars-desktop.png`
- 移动实现截图：`qa/sentence-avatars-mobile.png`
- 全页对照：`qa/compare-full-desktop.png`
- 对话区聚焦对照：`qa/compare-dialogue-avatars.png`

## 视口与状态

- 桌面：CSS 视口 1440 × 900，截图 1440 × 900，deviceScaleFactor 1。
- 移动：CSS 视口 390 × 844，截图 390 × 844，deviceScaleFactor 1。
- 来源图片：主站参考 2310 × 1586；人物形式参考 1392 × 474。对照板按等比缩放归一化，没有拉伸人物或界面。
- 状态：问句专项第 1 题，未填答案。主站布局参考是已判分状态，只用于确认导航、队列、卡片与操作栏风格；人物形式以未填答案的聚焦参考为准。

## Findings

- 没有 P0、P1 或 P2 问题。
- 字体与层级：继续使用主站 Inter/系统字体、字号和字重；头像没有改变题干、句子或词块层级。
- 间距与布局：桌面头像为 64 × 64，移动端为 48 × 48；两句对话保持上下排列并与文本垂直居中。390px 视口无横向溢出。
- 颜色与视觉 token：沿用主站 slate、white、mint、blue；头像边框分别使用克制的绿色和蓝色语义色。
- 图片质量：两张原创人物头像均为透明 PNG，缩放源为 320px，圆形裁切清晰，没有透明底白边、网格或拉伸。
- 文案与内容：题目、提示、词块、计分和操作文案未发生变化。

## 交互与运行检查

- 点击词块后填入计数由 `0 / 6` 更新为 `1 / 6`。
- 点击 Reset 后恢复为 `0 / 6`。
- 两张头像均完成加载，浏览器控制台无错误。
- 桌面和移动端的底部操作区保持可用。

## Comparison History

- 初始问题：对话人物被 A/B 字母块替代，与用户指定的双人对话形式不一致。
- 修复：生成两张原创透明人物头像，替换 A/B 字母块；保留主站导航、卡片、按钮和响应式结构。
- 修复后证据：`qa/compare-full-desktop.png` 与 `qa/compare-dialogue-avatars.png` 显示两个人物分别对应两句对话，人物形态清晰，整体产品风格没有漂移。

## Follow-up Polish

- P3：人物为原创头像，不复刻参考截图中的具体身份；这是为了保持素材清晰度和可用性，人物位置、圆形形式和对话关系保持一致。

final result: passed

---

# Listen and Choose a Best Response Design QA

## 验收基准

- 功能布局参考：`/var/folders/fb/7sgk08r930q57br6vt0570qc0000gn/T/codex-clipboard-ba1cfc6d-5b45-415b-82ec-052ca5729124.png`
- 用户标注参考：`/var/folders/fb/7sgk08r930q57br6vt0570qc0000gn/T/codex-clipboard-c433a834-575b-4b91-b88c-2932e46b7b3b.png`
- 主页入口截图：`qa/listening-home-entry.png`
- 桌面实现截图：`qa/listening-desktop-final.png`
- 参考尺寸实现截图：`qa/listening-reference-size-final-v2.png`
- 手机实现截图：`qa/listening-mobile-final.png`
- 手机滚动后截图：`qa/listening-mobile-scrolled-final.png`
- 并排视觉对照：`qa/listening-design-comparison.png`

## 视口与状态

- 桌面：CSS 视口 1440 × 1000，截图 1440 × 1000，deviceScaleFactor 1。
- 参考尺寸：CSS 视口 1279 × 626，截图 1279 × 626，deviceScaleFactor 1。
- 手机：CSS 视口 390 × 844，截图 390 × 844，deviceScaleFactor 1。
- 状态：第 1 题初始状态；音频未播放，四个答案锁定。另验收了播放结束、重复播放、错误判分、重置、前后题、完成页和历史记录。

## Findings

- 最终没有 P0、P1 或 P2 问题。
- 信息结构保留截图核心：固定题型标题、固定人物区、四个可变选项、一题一段音频和播放进度；没有复刻旧考试页面的外壳。
- 视觉系统继续使用主站的 Inter、slate/cyan token、顶部导航、左侧题目队列、白色卡片、圆角和底部操作栏。
- 原创透明人物图与音频区域实际槽位匹配，人物没有拉伸、白边或截图式背景。
- 1279 × 626 短屏中人物、四个选项、音频控件和主要操作都位于首屏；390px 宽度没有横向溢出，题目区可纵向滚动至全部选项与音频控件。

## 交互与运行检查

- 播放前答案不可选择；播放后解锁，结束后按钮恢复为“播放题目音频”，再次点击可从头重播。
- 正确与错误选项均显示判分、正确回应、音频文本和说明。
- Reset、Prev、Next、最后一题“完成”、练习总结和本地历史记录均通过真实浏览器检查。
- 主页“听力回应”入口可进入 `/practice/listening.html`。
- 浏览器控制台没有应用错误；仅有项目既有的 Tailwind CDN 开发警告。

## Comparison History

- P2：短屏首版中第四个选项和音频控件落到首屏之外。修复为短屏压缩题目舞台并隐藏重复说明，最终参考尺寸截图完整显示核心操作。
- P2：音量首次加载时错误显示 0。修复空本地存储的默认值逻辑并验证为 80。
- P2：音频播放结束后无障碍标签仍可能显示暂停。修复 ended 状态判断，验证结束后为播放、重播中为暂停。
- P2：手机首版内部内容高度大于容器但外层未滚动。为移动端工作区增加纵向滚动与 overscroll 约束，验证滚动位置可达 463.5px，全部选项和音频控件可访问。

## Follow-up Polish

- P3：用户已确认获得官方授权，ETS 题目和音频随公开构建发布，主页入口在 Production 中正常显示。

final result: passed
