import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { parseSentenceMarkdown } from "./build-sentence-bank.mjs";

const projectRoot = process.cwd();
const [markdown, overridesText, homeHtml, sentenceHtml] = await Promise.all([
  readFile(join(projectRoot, "output.md"), "utf8"),
  readFile(join(projectRoot, "sentence_overrides.json"), "utf8"),
  readFile(join(projectRoot, "index.html"), "utf8"),
  readFile(join(projectRoot, "sentence.html"), "utf8"),
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
  sentenceHtml.includes("./sentence_qb/manifest.json"),
  "句子页必须自动加载分片题库清单",
);
assert(sentenceHtml.includes("整句错误｜本题 0 分"), "页面必须明确展示整句判分规则");

const inlineScript = sentenceHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert(inlineScript, "句子页脚本缺失");
const browserSandbox = {
  console,
  setInterval,
  clearInterval,
  fetch,
  FileReader: class {},
  Blob: class {},
  URL: { createObjectURL: () => "" },
  document: {
    getElementById: () => ({ className: "", innerHTML: "" }),
    createElement: () => ({ click: () => {} }),
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
};
vm.runInNewContext(inlineScript, browserSandbox);

const scoringQuestion = bank.questions.find(
  (question) => question.structure.filter((part) => part.type === "blank").length > 1,
);
assert(scoringQuestion, "缺少多空位题，无法校验整句判分");
const correctMap = { ...scoringQuestion.correctAnswers };
assert.equal(browserSandbox.isQuestionCorrect(scoringQuestion, correctMap), true);
const firstBlankId = Object.keys(correctMap)[0];
const wrongOption = scoringQuestion.options.find(
  (option) => option.text !== scoringQuestion.options.find(
    (candidate) => candidate.id === correctMap[firstBlankId],
  )?.text,
);
assert(wrongOption, "缺少可用于判错的干扰词块");
assert.equal(
  browserSandbox.isQuestionCorrect(scoringQuestion, {
    ...correctMap,
    [firstBlankId]: wrongOption.id,
  }),
  false,
  "任一空位错误时整题必须判错",
);
const incompleteMap = { ...correctMap };
delete incompleteMap[firstBlankId];
assert.equal(
  browserSandbox.isQuestionCorrect(scoringQuestion, incompleteMap),
  false,
  "任一空位未填时整题必须判错",
);

console.log(
  `句子题库校验通过：${bank.stats.total} 道，${bank.stats.unique} 道去重，分类 ${JSON.stringify(bank.stats.categoryCounts)}`,
);
