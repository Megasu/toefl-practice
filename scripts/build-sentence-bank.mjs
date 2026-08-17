import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORY_META = {
  "relative-clause": { label: "定语从句", shortLabel: "定语从句" },
  "noun-clause": { label: "名词性从句", shortLabel: "名词性从句" },
  question: { label: "问句", shortLabel: "问句" },
  "verb-collocation": { label: "动词和固定搭配", shortLabel: "固定搭配" },
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokenize(value) {
  return [...String(value || "").matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g)].map(
    (match) => ({
      value: match[0].toLowerCase().replace(/[’']/g, ""),
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
}

function parseTemplate(template) {
  const structure = [];
  const regex = /_+/g;
  let blankIndex = 0;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const staticText = template.slice(lastIndex, match.index);
    if (staticText) structure.push({ type: "static", text: staticText });
    structure.push({ type: "blank", id: `b${blankIndex++}` });
    lastIndex = regex.lastIndex;
  }

  const tail = template.slice(lastIndex);
  if (tail) structure.push({ type: "static", text: tail });
  return structure;
}

function buildText(structure, fill, options) {
  return structure
    .map((part) => {
      if (part.type === "static") return part.text;
      const optionId = fill[part.id];
      return options.find((option) => option.id === optionId)?.text || "";
    })
    .join("");
}

function solveTemplate(structure, options, answer) {
  const blanks = structure.filter((part) => part.type === "blank");
  if (!blanks.length || blanks.length > options.length) return null;

  const target = normalize(answer);
  const used = new Set();
  const selected = [];
  let solved = null;

  function search(index) {
    if (solved) return;

    const partialFill = {};
    selected.forEach((option, selectedIndex) => {
      partialFill[blanks[selectedIndex].id] = option.id;
    });

    let partial = "";
    let encounteredBlank = 0;
    for (const part of structure) {
      if (part.type === "static") {
        partial += part.text;
      } else if (encounteredBlank < index) {
        partial += options.find((option) => option.id === partialFill[part.id])?.text || "";
        encounteredBlank += 1;
      } else {
        break;
      }
    }

    if (!target.startsWith(normalize(partial))) return;

    if (index === blanks.length) {
      if (normalize(buildText(structure, partialFill, options)) === target) {
        solved = partialFill;
      }
      return;
    }

    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      if (used.has(optionIndex)) continue;
      used.add(optionIndex);
      selected.push(options[optionIndex]);
      search(index + 1);
      selected.pop();
      used.delete(optionIndex);
    }
  }

  search(0);
  return solved;
}

function recoverFromAnswer(answer, options) {
  const answerTokens = tokenize(answer);
  const optionTokens = options.map((option) => tokenize(option.text).map((token) => token.value));
  const matches = optionTokens.map((tokens) => {
    const result = [];
    if (!tokens.length) return result;
    for (let index = 0; index + tokens.length <= answerTokens.length; index += 1) {
      if (tokens.every((token, offset) => answerTokens[index + offset].value === token)) {
        result.push({ start: index, end: index + tokens.length });
      }
    }
    return result;
  });

  let best = [];
  let bestCoverage = 0;

  function search(position, used, picks, coverage) {
    if (picks.length > best.length || (picks.length === best.length && coverage > bestCoverage)) {
      best = picks.map((pick) => ({ ...pick }));
      bestCoverage = coverage;
    }

    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      if (used.has(optionIndex)) continue;
      for (const match of matches[optionIndex]) {
        if (match.start < position) continue;
        used.add(optionIndex);
        picks.push({ optionIndex, ...match });
        search(match.end, used, picks, coverage + match.end - match.start);
        picks.pop();
        used.delete(optionIndex);
      }
    }
  }

  search(0, new Set(), [], 0);
  best.sort((left, right) => left.start - right.start);

  if (!best.length) {
    throw new Error(`无法从标准答案恢复词块：${answer}`);
  }

  const structure = [];
  const correctAnswers = {};
  let cursor = 0;

  best.forEach((pick, index) => {
    const charStart = answerTokens[pick.start].start;
    const charEnd = answerTokens[pick.end - 1].end;
    const staticText = answer.slice(cursor, charStart);
    if (staticText) structure.push({ type: "static", text: staticText });
    const blankId = `b${index}`;
    structure.push({ type: "blank", id: blankId });
    correctAnswers[blankId] = options[pick.optionIndex].id;
    cursor = charEnd;
  });

  const tail = answer.slice(cursor);
  if (tail) structure.push({ type: "static", text: tail });
  return { structure, correctAnswers };
}

function classifyQuestion(answer) {
  const lower = answer.toLowerCase();
  const isQuestion = /[?？]\s*$/.test(answer);
  const hasNounClause =
    /\b(?:know|tell|ask|wonder|remember|recall|decide|understand|explain|guess|check|find out|figure out|sure|certain|idea|curious)\b[^.!?]*(?:\bwho\b|\bwhat\b|\bwhere\b|\bwhen\b|\bwhy\b|\bhow\b|\bwhether\b|\bif\b)/.test(lower) ||
    /\b(?:who|what|where|when|why|how|whether)\b[^.!?]*\b(?:is|are|was|were|will|would|could|should|has|have|had)\b/.test(lower);
  const hasRelativeClause =
    /\b(?:who|whom|whose|which)\b/.test(lower) ||
    /\b(?:one|person|student|teacher|professor|friend|classmate|book|class|course|program|school|university|college|company|store|restaurant|cafe|café|place|park|room|building|website|paper|article|topic|project|event|seminar|workshop|team|group|club|department|city|drawer|library|market|gym|option|choice|session|lecture|movie|job|internship|assignment|test|exam|schedule|syllabus|laptop|software|backpack|sandwich|museum|gallery|center|centre)\b[^.!?]{0,70}\b(?:that|who|which|whose|where)\b/.test(lower);

  // 四个专项必须互斥，避免同一道题在统计和专项练习中重复出现。
  // 问句以最终标点为最明确证据；陈述句再按从句特征归类，剩余归入搭配训练。
  if (isQuestion) return ["question"];
  if (hasRelativeClause) return ["relative-clause"];
  if (hasNounClause) return ["noun-clause"];
  return ["verb-collocation"];
}

function applyOverride(question, override) {
  if (!override) return question;
  const next = { ...question, ...override };
  if (Array.isArray(override.options)) {
    next.optionsRaw = override.options.map((option) => `\`${option}\``).join(" | ");
  }
  return next;
}

export function parseSentenceMarkdown(markdown, overrides = {}) {
  const modules = markdown
    .split("——————————")
    .map((moduleText) => moduleText.trim())
    .filter(Boolean);
  const questions = [];
  const moduleNames = [];

  for (const moduleText of modules) {
    const lines = moduleText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const moduleId = lines[0];
    if (!moduleId) continue;
    moduleNames.push(moduleId);
    let current = null;

    const finishQuestion = () => {
      if (!current) return;
      const key = `${moduleId}/${current.qNum}`;
      const source = applyOverride(current, overrides[key]);
      if (!source.topText || !source.sen2 || !source.optionsRaw || !source.ans) {
        throw new Error(`题目字段不完整：${key}`);
      }

      const options = source.optionsRaw
        .split("|")
        .map((text) => text.replace(/`/g, "").trim())
        .filter(Boolean)
        .map((text, optionIndex) => ({ id: `opt_${optionIndex}`, text }));
      const templateStructure = parseTemplate(source.sen2);
      const exactAnswers = solveTemplate(templateStructure, options, source.ans);
      const recovered = exactAnswers ? null : recoverFromAnswer(source.ans, options);
      const structure = recovered?.structure || templateStructure;
      const correctAnswers = recovered?.correctAnswers || exactAnswers;

      if (normalize(buildText(structure, correctAnswers, options)) !== normalize(source.ans)) {
        throw new Error(`答案校验失败：${key}`);
      }

      questions.push({
        id: `${moduleId}_${source.qNum}`,
        moduleId,
        qNum: source.qNum,
        topText: source.topText,
        sen2Str: source.sen2,
        ans: source.ans,
        options,
        structure,
        correctAnswers,
        categories: classifyQuestion(source.ans),
        sourceStatus: recovered ? "recovered" : "exact",
      });
    };

    for (const line of lines.slice(1)) {
      if (/^q\d+\b/i.test(line)) {
        finishQuestion();
        current = { qNum: line };
      } else if (current && line.startsWith("sen1:")) {
        current.topText = line.slice(5).trim();
      } else if (current && line.startsWith("sen2:")) {
        current.sen2 = line.slice(5).trim();
      } else if (current && line.startsWith("options:")) {
        current.optionsRaw = line.slice(8).trim();
      } else if (current && line.startsWith("ans:")) {
        current.ans = line.slice(4).trim();
      }
    }
    finishQuestion();
  }

  const duplicateMap = new Map();
  for (const question of questions) {
    const duplicateKey = `${question.topText}|||${question.sen2Str}`;
    question.duplicateKey = duplicateKey;
    if (!duplicateMap.has(duplicateKey)) duplicateMap.set(duplicateKey, []);
    duplicateMap.get(duplicateKey).push(question);
  }

  for (const group of duplicateMap.values()) {
    const occurrences = [...new Set(group.map((question) => question.moduleId))];
    for (const question of group) {
      question.frequency = group.length;
      question.occurrences = occurrences;
    }
  }

  const categoryCounts = Object.fromEntries(
    Object.keys(CATEGORY_META).map((categoryId) => [
      categoryId,
      questions.filter((question) => question.categories.includes(categoryId)).length,
    ]),
  );

  return {
    version: 3,
    source: "output.md",
    categories: CATEGORY_META,
    moduleNames,
    stats: {
      modules: moduleNames.length,
      total: questions.length,
      unique: duplicateMap.size,
      exact: questions.filter((question) => question.sourceStatus === "exact").length,
      recovered: questions.filter((question) => question.sourceStatus === "recovered").length,
      categoryCounts,
    },
    questions,
  };
}

export async function buildSentenceBank({ projectRoot, outputRoot }) {
  const [markdown, overrideText] = await Promise.all([
    readFile(join(projectRoot, "output.md"), "utf8"),
    readFile(join(projectRoot, "sentence_overrides.json"), "utf8"),
  ]);
  const bank = parseSentenceMarkdown(markdown, JSON.parse(overrideText));
  const outputDir = join(outputRoot, "sentence_qb");
  await rm(join(outputRoot, "sentence_qb.json"), { force: true });
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const files = [];
  for (const categoryId of Object.keys(CATEGORY_META)) {
    const categoryQuestions = bank.questions.filter(
      (question) => question.categories[0] === categoryId,
    );
    const file = `${categoryId}.json`;
    await writeFile(
      join(outputDir, file),
      `${JSON.stringify({ categoryId, questions: categoryQuestions })}\n`,
      "utf8",
    );
    files.push({ categoryId, file, count: categoryQuestions.length });
  }

  const { questions: _questions, ...manifestBase } = bank;
  const manifest = { ...manifestBase, files };
  const outputPath = join(outputDir, "manifest.json");
  await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return { outputPath, stats: bank.stats };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === process.argv[1]) {
  const projectRoot = process.cwd();
  const outputRoot = join(projectRoot, "public", "practice");
  const result = await buildSentenceBank({ projectRoot, outputRoot });
  console.log(`${basename(result.outputPath)}: ${JSON.stringify(result.stats)}`);
}
