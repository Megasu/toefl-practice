import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const projectRoot = process.cwd();
const listeningRoot = join(projectRoot, "listening_qb");
const [manifestText, homeHtml, listeningHtml, listeningCss, listeningJs, prepareScript] = await Promise.all([
  readFile(join(listeningRoot, "manifest.json"), "utf8"),
  readFile(join(projectRoot, "index.html"), "utf8"),
  readFile(join(projectRoot, "listening.html"), "utf8"),
  readFile(join(projectRoot, "listening.css"), "utf8"),
  readFile(join(projectRoot, "listening.js"), "utf8"),
  readFile(join(projectRoot, "scripts", "prepare-static.mjs"), "utf8"),
]);

const manifest = JSON.parse(manifestText);
assert.equal(manifest.enabled, true, "听力题库必须显式启用");
assert.equal(manifest.localOnly, false, "获得授权的题库必须允许公开构建");
assert.equal(manifest.distribution, "authorized-public", "公开题库必须记录授权发布状态");
assert.equal(manifest.questionCount, 30, "首版题库应为 30 道");
assert.equal(manifest.questions.length, 30, "题库条目数必须与清单一致");
assert.equal(manifest.sources.length, 2, "题目必须来自两套 ETS Student Practice Test");

const expectedAnswers = {
  "pt1-m1": [0, 2, 1, 1, 3, 3, 3, 0],
  "pt1-m2": [1, 0, 3, 1, 0, 1, 2],
  "pt2-m1": [1, 1, 3, 0, 0, 0, 0, 3],
  "pt2-m2": [1, 2, 2, 0, 2, 1, 0],
};

const questionIds = new Set();
for (const question of manifest.questions) {
  assert(!questionIds.has(question.id), `题号重复：${question.id}`);
  questionIds.add(question.id);
  assert.match(question.id, /^pt[12]-m[12]-q\d{2}$/);
  assert(["Woman", "Man"].includes(question.speaker), `${question.id} 说话人无效`);
  assert.equal(question.choices.length, 4, `${question.id} 必须有四个选项`);
  assert.equal(new Set(question.choices).size, 4, `${question.id} 选项不得重复`);
  assert(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4, `${question.id} 答案索引无效`);
  assert(question.promptTranscript.trim().length > 4, `${question.id} 缺少原句`);
  assert(question.explanation.trim().length > 4, `${question.id} 缺少解析`);
  const audioPath = join(listeningRoot, question.audio);
  const audioStat = await stat(audioPath);
  assert(audioStat.size > 10000, `${question.id} 音频文件异常`);
  const header = await readFile(audioPath);
  if (question.audio.endsWith(".ogg")) {
    assert.equal(header.subarray(0, 4).toString("ascii"), "OggS", `${question.id} 不是有效 OGG 文件`);
  } else if (question.audio.endsWith(".mp3")) {
    assert(
      header.subarray(0, 3).toString("ascii") === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0),
      `${question.id} 不是有效 MP3 文件`,
    );
  } else {
    assert.fail(`${question.id} 使用了不支持的音频格式`);
  }
}

for (const [group, answers] of Object.entries(expectedAnswers)) {
  const [sourceSet, modulePart] = group.split("-");
  const module = Number(modulePart.slice(1));
  const questions = manifest.questions.filter(question => question.sourceSet === sourceSet && question.module === module);
  assert.equal(questions.length, answers.length, `${group} 题量错误`);
  assert.deepEqual(questions.map(question => question.correctIndex), answers, `${group} 答案与 ETS 答案表不一致`);
}

assert(!prepareScript.includes("INCLUDE_PRIVATE_LISTENING"), "公开构建不得依赖私有题库开关");
assert(prepareScript.includes('join(projectRoot, "listening_qb")'), "静态构建必须复制授权听力题库");
assert(prepareScript.includes('join(outputRoot, "listening_qb")'), "静态构建必须输出听力题库");
assert(homeHtml.includes('id="listening-entry"'), "主页必须提供听力入口");
assert(homeHtml.includes("detectListeningBank"), "主页入口必须按题库是否存在动态显示");
assert(!homeHtml.includes("questionCount !== 30"), "主页入口不得把题量写死为 30");
assert(homeHtml.includes("排列词块，组成正确句子"), "句子组合入口必须说明用户要完成的动作");
assert(homeHtml.includes("听一句，选出最合适的回应"), "听力入口必须说明用户要完成的动作");
assert(!homeHtml.includes("道题 · 每题一段音频"), "主页入口不应把题量和系统结构当成主文案");
assert(listeningHtml.includes("./listening.css"), "听力页必须使用独立样式文件");
assert(listeningHtml.includes("./listening.js"), "听力页必须使用独立交互脚本");
assert(listeningHtml.includes("TOEFL 备考系统"), "听力页必须沿用主站品牌导航");
assert(listeningCss.includes(".question-stage"), "听力页必须保留人物与选项的固定题面结构");
assert(listeningCss.includes("#f8fafc"), "听力页必须沿用主站背景色");
assert(listeningJs.includes("toefl_listening_history_v1"), "听力做题记录必须使用独立存储键");
assert(listeningJs.includes("./listening_qb/manifest.json"), "听力页必须从本地清单加载题库");
assert(listeningJs.includes("speaker-woman.png"), "听力题面必须保留固定人物图像");

function createElementStub() {
  return {
    innerHTML: "",
    textContent: "",
    value: "0",
    classList: { add: () => {}, remove: () => {} },
  };
}

const elements = new Map([
  ["listening-app", createElementStub()],
  ["listening-header-status", createElementStub()],
  ["listening-toast", createElementStub()],
]);
const audioListeners = new Map();
const audioStub = {
  paused: true,
  duration: 3,
  currentTime: 0,
  volume: 0.8,
  src: "",
  load() { this.currentTime = 0; },
  pause() { this.paused = true; audioListeners.get("pause")?.(); },
  async play() { this.paused = false; audioListeners.get("play")?.(); },
  addEventListener(event, handler) { audioListeners.set(event, handler); },
};
elements.set("listening-audio", audioStub);

let domReady = null;
const sandbox = {
  console,
  Error,
  Number,
  Set,
  Map,
  Date,
  Promise,
  requestAnimationFrame: callback => callback(),
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  fetch: async url => ({
    ok: String(url).includes("manifest.json"),
    status: String(url).includes("manifest.json") ? 200 : 404,
    json: async () => manifest,
  }),
  document: {
    getElementById: id => elements.get(id) || null,
    addEventListener: (event, callback) => {
      if (event === "DOMContentLoaded") domReady = callback;
    },
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
};

vm.runInNewContext(listeningJs, sandbox);
assert(domReady, "听力应用未注册初始化事件");
await domReady();
assert(elements.get("listening-app").innerHTML.includes("Choose the best response."), "真实页面逻辑未渲染题面");
assert(elements.get("listening-app").innerHTML.includes("response-option is-disabled"), "播放前选项必须锁定");

await sandbox.window.ListeningApp.toggleAudio();
assert(!elements.get("listening-app").innerHTML.includes("response-option is-disabled"), "播放后选项必须解锁");
sandbox.window.ListeningApp.selectAnswer(manifest.questions[0].correctIndex);
sandbox.window.ListeningApp.checkCurrent();
assert(elements.get("listening-app").innerHTML.includes("回答正确 · 本题 1 分"), "正确答案必须得到 1 分");
assert(elements.get("listening-app").innerHTML.includes(manifest.questions[0].promptTranscript), "检查后必须显示听力原句");
assert.equal(sandbox.window.ListeningApp.isCorrect(manifest.questions[0], manifest.questions[0].correctIndex), true);
assert.equal(sandbox.window.ListeningApp.isCorrect(manifest.questions[0], (manifest.questions[0].correctIndex + 1) % 4), false);

console.log(`听力题库校验通过：${manifest.questions.length} 道，30 个独立音频，答案与 ETS 两套练习一致`);
