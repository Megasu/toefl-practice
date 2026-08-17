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
