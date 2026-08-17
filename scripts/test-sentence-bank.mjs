import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { parseSentenceMarkdown } from "./build-sentence-bank.mjs";

const projectRoot = process.cwd();
const [markdown, overridesText, homeHtml, sentenceHtml, sentenceJs, sentenceCss] = await Promise.all([
  readFile(join(projectRoot, "output.md"), "utf8"),
  readFile(join(projectRoot, "sentence_overrides.json"), "utf8"),
  readFile(join(projectRoot, "index.html"), "utf8"),
  readFile(join(projectRoot, "sentence.html"), "utf8"),
  readFile(join(projectRoot, "sentence.js"), "utf8"),
  readFile(join(projectRoot, "sentence.css"), "utf8"),
]);

const bank = parseSentenceMarkdown(markdown, JSON.parse(overridesText));
const categoryIds = new Set(Object.keys(bank.categories));
const questionIds = new Set();

assert.equal(bank.stats.modules, 114, "题库应包含 114 套来源模块");
assert.equal(bank.stats.total, 1143, "题库应完整保留 1143 道来源题");
assert.equal(bank.stats.exact + bank.stats.recovered, bank.stats.total);
assert.equal(
  Object.values(bank.stats.categoryCounts).reduce((sum, count) => sum + count, 0),
  bank.stats.total,
  "四类专项必须互斥且覆盖全部题目",
);

for (const question of bank.questions) {
  assert(!questionIds.has(question.id), `题号重复：${question.id}`);
  questionIds.add(question.id);
  assert.equal(question.categories.length, 1, `${question.id} 必须只有一个主分类`);
  assert(categoryIds.has(question.categories[0]), `${question.id} 分类无效`);

  const blanks = question.structure.filter((part) => part.type === "blank");
  assert(blanks.length > 0, `${question.id} 没有可填写空位`);
  assert.equal(Object.keys(question.correctAnswers).length, blanks.length);

  const reconstructed = question.structure
    .map((part) => {
      if (part.type === "static") return part.text;
      const option = question.options.find(
        (candidate) => candidate.id === question.correctAnswers[part.id],
      );
      assert(option, `${question.id}/${part.id} 缺少标准答案词块`);
      return option.text;
    })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const expected = question.ans.toLowerCase().replace(/[^a-z0-9]/g, "");
  assert.equal(reconstructed, expected, `${question.id} 还原结果与标准答案不一致`);
}

for (const [categoryId, count] of Object.entries(bank.stats.categoryCounts)) {
  assert(count > 0, `${categoryId} 专项不能为空`);
}

assert(homeHtml.includes("./sentence.html"), "主大厅必须提供句子组合入口");
assert(
  sentenceJs.includes("./sentence_qb/manifest.json"),
  "句子页必须自动加载分片题库清单",
);
assert(sentenceJs.includes("整句错误 · 本题 0 分"), "页面必须明确展示整句判分规则");
assert(sentenceHtml.includes("./sentence.css"), "句子页必须使用独立样式文件");
assert(sentenceHtml.includes("./sentence.js"), "句子页必须使用独立交互脚本");
assert(sentenceHtml.includes("TOEFL 备考系统"), "句子页必须沿用主站导航品牌");
assert(sentenceCss.includes("#f8fafc"), "句子页必须沿用主站背景色");
assert(sentenceJs.includes("speaker-woman.png"), "首句对话必须保留人物头像");
assert(sentenceJs.includes("speaker-man.png"), "答句对话必须保留人物头像");
assert(sentenceCss.includes(".speaker-avatar"), "人物头像必须使用统一的圆形对话样式");

const scoringQuestion = bank.questions.find(
  (question) => question.structure.filter((part) => part.type === "blank").length > 1,
);
assert(scoringQuestion, "缺少多空位题，无法校验整句判分");

const elements = new Map();
function createElementStub() {
  return {
    className: "",
    innerHTML: "",
    textContent: "",
    classList: { add: () => {}, remove: () => {} },
  };
}
for (const id of ["sentence-app", "header-status", "sentence-toast"]) {
  elements.set(id, createElementStub());
}
let domReady = null;
const { questions: _questions, ...manifestBase } = bank;
const manifest = {
  ...manifestBase,
  files: Object.keys(bank.categories).map((categoryId) => ({
    categoryId,
    file: `${categoryId}.json`,
  })),
};
const scoringCategory = scoringQuestion.categories[0];
const browserSandbox = {
  console,
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  fetch: async (url) => {
    if (String(url).includes("manifest.json")) {
      return { ok: true, json: async () => manifest };
    }
    const categoryId = Object.keys(bank.categories).find((id) => String(url).includes(`${id}.json`));
    return {
      ok: Boolean(categoryId),
      status: categoryId ? 200 : 404,
      json: async () => ({
        questions: categoryId === scoringCategory ? [scoringQuestion] : [],
      }),
    };
  },
  document: {
    getElementById: (id) => elements.get(id) || createElementStub(),
    addEventListener: (event, callback) => {
      if (event === "DOMContentLoaded") domReady = callback;
    },
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
};
vm.runInNewContext(sentenceJs, browserSandbox);
assert(domReady, "句子应用未注册初始化事件");
await domReady();
assert(elements.get("sentence-app").innerHTML.includes("句子组合专项"));
browserSandbox.window.SentenceApp.startCategory(scoringCategory);
assert(elements.get("sentence-app").innerHTML.includes("sentence-workspace"));
for (const blank of scoringQuestion.structure.filter((part) => part.type === "blank")) {
  browserSandbox.window.SentenceApp.placeWord(scoringQuestion.correctAnswers[blank.id]);
}
browserSandbox.window.SentenceApp.checkCurrent();
assert(
  elements.get("sentence-app").innerHTML.includes("整句正确 · 本题 1 分"),
  "完整正确答案必须在真实页面逻辑中得到 1 分",
);

const correctMap = { ...scoringQuestion.correctAnswers };
assert.equal(browserSandbox.window.SentenceApp.isQuestionCorrect(scoringQuestion, correctMap), true);
const firstBlankId = Object.keys(correctMap)[0];
const wrongOption = scoringQuestion.options.find(
  (option) => option.text !== scoringQuestion.options.find(
    (candidate) => candidate.id === correctMap[firstBlankId],
  )?.text,
);
assert(wrongOption, "缺少可用于判错的干扰词块");
assert.equal(
  browserSandbox.window.SentenceApp.isQuestionCorrect(scoringQuestion, {
    ...correctMap,
    [firstBlankId]: wrongOption.id,
  }),
  false,
  "任一空位错误时整题必须判错",
);
const incompleteMap = { ...correctMap };
delete incompleteMap[firstBlankId];
assert.equal(
  browserSandbox.window.SentenceApp.isQuestionCorrect(scoringQuestion, incompleteMap),
  false,
  "任一空位未填时整题必须判错",
);

console.log(
  `句子题库校验通过：${bank.stats.total} 道，${bank.stats.unique} 道去重，分类 ${JSON.stringify(bank.stats.categoryCounts)}`,
);
