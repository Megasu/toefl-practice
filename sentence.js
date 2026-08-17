(() => {
    "use strict";

    const appEl = document.getElementById("sentence-app");
    const headerStatusEl = document.getElementById("header-status");
    const toastEl = document.getElementById("sentence-toast");

    const CATEGORY_CONFIG = {
        "relative-clause": {
            label: "定语从句",
            english: "Relative Clauses",
            description: "关系词、先行词与修饰结构",
            card: "bg-sky-50 border-sky-200",
            text: "text-sky-900",
            muted: "text-sky-700/80",
            badge: "bg-sky-100 text-sky-700 border-sky-200"
        },
        "noun-clause": {
            label: "名词性从句",
            english: "Noun Clauses",
            description: "宾语从句与疑问词语序",
            card: "bg-violet-50 border-violet-200",
            text: "text-violet-900",
            muted: "text-violet-700/80",
            badge: "bg-violet-100 text-violet-700 border-violet-200"
        },
        question: {
            label: "问句",
            english: "Questions",
            description: "一般疑问句与特殊疑问句",
            card: "bg-amber-50 border-amber-200",
            text: "text-amber-900",
            muted: "text-amber-700/80",
            badge: "bg-amber-100 text-amber-700 border-amber-200"
        },
        "verb-collocation": {
            label: "动词和固定搭配",
            english: "Verbs & Collocations",
            description: "高频动词、介词与固定表达",
            card: "bg-emerald-50 border-emerald-200",
            text: "text-emerald-900",
            muted: "text-emerald-700/80",
            badge: "bg-emerald-100 text-emerald-700 border-emerald-200"
        }
    };

    const HISTORY_KEY = "toefl_history";
    let sentenceBankMeta = null;
    let fullDatabase = [];
    let uniqueDatabase = [];
    let moduleNames = [];
    let toastTimer = null;

    const state = {
        screen: "loading",
        mode: "practice",
        label: "",
        questions: [],
        currentIndex: 0,
        answers: {},
        timeSpent: {},
        checked: false,
        showAnswer: false,
        elapsed: 0,
        timeRemaining: 0,
        timer: null,
        draggedOptId: null,
        sourceSlotId: null,
        sessionSaved: false,
        summary: null,
        historyRecord: null,
        loadError: ""
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatTime(seconds) {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
        const remainder = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
        return `${minutes}:${remainder}`;
    }

    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
    }

    function shuffle(items) {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
        }
        return copy;
    }

    function getQuestionCategory(question) {
        return question?.categories?.[0] || "verb-collocation";
    }

    function getCategoryQuestions(categoryId, source = uniqueDatabase) {
        return source.filter(question => getQuestionCategory(question) === categoryId);
    }

    function getBlanks(question) {
        return question.structure.filter(part => part.type === "blank");
    }

    function isQuestionCorrect(question, answerMap) {
        const blanks = getBlanks(question);
        if (!answerMap || Object.keys(answerMap).length !== blanks.length) return false;
        return blanks.every(blank => {
            const chosen = question.options.find(option => option.id === answerMap[blank.id]);
            const expected = question.options.find(option => option.id === question.correctAnswers[blank.id]);
            return Boolean(chosen && expected && chosen.text === expected.text);
        });
    }

    function isQuestionAttempted(question, answerMap, seconds = 0) {
        return Object.keys(answerMap || {}).length > 0 || seconds > 0;
    }

    function categoryBadge(question) {
        const category = CATEGORY_CONFIG[getQuestionCategory(question)];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold ${category.badge}">${category.label}</span>`;
    }

    function updateHeaderStatus() {
        if (!headerStatusEl) return;
        if (!sentenceBankMeta) {
            headerStatusEl.textContent = state.loadError ? "题库加载失败" : "正在加载题库";
            return;
        }
        if (state.screen === "practice" && state.questions.length) {
            headerStatusEl.textContent = `${state.currentIndex + 1} / ${state.questions.length} · ${state.label}`;
            return;
        }
        headerStatusEl.textContent = `${sentenceBankMeta.stats.unique} 道去重题 · ${sentenceBankMeta.stats.modules} 套考题`;
    }

    async function initialize() {
        state.screen = "loading";
        render();
        try {
            const manifestResponse = await fetch("./sentence_qb/manifest.json?v=3", { cache: "no-cache" });
            if (!manifestResponse.ok) throw new Error(`题库清单请求失败 (${manifestResponse.status})`);
            const manifest = await manifestResponse.json();
            const chunks = await Promise.all((manifest.files || []).map(async fileInfo => {
                const response = await fetch(`./sentence_qb/${fileInfo.file}?v=${manifest.version}`, { cache: "no-cache" });
                if (!response.ok) throw new Error(`${fileInfo.file} 请求失败 (${response.status})`);
                return response.json();
            }));

            sentenceBankMeta = manifest;
            fullDatabase = chunks.flatMap(chunk => chunk.questions || []);
            moduleNames = manifest.moduleNames || [...new Set(fullDatabase.map(question => question.moduleId))];
            const uniqueMap = new Map();
            fullDatabase.forEach(question => {
                const key = question.duplicateKey || `${question.topText}|||${question.sen2Str}`;
                if (!uniqueMap.has(key)) uniqueMap.set(key, question);
            });
            uniqueDatabase = [...uniqueMap.values()];
            state.screen = "hub";
            render();
        } catch (error) {
            console.error("句子题库加载失败", error);
            state.loadError = error instanceof Error ? error.message : "未知错误";
            state.screen = "error";
            render();
        }
    }

    function renderLoading() {
        return `
            <section class="sentence-view flex items-center justify-center p-6 bg-[#f8fafc]">
                <div class="text-center">
                    <div class="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg font-black text-xl">T</div>
                    <h1 class="text-2xl font-black text-slate-900 mb-2">正在准备句子组合题库</h1>
                    <p class="text-sm font-medium text-slate-500">正在载入四类专项与答案校验结果</p>
                </div>
            </section>`;
    }

    function renderError() {
        return `
            <section class="sentence-view flex items-center justify-center p-6 bg-[#f8fafc]">
                <div class="w-full max-w-lg bg-white border border-red-200 rounded-3xl p-8 shadow-sm text-center">
                    <div class="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5 font-black">!</div>
                    <h1 class="text-2xl font-black text-slate-900 mb-2">题库暂时没有载入</h1>
                    <p class="text-sm text-slate-500 mb-6">${escapeHtml(state.loadError)}</p>
                    <button type="button" onclick="SentenceApp.retry()" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm">重新载入</button>
                </div>
            </section>`;
    }

    function renderHub() {
        const categoryCards = Object.entries(CATEGORY_CONFIG).map(([categoryId, category]) => {
            const count = getCategoryQuestions(categoryId).length;
            return `
                <button type="button" onclick="SentenceApp.startCategory('${categoryId}')" class="sentence-card ${category.card} border rounded-3xl p-6 md:p-7 text-left min-h-[220px] flex flex-col justify-between shadow-sm group">
                    <span>
                        <span class="inline-flex w-11 h-11 bg-white/80 rounded-2xl items-center justify-center ${category.text} font-black shadow-sm mb-5">${String(count).slice(0, 1)}</span>
                        <span class="block text-2xl font-black ${category.text} mb-1">${category.label}</span>
                        <span class="block text-sm font-semibold ${category.muted}">${category.english}</span>
                    </span>
                    <span class="flex items-end justify-between gap-3 mt-6">
                        <span>
                            <span class="block text-xs font-bold ${category.muted} mb-1">${category.description}</span>
                            <span class="inline-flex bg-white/70 px-3 py-1.5 rounded-lg text-xs font-black ${category.text}">${count} 道去重题</span>
                        </span>
                        <span class="w-9 h-9 rounded-full bg-white/80 ${category.text} flex items-center justify-center font-black group-hover:translate-x-1 transition-transform">→</span>
                    </span>
                </button>`;
        }).join("");

        return `
            <section class="sentence-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
                <div class="max-w-[1400px] mx-auto pb-12">
                    <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
                        <div>
                            <div class="flex items-center gap-3 mb-3">
                                <span class="bg-teal-100 text-teal-700 border border-teal-200 px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider">Writing</span>
                                <span class="text-sm font-bold text-slate-400">Build a Sentence</span>
                            </div>
                            <h1 class="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">句子组合专项</h1>
                            <p class="text-slate-500 font-medium max-w-2xl leading-relaxed">选择一个语法方向开始练习。词块每题重新打乱，只有整句话完全正确才得 1 分。</p>
                        </div>
                        <div class="grid grid-cols-3 gap-3 shrink-0">
                            <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-center shadow-sm">
                                <div class="text-xl font-black text-slate-900">${sentenceBankMeta.stats.unique}</div>
                                <div class="text-[10px] font-bold text-slate-400">去重题</div>
                            </div>
                            <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-center shadow-sm">
                                <div class="text-xl font-black text-blue-600">${sentenceBankMeta.stats.total}</div>
                                <div class="text-[10px] font-bold text-slate-400">原始题</div>
                            </div>
                            <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-center shadow-sm">
                                <div class="text-xl font-black text-purple-600">${sentenceBankMeta.stats.modules}</div>
                                <div class="text-[10px] font-bold text-slate-400">考试套题</div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
                        ${categoryCards}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <button type="button" onclick="SentenceApp.startAll('random')" class="sentence-card bg-white border border-slate-200 rounded-2xl p-5 text-left shadow-sm flex items-center justify-between gap-4">
                            <span><span class="block font-black text-slate-900">全库乱序练习</span><span class="block text-xs font-medium text-slate-500 mt-1">${uniqueDatabase.length} 道去重题随机训练</span></span>
                            <span class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">↻</span>
                        </button>
                        <button type="button" onclick="SentenceApp.showCalendar()" class="sentence-card bg-white border border-slate-200 rounded-2xl p-5 text-left shadow-sm flex items-center justify-between gap-4">
                            <span><span class="block font-black text-slate-900">按考试日期模考</span><span class="block text-xs font-medium text-slate-500 mt-1">按原套题顺序限时完成</span></span>
                            <span class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">◷</span>
                        </button>
                        <button type="button" onclick="SentenceApp.showHistory()" class="sentence-card bg-slate-900 border border-slate-900 rounded-2xl p-5 text-left shadow-sm flex items-center justify-between gap-4 text-white">
                            <span><span class="block font-black">做题记录</span><span class="block text-xs font-medium text-slate-400 mt-1">查看分数并重做错题</span></span>
                            <span class="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center font-black">→</span>
                        </button>
                    </div>
                </div>
            </section>`;
    }

    function moduleSortValue(moduleId) {
        const match = String(moduleId).match(/(\d{4})\.(\d+)\.(\d+)([A-Za-z]*)/);
        if (!match) return 0;
        const suffix = match[4] ? match[4].toUpperCase().charCodeAt(0) - 64 : 0;
        return Number(match[1]) * 1000000 + Number(match[2]) * 10000 + Number(match[3]) * 100 + suffix;
    }

    function renderCalendar() {
        const groups = new Map();
        [...moduleNames].sort((left, right) => moduleSortValue(right) - moduleSortValue(left)).forEach(moduleId => {
            const parts = moduleId.split(".");
            const group = parts.length >= 2 ? `${parts[0]} 年 ${parts[1]} 月` : "其他日期";
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(moduleId);
        });

        const groupHtml = [...groups.entries()].map(([group, modules]) => `
            <section class="mb-8">
                <h2 class="text-sm font-black text-slate-500 uppercase tracking-wider mb-3">${escapeHtml(group)}</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    ${modules.map(moduleId => {
                        const count = fullDatabase.filter(question => question.moduleId === moduleId).length;
                        return `<button type="button" onclick="SentenceApp.startMock('${escapeHtml(moduleId)}')" class="sentence-card bg-white border border-slate-200 rounded-2xl px-4 py-5 text-center shadow-sm hover:border-purple-300">
                            <span class="block text-base font-black text-slate-900">${escapeHtml(moduleId)}</span>
                            <span class="block text-xs font-bold text-slate-400 mt-1">${count} 题 · 06:50</span>
                        </button>`;
                    }).join("")}
                </div>
            </section>`).join("");

        return `
            <section class="sentence-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
                <div class="max-w-6xl mx-auto pb-12">
                    <div class="flex items-end justify-between gap-4 mb-8">
                        <div>
                            <button type="button" onclick="SentenceApp.goHome()" class="text-sm font-bold text-slate-500 hover:text-blue-600 mb-4">← 返回专项首页</button>
                            <h1 class="text-3xl font-black text-slate-900">按考试日期模考</h1>
                            <p class="text-sm font-medium text-slate-500 mt-2">每套题按原始顺序作答，限时 6 分 50 秒，交卷后统一判分。</p>
                        </div>
                    </div>
                    ${groupHtml}
                </div>
            </section>`;
    }

    function startSession(questions, options = {}) {
        stopTimer();
        state.mode = options.mode || "practice";
        state.label = options.label || "综合练习";
        state.questions = questions.map(question => ({
            ...question,
            displayOptions: shuffle(question.options)
        }));
        state.currentIndex = 0;
        state.answers = {};
        state.timeSpent = {};
        state.questions.forEach(question => {
            state.answers[question.id] = {};
            state.timeSpent[question.id] = 0;
        });
        state.checked = false;
        state.showAnswer = false;
        state.elapsed = 0;
        state.timeRemaining = options.time || 0;
        state.sessionSaved = false;
        state.summary = null;
        state.screen = "practice";
        startTimer();
        render();
    }

    function startTimer() {
        stopTimer();
        state.timer = setInterval(() => {
            if (state.screen !== "practice" || !state.questions.length) return;
            const question = state.questions[state.currentIndex];
            state.timeSpent[question.id] = (state.timeSpent[question.id] || 0) + 1;
            state.elapsed += 1;
            if (state.mode === "mock") {
                state.timeRemaining -= 1;
                if (state.timeRemaining <= 0) {
                    state.timeRemaining = 0;
                    finishSession();
                    return;
                }
            }
            const timerEl = document.getElementById("sentence-timer");
            if (timerEl) timerEl.textContent = formatTime(state.mode === "mock" ? state.timeRemaining : state.timeSpent[question.id]);
        }, 1000);
    }

    function stopTimer() {
        if (state.timer) clearInterval(state.timer);
        state.timer = null;
    }

    function renderQueue() {
        const items = state.questions.map((question, index) => {
            const answerCount = Object.keys(state.answers[question.id] || {}).length;
            const blankCount = getBlanks(question).length;
            const complete = answerCount === blankCount;
            const active = index === state.currentIndex;
            return `
                <button type="button" onclick="SentenceApp.goToQuestion(${index})" class="sentence-queue-item ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}">
                    <span class="font-black">${index + 1}</span>
                    <span class="truncate">${escapeHtml(question.moduleId)} · ${escapeHtml(question.qNum.toUpperCase())}</span>
                    <span class="queue-state">${complete ? "✓" : answerCount || "–"}</span>
                </button>`;
        }).join("");
        return `
            <aside class="sentence-queue">
                <div class="p-4 border-b border-slate-200 bg-white">
                    <h2 class="font-bold text-slate-800 text-sm mb-1">当前任务队列</h2>
                    <p class="text-xs text-slate-500">${escapeHtml(state.label)} · 共 ${state.questions.length} 题</p>
                </div>
                <div class="sentence-queue-list">${items}</div>
            </aside>`;
    }

    function renderSentenceParts(question) {
        const answerMap = state.answers[question.id] || {};
        return question.structure.map((part, structureIndex) => {
            if (part.type === "static") return `<span>${escapeHtml(part.text)}</span>`;
            const selectedId = answerMap[part.id];
            if (!selectedId) {
                return `<span class="sentence-blank" aria-label="待填写空位" ondragover="event.preventDefault()" ondrop="SentenceApp.dropOnSlot(event, '${part.id}')">blank</span>`;
            }
            const option = question.options.find(candidate => candidate.id === selectedId);
            if (!option) return `<span class="sentence-blank">blank</span>`;
            const expected = question.options.find(candidate => candidate.id === question.correctAnswers[part.id]);
            const slotCorrect = option.text === expected?.text;
            const statusClass = state.checked ? (slotCorrect ? "is-correct" : "is-wrong") : "";
            let text = option.text;
            if (structureIndex === 0) text = text.charAt(0).toUpperCase() + text.slice(1);
            return `<button type="button" class="sentence-fragment ${statusClass}" aria-label="撤回词块 ${escapeHtml(text)}" draggable="true" onclick="SentenceApp.removeWord('${part.id}')" ondragstart="SentenceApp.dragStart(event, '${option.id}', '${part.id}')" ondragend="SentenceApp.dragEnd(event)" ondragover="event.preventDefault()" ondrop="SentenceApp.dropOnSlot(event, '${part.id}')">${escapeHtml(text)}</button>`;
        }).join("");
    }

    function renderWordPool(question) {
        const answerMap = state.answers[question.id] || {};
        const used = new Set(Object.values(answerMap));
        return (question.displayOptions || question.options).map(option => {
            const disabled = used.has(option.id);
            return `<button type="button" class="word-tile" ${disabled ? "disabled" : ""} draggable="${disabled ? "false" : "true"}" onclick="SentenceApp.placeWord('${option.id}')" ondragstart="SentenceApp.dragStart(event, '${option.id}')" ondragend="SentenceApp.dragEnd(event)">${escapeHtml(option.text)}</button>`;
        }).join("");
    }

    function renderFeedback(question) {
        if (state.checked) {
            const correct = isQuestionCorrect(question, state.answers[question.id]);
            return `
                <div class="mt-6 rounded-2xl border p-5 ${correct ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}" role="status">
                    <div class="font-black ${correct ? "text-green-700" : "text-red-700"}">${correct ? "整句正确 · 本题 1 分" : "整句错误 · 本题 0 分"}</div>
                    <p class="text-sm font-medium ${correct ? "text-green-700/80" : "text-red-700/80"} mt-1">${correct ? "所有词块顺序都与标准答案一致。" : "任意一个词块顺序错误或空缺，整题即判错。"}</p>
                    ${correct ? "" : `<div class="mt-4 pt-4 border-t border-red-200"><span class="text-xs font-black text-red-500 uppercase tracking-wider">Correct Answer</span><p class="text-base font-bold text-slate-800 mt-2 leading-relaxed">${escapeHtml(question.ans)}</p></div>`}
                </div>`;
        }
        if (state.showAnswer) {
            return `
                <div class="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <span class="text-xs font-black text-blue-500 uppercase tracking-wider">Correct Answer</span>
                    <p class="text-base font-bold text-slate-800 mt-2 leading-relaxed">${escapeHtml(question.ans)}</p>
                </div>`;
        }
        return "";
    }

    function renderPractice() {
        const question = state.questions[state.currentIndex];
        const category = CATEGORY_CONFIG[getQuestionCategory(question)];
        const answerCount = Object.keys(state.answers[question.id] || {}).length;
        const blankCount = getBlanks(question).length;
        const timerValue = state.mode === "mock" ? state.timeRemaining : state.timeSpent[question.id];
        const mockHeader = state.mode === "mock" ? `
            <div class="h-14 bg-slate-900 border-b border-slate-800 px-5 md:px-6 flex items-center justify-between shrink-0 text-white">
                <div class="flex items-center gap-3"><span class="bg-purple-600 px-2 py-1 rounded text-xs font-black uppercase tracking-wider">Mock Exam</span><span class="text-sm font-semibold text-slate-300">Question ${state.currentIndex + 1} of ${state.questions.length}</span></div>
                <div id="sentence-timer" class="font-mono text-lg font-black tracking-widest text-emerald-400">${formatTime(timerValue)}</div>
            </div>` : "";

        const resultText = state.checked
            ? (isQuestionCorrect(question, state.answers[question.id]) ? "整句正确 · 1 分" : "整句错误 · 0 分")
            : `${answerCount} / ${blankCount} 个空位已填`;

        return `
            <section class="sentence-view overflow-hidden">
                <div class="sentence-workspace">
                    ${renderQueue()}
                    <div class="sentence-main">
                        ${mockHeader}
                        <div class="sentence-scroll">
                            <div class="w-full max-w-4xl mx-auto">
                                <div class="mb-6 pb-6 border-b border-slate-100 flex items-start justify-between gap-4">
                                    <div>
                                        <div class="flex flex-wrap items-center gap-2 mb-3">
                                            ${categoryBadge(question)}
                                            <span class="inline-flex items-center px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-slate-600 text-xs font-bold">考频 ${question.frequency || 1}</span>
                                            <span class="text-xs font-bold text-slate-400">${escapeHtml(question.moduleId)} · ${escapeHtml(question.qNum.toUpperCase())}</span>
                                        </div>
                                        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Make an appropriate sentence.</h1>
                                    </div>
                                    ${state.mode === "practice" ? `<div class="hidden sm:block text-right"><div class="text-xs font-bold text-slate-400">本题用时</div><div id="sentence-timer" class="font-mono font-black text-slate-700 mt-1">${formatTime(timerValue)}</div></div>` : ""}
                                </div>

                                <div class="mb-7 font-semibold text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                                    <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-black shrink-0">i</span>
                                    <span class="text-sm leading-relaxed">点击下方词块会依次填入空位；点击已填词块可撤回。整句话必须完全正确才得分。</span>
                                </div>

                                <div class="dialogue-panel">
                                    <div class="dialogue-row">
                                        <span class="speaker-badge bg-emerald-100 text-emerald-700">A</span>
                                        <p class="sentence-line font-semibold pt-1">${escapeHtml(question.topText)}</p>
                                    </div>
                                    <div class="dialogue-row">
                                        <span class="speaker-badge bg-blue-100 text-blue-700">B</span>
                                        <div class="sentence-line pt-1">${renderSentenceParts(question)}</div>
                                    </div>
                                </div>

                                <div class="mt-8">
                                    <div class="flex items-center justify-between gap-4 mb-3">
                                        <h2 class="text-xs font-black text-slate-400 uppercase tracking-wider">可选词块</h2>
                                        <span class="text-xs font-bold ${category.muted}">${escapeHtml(category.english)}</span>
                                    </div>
                                    <div class="word-pool" ondragover="event.preventDefault()" ondrop="SentenceApp.dropOnPool(event)">${renderWordPool(question)}</div>
                                </div>
                                ${renderFeedback(question)}
                            </div>
                        </div>

                        <div class="sentence-action-bar">
                            <div class="text-sm font-bold ${state.checked ? (isQuestionCorrect(question, state.answers[question.id]) ? "text-green-600" : "text-red-600") : "text-slate-500"}">${resultText}</div>
                            <div class="sentence-actions">
                                <button type="button" onclick="SentenceApp.resetCurrent()" class="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Reset</button>
                                ${state.mode === "practice" ? `<button type="button" onclick="SentenceApp.toggleAnswer()" class="px-4 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100">${state.showAnswer ? "Hide Answer" : "Show Answer"}</button><button type="button" onclick="SentenceApp.checkCurrent()" class="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">Check</button>` : ""}
                                <button type="button" onclick="SentenceApp.goPrevious()" ${state.currentIndex === 0 ? "disabled" : ""} class="px-4 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                                <button type="button" onclick="SentenceApp.goNext()" class="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 border border-slate-900 rounded-lg hover:bg-slate-800 shadow-sm">${state.currentIndex === state.questions.length - 1 ? (state.mode === "mock" ? "交卷" : "完成") : "Next →"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>`;
    }

    function loadHistory() {
        try {
            const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function writeHistory(records) {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 50)));
        } catch (error) {
            console.warn("保存做题记录失败", error);
            showToast("浏览器存储空间不足，本次成绩未保存");
        }
    }

    function buildSessionRecord() {
        const attempted = state.questions.filter(question => isQuestionAttempted(question, state.answers[question.id], state.timeSpent[question.id]));
        if (!attempted.length) return null;
        const score = attempted.filter(question => isQuestionCorrect(question, state.answers[question.id])).length;
        return {
            id: Date.now(),
            dateStr: new Date().toLocaleString(),
            mode: state.mode,
            label: state.label,
            moduleId: state.mode === "mock" ? attempted[0].moduleId : state.label,
            total: attempted.length,
            score,
            timeSpent: state.elapsed,
            questions: attempted,
            answers: Object.fromEntries(attempted.map(question => [question.id, { ...(state.answers[question.id] || {}) }])),
            timeSpentPerQ: Object.fromEntries(attempted.map(question => [question.id, state.timeSpent[question.id] || 0]))
        };
    }

    function saveCurrentSession() {
        if (state.sessionSaved) return state.summary;
        const record = buildSessionRecord();
        if (record) {
            const history = loadHistory();
            history.unshift(record);
            writeHistory(history);
        }
        state.sessionSaved = true;
        state.summary = record;
        return record;
    }

    function renderSummary() {
        const record = state.summary;
        const wrongQuestions = record ? record.questions.filter(question => !isQuestionCorrect(question, record.answers[question.id])) : [];
        const percent = record?.total ? Math.round(record.score / record.total * 100) : 0;
        return `
            <section class="sentence-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
                <div class="max-w-3xl mx-auto pb-12">
                    <div class="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                        <div class="p-8 md:p-10 text-center border-b border-slate-100">
                            <div class="w-16 h-16 rounded-2xl ${percent >= 80 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"} flex items-center justify-center mx-auto mb-5 text-xl font-black">${percent}%</div>
                            <p class="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">${escapeHtml(state.label)}</p>
                            <h1 class="text-3xl font-black text-slate-900 mb-3">${record ? `${record.score} / ${record.total} 分` : "本次没有作答"}</h1>
                            <p class="text-sm font-medium text-slate-500">${record ? `用时 ${formatTime(record.timeSpent)} · ${wrongQuestions.length} 道错题` : "返回专项首页选择一组题目重新开始。"}</p>
                        </div>
                        ${record ? `
                            <div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                                <div class="p-5 text-center"><div class="text-2xl font-black text-green-600">${record.score}</div><div class="text-xs font-bold text-slate-400 mt-1">正确</div></div>
                                <div class="p-5 text-center"><div class="text-2xl font-black text-red-500">${wrongQuestions.length}</div><div class="text-xs font-bold text-slate-400 mt-1">错误</div></div>
                                <div class="p-5 text-center"><div class="text-2xl font-black text-slate-800">${record.total}</div><div class="text-xs font-bold text-slate-400 mt-1">已作答</div></div>
                            </div>` : ""}
                        <div class="p-6 flex flex-col sm:flex-row gap-3 justify-center">
                            <button type="button" onclick="SentenceApp.goHome()" class="px-6 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">返回专项首页</button>
                            ${wrongQuestions.length ? `<button type="button" onclick="SentenceApp.redoSummaryWrong()" class="px-6 py-3 text-sm font-bold text-white bg-orange-500 border border-orange-500 rounded-xl hover:bg-orange-600 shadow-sm">重做 ${wrongQuestions.length} 道错题</button>` : ""}
                            <button type="button" onclick="SentenceApp.showHistory()" class="px-6 py-3 text-sm font-bold text-white bg-slate-900 border border-slate-900 rounded-xl hover:bg-slate-800 shadow-sm">查看做题记录</button>
                        </div>
                    </div>
                </div>
            </section>`;
    }

    function renderHistory() {
        const history = loadHistory();
        const cards = history.length ? history.map(record => {
            const modeLabel = record.mode === "mock" ? "模考" : "练习";
            const label = record.label || record.moduleId || "综合练习";
            return `
                <button type="button" onclick="SentenceApp.openHistory('${record.id}')" class="w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition text-left flex items-center justify-between gap-5">
                    <span class="min-w-0">
                        <span class="flex items-center gap-2 mb-2"><span class="px-2 py-1 rounded-md text-[10px] font-black ${record.mode === "mock" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}">${modeLabel}</span><span class="text-sm font-black text-slate-800 truncate">${escapeHtml(label)}</span></span>
                        <span class="block text-xs font-medium text-slate-400">${escapeHtml(record.dateStr || "未知时间")} · 用时 ${formatTime(record.timeSpent || 0)}</span>
                    </span>
                    <span class="shrink-0 text-right"><span class="block text-xl font-black ${record.score === record.total ? "text-green-600" : "text-slate-900"}">${record.score} / ${record.total}</span><span class="block text-xs font-bold text-slate-400 mt-1">查看详情 →</span></span>
                </button>`;
        }).join("") : `<div class="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-medium">还没有句子组合做题记录</div>`;

        return `
            <section class="sentence-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
                <div class="max-w-4xl mx-auto pb-12">
                    <button type="button" onclick="SentenceApp.goHome()" class="text-sm font-bold text-slate-500 hover:text-blue-600 mb-4">← 返回专项首页</button>
                    <div class="flex items-end justify-between gap-4 mb-8">
                        <div><h1 class="text-3xl font-black text-slate-900">句子组合做题记录</h1><p class="text-sm font-medium text-slate-500 mt-2">成绩按整句 0 / 1 分规则计算，并保存在当前浏览器。</p></div>
                        <span class="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-700 shadow-sm">${history.length} 次</span>
                    </div>
                    <div class="space-y-3">${cards}</div>
                </div>
            </section>`;
    }

    function buildHistorySentence(question, answerMap) {
        return question.structure.map(part => {
            if (part.type === "static") return `<span>${escapeHtml(part.text)}</span>`;
            const selected = question.options.find(option => option.id === answerMap?.[part.id]);
            const expected = question.options.find(option => option.id === question.correctAnswers[part.id]);
            if (!selected) return `<span class="inline-block min-w-16 border-b-2 border-red-300">&nbsp;</span>`;
            const correct = selected.text === expected?.text;
            return `<strong class="${correct ? "text-green-600" : "text-red-600 line-through"}">${escapeHtml(selected.text)}</strong>`;
        }).join("");
    }

    function renderHistoryDetail() {
        const record = state.historyRecord;
        if (!record) return renderHistory();
        const wrongQuestions = record.questions.filter(question => !isQuestionCorrect(question, record.answers[question.id]));
        const items = record.questions.map((question, index) => {
            const correct = isQuestionCorrect(question, record.answers[question.id]);
            return `
                <details class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" ${!correct ? "open" : ""}>
                    <summary class="p-5 cursor-pointer flex items-center justify-between gap-4 list-none">
                        <span class="min-w-0"><span class="text-xs font-black text-slate-400">QUESTION ${index + 1} · ${escapeHtml(question.moduleId)}</span><span class="block font-bold text-slate-800 mt-1 truncate">${escapeHtml(question.topText)}</span></span>
                        <span class="px-2.5 py-1 rounded-md text-xs font-black ${correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}">${correct ? "正确 · 1" : "错误 · 0"}</span>
                    </summary>
                    <div class="px-5 pb-5 border-t border-slate-100 pt-4">
                        <div class="text-base leading-loose text-slate-700">${buildHistorySentence(question, record.answers[question.id])}</div>
                        ${correct ? "" : `<div class="mt-4 p-4 rounded-xl bg-green-50 border border-green-100"><div class="text-[10px] font-black text-green-600 uppercase tracking-wider">Correct Answer</div><div class="text-sm font-bold text-slate-800 mt-2">${escapeHtml(question.ans)}</div></div>`}
                    </div>
                </details>`;
        }).join("");

        return `
            <section class="sentence-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
                <div class="max-w-4xl mx-auto pb-12">
                    <button type="button" onclick="SentenceApp.showHistory()" class="text-sm font-bold text-slate-500 hover:text-blue-600 mb-4">← 返回记录列表</button>
                    <div class="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                        <div><p class="text-xs font-black text-slate-400 mb-2">${escapeHtml(record.dateStr || "")}</p><h1 class="text-2xl font-black text-slate-900">${escapeHtml(record.label || record.moduleId || "综合练习")}</h1><p class="text-sm font-medium text-slate-500 mt-2">用时 ${formatTime(record.timeSpent || 0)} · ${wrongQuestions.length} 道错题</p></div>
                        <div class="text-left sm:text-right"><div class="text-4xl font-black text-slate-900">${record.score} / ${record.total}</div>${wrongQuestions.length ? `<button type="button" onclick="SentenceApp.redoHistoryWrong()" class="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg">重做错题</button>` : ""}</div>
                    </div>
                    <div class="space-y-3">${items}</div>
                </div>
            </section>`;
    }

    function render() {
        updateHeaderStatus();
        if (!appEl) return;
        if (state.screen === "loading") appEl.innerHTML = renderLoading();
        else if (state.screen === "error") appEl.innerHTML = renderError();
        else if (state.screen === "hub") appEl.innerHTML = renderHub();
        else if (state.screen === "calendar") appEl.innerHTML = renderCalendar();
        else if (state.screen === "practice") appEl.innerHTML = renderPractice();
        else if (state.screen === "summary") appEl.innerHTML = renderSummary();
        else if (state.screen === "history") appEl.innerHTML = renderHistory();
        else if (state.screen === "history-detail") appEl.innerHTML = renderHistoryDetail();
    }

    function markAnswerChanged() {
        state.checked = false;
        state.showAnswer = false;
        render();
    }

    function placeWord(optionId) {
        const question = state.questions[state.currentIndex];
        const answerMap = state.answers[question.id];
        if (Object.values(answerMap).includes(optionId)) return;
        const emptyBlank = getBlanks(question).find(blank => !answerMap[blank.id]);
        if (!emptyBlank) return showToast("所有空位都已填满，可点击已填词块撤回");
        answerMap[emptyBlank.id] = optionId;
        markAnswerChanged();
    }

    function removeWord(blankId) {
        const question = state.questions[state.currentIndex];
        delete state.answers[question.id][blankId];
        markAnswerChanged();
    }

    function dragStart(event, optionId, sourceSlotId = null) {
        state.draggedOptId = optionId;
        state.sourceSlotId = sourceSlotId;
        event.dataTransfer?.setData("text/plain", optionId);
        event.currentTarget.classList.add("dragging");
    }

    function dragEnd(event) {
        event.currentTarget.classList.remove("dragging");
        state.draggedOptId = null;
        state.sourceSlotId = null;
    }

    function dropOnSlot(event, targetSlotId) {
        event.preventDefault();
        if (!state.draggedOptId) return;
        const question = state.questions[state.currentIndex];
        const answerMap = state.answers[question.id];
        const existing = answerMap[targetSlotId];
        if (state.sourceSlotId) {
            if (existing) answerMap[state.sourceSlotId] = existing;
            else delete answerMap[state.sourceSlotId];
        }
        answerMap[targetSlotId] = state.draggedOptId;
        state.draggedOptId = null;
        state.sourceSlotId = null;
        markAnswerChanged();
    }

    function dropOnPool(event) {
        event.preventDefault();
        if (!state.sourceSlotId) return;
        const question = state.questions[state.currentIndex];
        delete state.answers[question.id][state.sourceSlotId];
        state.draggedOptId = null;
        state.sourceSlotId = null;
        markAnswerChanged();
    }

    function goToQuestion(index) {
        if (index < 0 || index >= state.questions.length) return;
        state.currentIndex = index;
        state.checked = false;
        state.showAnswer = false;
        render();
    }

    function goNext() {
        if (state.currentIndex >= state.questions.length - 1) {
            finishSession();
            return;
        }
        goToQuestion(state.currentIndex + 1);
    }

    function goPrevious() {
        goToQuestion(state.currentIndex - 1);
    }

    function resetCurrent() {
        const question = state.questions[state.currentIndex];
        state.answers[question.id] = {};
        state.checked = false;
        state.showAnswer = false;
        render();
    }

    function checkCurrent() {
        state.checked = true;
        state.showAnswer = false;
        render();
    }

    function toggleAnswer() {
        state.showAnswer = !state.showAnswer;
        state.checked = false;
        render();
    }

    function finishSession() {
        stopTimer();
        saveCurrentSession();
        state.screen = "summary";
        render();
    }

    function goHome() {
        if (state.screen === "practice") saveCurrentSession();
        stopTimer();
        state.screen = sentenceBankMeta ? "hub" : "loading";
        state.historyRecord = null;
        render();
    }

    function showHistory() {
        if (state.screen === "practice") saveCurrentSession();
        stopTimer();
        state.historyRecord = null;
        state.screen = "history";
        render();
    }

    function openHistory(recordId) {
        state.historyRecord = loadHistory().find(record => String(record.id) === String(recordId)) || null;
        state.screen = state.historyRecord ? "history-detail" : "history";
        render();
    }

    function startCategory(categoryId) {
        const category = CATEGORY_CONFIG[categoryId];
        if (!category) return;
        startSession(shuffle(getCategoryQuestions(categoryId)), { mode: "practice", label: category.label });
    }

    function startAll(sortType) {
        const questions = [...uniqueDatabase];
        if (sortType === "random") questions.splice(0, questions.length, ...shuffle(questions));
        else questions.sort((left, right) => (right.frequency || 1) - (left.frequency || 1));
        startSession(questions, { mode: "practice", label: sortType === "random" ? "全库乱序" : "高频优先" });
    }

    function startMock(moduleId) {
        const questions = fullDatabase.filter(question => question.moduleId === moduleId);
        startSession(questions, { mode: "mock", label: `${moduleId} 模考`, time: 6 * 60 + 50 });
    }

    function redoSummaryWrong() {
        const record = state.summary;
        if (!record) return;
        const wrong = record.questions.filter(question => !isQuestionCorrect(question, record.answers[question.id]));
        startSession(wrong, { mode: "practice", label: "错题重做" });
    }

    function redoHistoryWrong() {
        const record = state.historyRecord;
        if (!record) return;
        const wrong = record.questions.filter(question => !isQuestionCorrect(question, record.answers[question.id]));
        startSession(wrong, { mode: "practice", label: "历史错题重做" });
    }

    window.SentenceApp = {
        retry: initialize,
        goHome,
        showCalendar() {
            stopTimer();
            state.screen = "calendar";
            render();
        },
        showHistory,
        openHistory,
        startCategory,
        startAll,
        startMock,
        placeWord,
        removeWord,
        dragStart,
        dragEnd,
        dropOnSlot,
        dropOnPool,
        goToQuestion,
        goNext,
        goPrevious,
        resetCurrent,
        checkCurrent,
        toggleAnswer,
        redoSummaryWrong,
        redoHistoryWrong,
        isQuestionCorrect
    };

    document.addEventListener("DOMContentLoaded", initialize);
})();
