(() => {
    "use strict";

    const appEl = document.getElementById("listening-app");
    const statusEl = document.getElementById("listening-header-status");
    const toastEl = document.getElementById("listening-toast");
    const audioEl = document.getElementById("listening-audio");
    const HISTORY_KEY = "toefl_listening_history_v1";

    let manifest = null;
    let toastTimer = null;
    let tickTimer = null;
    let loadedAudioQuestionId = null;

    const state = {
        screen: "loading",
        questions: [],
        currentIndex: 0,
        answers: {},
        checked: new Set(),
        played: new Set(),
        showTranscript: new Set(),
        timeSpent: {},
        elapsed: 0,
        summary: null,
        historyRecord: null,
        loadError: ""
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatTime(seconds) {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
        const remainder = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
        return `${minutes}:${remainder}`;
    }

    function currentQuestion() {
        return state.questions[state.currentIndex] || null;
    }

    function isCorrect(question, selectedIndex = state.answers[question?.id]) {
        return Number.isInteger(selectedIndex) && selectedIndex === question?.correctIndex;
    }

    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
    }

    function updateHeader() {
        if (!statusEl) return;
        if (!manifest) {
            statusEl.textContent = state.loadError ? "题库加载失败" : "正在加载题库";
            return;
        }
        if (state.screen === "practice") {
            statusEl.textContent = `${state.currentIndex + 1} / ${state.questions.length} · Listening`;
            return;
        }
        statusEl.textContent = `${manifest.questionCount} 道 · 专项练习`;
    }

    function stopTimer() {
        clearInterval(tickTimer);
        tickTimer = null;
    }

    function startTimer() {
        stopTimer();
        tickTimer = setInterval(() => {
            if (state.screen !== "practice") return;
            const question = currentQuestion();
            if (!question) return;
            state.elapsed += 1;
            state.timeSpent[question.id] = (state.timeSpent[question.id] || 0) + 1;
            const timerEl = document.getElementById("question-timer");
            if (timerEl) timerEl.textContent = formatTime(state.timeSpent[question.id]);
        }, 1000);
    }

    function pauseAudio() {
        if (!audioEl) return;
        audioEl.pause();
    }

    function loadCurrentAudio(force = false) {
        const question = currentQuestion();
        if (!question || !audioEl) return;
        if (!force && loadedAudioQuestionId === question.id) return;
        audioEl.pause();
        audioEl.src = `./listening_qb/${question.audio}?v=${manifest?.version || 1}`;
        audioEl.load();
        loadedAudioQuestionId = question.id;
        syncAudioControls();
    }

    function syncAudioControls() {
        if (!audioEl) return;
        const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
        const current = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
        const progressEl = document.getElementById("audio-progress");
        const timeEl = document.getElementById("audio-time");
        const playIconEl = document.getElementById("audio-play-icon");
        const playLabelEl = document.getElementById("audio-play-label");
        const playButtonEl = document.querySelector?.(".audio-play");
        const stopped = audioEl.paused || audioEl.ended;
        if (progressEl) progressEl.value = duration ? String(Math.round(current / duration * 1000)) : "0";
        if (timeEl) timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        if (playIconEl) playIconEl.textContent = stopped ? "play_arrow" : "pause";
        if (playLabelEl) playLabelEl.textContent = stopped ? "播放题目音频" : "暂停题目音频";
        if (playButtonEl) playButtonEl.setAttribute("aria-label", stopped ? "播放题目音频" : "暂停题目音频");
    }

    function queueState(question) {
        if (state.checked.has(question.id)) {
            return isCorrect(question) ? { label: "正确", className: "is-correct" } : { label: "错误", className: "is-wrong" };
        }
        if (Number.isInteger(state.answers[question.id])) return { label: "已选", className: "is-selected" };
        return { label: "未答", className: "" };
    }

    function renderQueue() {
        return state.questions.map((question, index) => {
            const result = queueState(question);
            return `<button type="button" class="listening-queue-item ${index === state.currentIndex ? "is-active" : ""}" onclick="ListeningApp.goToQuestion(${index})" aria-current="${index === state.currentIndex ? "true" : "false"}">
                <span class="text-center font-black">${index + 1}</span>
                <span class="truncate">Practice ${question.sourceSet.slice(-1)} · M${question.module} Q${question.sourceNumber}</span>
                <span class="queue-state ${result.className}">${result.label}</span>
            </button>`;
        }).join("");
    }

    function renderOptions(question) {
        const selectedIndex = state.answers[question.id];
        const checked = state.checked.has(question.id);
        const played = state.played.has(question.id);
        return question.choices.map((choice, index) => {
            const selected = selectedIndex === index;
            const correctChoice = checked && index === question.correctIndex;
            const wrongChoice = checked && selected && !correctChoice;
            const classes = [
                "response-option",
                selected ? "is-selected" : "",
                correctChoice ? "is-correct" : "",
                wrongChoice ? "is-wrong" : "",
                !played ? "is-disabled" : ""
            ].filter(Boolean).join(" ");
            let result = "";
            if (correctChoice) result = `<span class="option-result is-correct">正确回应</span>`;
            else if (wrongChoice) result = `<span class="option-result is-wrong">你的选择</span>`;
            return `<label class="${classes}">
                <input class="response-radio" type="radio" name="listening-answer" value="${index}" ${selected ? "checked" : ""} ${played ? "" : "disabled"} onchange="ListeningApp.selectAnswer(${index})">
                <span class="response-copy">${escapeHtml(choice)}</span>
                ${result}
            </label>`;
        }).join("");
    }

    function renderFeedback(question) {
        const checked = state.checked.has(question.id);
        const visible = state.showTranscript.has(question.id);
        if (!checked && !visible) return "";
        const correct = isCorrect(question);
        const feedback = checked ? `<div class="feedback-card ${correct ? "is-correct" : "is-wrong"}">
            <div class="flex items-start gap-3">
                <span class="material-symbols-rounded mt-0.5 ${correct ? "text-green-600" : "text-red-600"}" aria-hidden="true">${correct ? "check_circle" : "cancel"}</span>
                <div>
                    <div class="font-black ${correct ? "text-green-800" : "text-red-800"}">${correct ? "回答正确 · 本题 1 分" : "回答错误 · 本题 0 分"}</div>
                    <div class="mt-1 text-sm font-medium text-slate-600">${escapeHtml(question.explanation)}</div>
                </div>
            </div>
        </div>` : "";
        const transcript = visible ? `<div class="transcript-card">
            <div class="text-[10px] font-black uppercase tracking-wider text-sky-700">Audio Transcript</div>
            <div class="mt-2 text-base font-bold leading-relaxed text-slate-800"><span class="text-slate-400 mr-2">${escapeHtml(question.speaker)}:</span>${escapeHtml(question.promptTranscript)}</div>
            <div class="mt-3 pt-3 border-t border-sky-100 text-sm text-slate-600"><span class="font-black text-green-700">Best response:</span> ${escapeHtml(question.choices[question.correctIndex])}</div>
        </div>` : "";
        return feedback + transcript;
    }

    function renderPractice() {
        const question = currentQuestion();
        if (!question) return renderError("题库中没有可用题目。", false);
        const played = state.played.has(question.id);
        const checked = state.checked.has(question.id);
        const visible = state.showTranscript.has(question.id);
        const selected = state.answers[question.id];
        const actionStatus = checked
            ? (isCorrect(question) ? "本题正确 · 1 分" : "本题错误 · 0 分")
            : (Number.isInteger(selected) ? "已选择回应，等待检查" : (played ? "请选择一个最佳回应" : "请先播放题目音频"));
        const actionStatusClass = checked ? (isCorrect(question) ? "text-green-600" : "text-red-600") : "text-slate-500";

        return `<section class="listening-workspace">
            <aside class="listening-queue">
                <div class="p-5 border-b border-slate-200 bg-white">
                    <h2 class="text-base font-black text-slate-800">当前任务队列</h2>
                    <p class="text-xs font-medium text-slate-500 mt-1">Listening · 共 ${state.questions.length} 题</p>
                </div>
                <div class="listening-queue-list">${renderQueue()}</div>
            </aside>
            <div class="listening-main">
                <div class="listening-scroll">
                    <div class="listening-content">
                        <div class="question-heading-row flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
                            <div>
                                <div class="flex items-center gap-2 mb-3">
                                    <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-xs font-black text-cyan-700">听力</span>
                                    <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600">Practice ${escapeHtml(question.sourceSet.slice(-1))} · Module ${question.module} · Q${question.sourceNumber}</span>
                                </div>
                                <h1 class="listening-heading text-3xl md:text-4xl font-black tracking-tight text-slate-950">Choose the best response.</h1>
                            </div>
                            <div class="text-left lg:text-right">
                                <div class="text-[10px] font-black uppercase tracking-wider text-slate-400">本题用时</div>
                                <div id="question-timer" class="mt-1 text-xl font-black font-mono text-slate-700">${formatTime(state.timeSpent[question.id] || 0)}</div>
                            </div>
                        </div>

                        <div class="listening-instructions mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
                            <span class="material-symbols-rounded text-cyan-700 mt-0.5" aria-hidden="true">info</span>
                            <p class="text-sm font-semibold leading-relaxed text-slate-600">先播放一条简短问句或陈述，再从四个选项中选择最合适的回应。音频可以暂停、拖动和重复播放。</p>
                        </div>

                        <div class="question-stage">
                            <div class="speaker-panel">
                                <span class="speaker-label"><span class="material-symbols-rounded text-base" aria-hidden="true">record_voice_over</span>Speaker</span>
                                <img class="speaker-image" src="./listening_assets/speaker-woman.png" alt="正在说出听力题目的女性人物">
                            </div>
                            <div class="response-panel">
                                <div class="mb-4">
                                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Response Options</p>
                                    <p class="mt-1 text-sm font-semibold text-slate-500">${played ? "选择最自然、最符合语境的回应。" : "播放音频后即可选择答案。"}</p>
                                </div>
                                <div class="option-list">${renderOptions(question)}</div>
                                <div class="audio-card">
                                    <div class="audio-row">
                                        <button type="button" class="audio-play" onclick="ListeningApp.toggleAudio()" aria-label="${audioEl && !audioEl.paused && !audioEl.ended ? "暂停题目音频" : "播放题目音频"}">
                                            <span id="audio-play-icon" class="material-symbols-rounded text-2xl" aria-hidden="true">${audioEl && !audioEl.paused && !audioEl.ended ? "pause" : "play_arrow"}</span>
                                            <span id="audio-play-label" class="sr-only">${audioEl && !audioEl.paused && !audioEl.ended ? "暂停题目音频" : "播放题目音频"}</span>
                                        </button>
                                        <input id="audio-progress" class="audio-progress" type="range" min="0" max="1000" value="0" oninput="ListeningApp.seekAudio(this.value)" aria-label="音频播放进度">
                                        <span id="audio-time" class="audio-time">00:00 / 00:00</span>
                                    </div>
                                    <div class="volume-row">
                                        <span class="material-symbols-rounded text-lg text-slate-500" aria-hidden="true">volume_up</span>
                                        <input class="volume-slider" type="range" min="0" max="100" value="${Math.round((audioEl?.volume ?? 0.8) * 100)}" oninput="ListeningApp.setVolume(this.value)" aria-label="音频音量">
                                        <span class="audio-hint">一题一段音频 · 可重复播放</span>
                                    </div>
                                </div>
                                ${renderFeedback(question)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="listening-action-bar">
                    <div class="action-status min-w-0">
                        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400">Question ${state.currentIndex + 1} of ${state.questions.length}</div>
                        <div class="mt-1 text-sm font-black ${actionStatusClass}">${actionStatus}</div>
                    </div>
                    <div class="listening-actions">
                        <button type="button" onclick="ListeningApp.resetCurrent()" class="reset-action px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Reset</button>
                        <button type="button" onclick="ListeningApp.toggleTranscript()" ${played ? "" : "disabled"} class="transcript-action px-4 py-2.5 text-sm font-semibold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg hover:bg-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed">${visible ? "Hide Transcript" : "Show Transcript"}</button>
                        <button type="button" onclick="ListeningApp.checkCurrent()" ${played && Number.isInteger(selected) ? "" : "disabled"} class="px-5 py-2.5 text-sm font-bold text-white bg-cyan-700 border border-cyan-700 rounded-lg hover:bg-cyan-800 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">Check</button>
                        <button type="button" onclick="ListeningApp.goPrevious()" ${state.currentIndex === 0 ? "disabled" : ""} class="px-4 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                        <button type="button" onclick="ListeningApp.goNext()" class="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 border border-slate-900 rounded-lg hover:bg-slate-800 shadow-sm">${state.currentIndex === state.questions.length - 1 ? "完成" : "Next"}</button>
                    </div>
                </div>
            </div>
        </section>`;
    }

    function renderLoading() {
        return `<section class="listening-view bg-[#f8fafc] flex items-center justify-center p-6">
            <div class="bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm max-w-md">
                <span class="material-symbols-rounded text-4xl text-cyan-700" aria-hidden="true">headphones</span>
                <h1 class="mt-4 text-2xl font-black text-slate-900">正在加载听力题库</h1>
                <p class="mt-2 text-sm font-medium text-slate-500">正在准备逐题音频和回应选项。</p>
            </div>
        </section>`;
    }

    function renderError(message = state.loadError, showRetry = true) {
        return `<section class="listening-view bg-[#f8fafc] flex items-center justify-center p-6">
            <div class="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 text-center shadow-sm max-w-xl">
                <span class="material-symbols-rounded text-5xl text-slate-400" aria-hidden="true">lock</span>
                <h1 class="mt-4 text-2xl font-black text-slate-900">听力题库加载失败</h1>
                <p class="mt-3 text-sm leading-relaxed font-medium text-slate-500">${escapeHtml(message || "暂时无法读取题目和音频，请刷新页面后重试。")}</p>
                <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <a href="./index.html" class="px-5 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">返回大厅</a>
                    ${showRetry ? `<button type="button" onclick="ListeningApp.retry()" class="px-5 py-3 text-sm font-bold text-white bg-slate-900 border border-slate-900 rounded-xl hover:bg-slate-800">重新检测</button>` : ""}
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
            localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 40)));
        } catch (error) {
            console.warn("保存听力做题记录失败", error);
            showToast("浏览器存储空间不足，本次记录未保存");
        }
    }

    function buildRecord() {
        const attempted = state.questions.filter(question => Number.isInteger(state.answers[question.id]));
        if (!attempted.length) return null;
        const score = attempted.filter(question => isCorrect(question)).length;
        return {
            id: Date.now(),
            dateStr: new Date().toLocaleString(),
            label: "Listen and Choose a Best Response",
            total: attempted.length,
            score,
            timeSpent: state.elapsed,
            questions: attempted,
            answers: Object.fromEntries(attempted.map(question => [question.id, state.answers[question.id]])),
            timeSpentPerQ: Object.fromEntries(attempted.map(question => [question.id, state.timeSpent[question.id] || 0]))
        };
    }

    function saveSession() {
        const record = buildRecord();
        if (!record) return null;
        const history = loadHistory();
        history.unshift(record);
        writeHistory(history);
        return record;
    }

    function renderSummary() {
        const record = state.summary;
        const wrong = record ? record.total - record.score : 0;
        const percent = record?.total ? Math.round(record.score / record.total * 100) : 0;
        return `<section class="listening-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
            <div class="max-w-3xl mx-auto pb-12">
                <div class="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                    <div class="p-8 md:p-10 text-center border-b border-slate-100">
                        <div class="w-16 h-16 rounded-2xl ${percent >= 80 ? "bg-green-100 text-green-700" : "bg-cyan-100 text-cyan-700"} flex items-center justify-center mx-auto mb-5 text-xl font-black">${percent}%</div>
                        <p class="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Listening Practice</p>
                        <h1 class="text-3xl font-black text-slate-900 mb-3">${record ? `${record.score} / ${record.total} 分` : "本次没有作答"}</h1>
                        <p class="text-sm font-medium text-slate-500">${record ? `用时 ${formatTime(record.timeSpent)} · ${wrong} 道错题` : "重新开始后先播放音频，再选择最佳回应。"}</p>
                    </div>
                    ${record ? `<div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                        <div class="p-5 text-center"><div class="text-2xl font-black text-green-600">${record.score}</div><div class="text-xs font-bold text-slate-400 mt-1">正确</div></div>
                        <div class="p-5 text-center"><div class="text-2xl font-black text-red-500">${wrong}</div><div class="text-xs font-bold text-slate-400 mt-1">错误</div></div>
                        <div class="p-5 text-center"><div class="text-2xl font-black text-slate-800">${record.total}</div><div class="text-xs font-bold text-slate-400 mt-1">已作答</div></div>
                    </div>` : ""}
                    <div class="p-6 flex flex-col sm:flex-row gap-3 justify-center">
                        <button type="button" onclick="ListeningApp.restart()" class="px-6 py-3 text-sm font-bold text-white bg-cyan-700 border border-cyan-700 rounded-xl hover:bg-cyan-800 shadow-sm">重新练习</button>
                        <button type="button" onclick="ListeningApp.showHistory()" class="px-6 py-3 text-sm font-bold text-white bg-slate-900 border border-slate-900 rounded-xl hover:bg-slate-800 shadow-sm">查看做题记录</button>
                        <a href="./index.html" class="px-6 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">返回大厅</a>
                    </div>
                </div>
            </div>
        </section>`;
    }

    function renderHistory() {
        const history = loadHistory();
        const cards = history.length ? history.map(record => {
            const percent = record.total ? Math.round(record.score / record.total * 100) : 0;
            return `<button type="button" onclick="ListeningApp.openHistory('${record.id}')" class="w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-cyan-300 hover:shadow-md transition text-left flex items-center justify-between gap-5">
                <span class="min-w-0"><span class="block text-sm font-black text-slate-800 truncate">Listen and Choose</span><span class="block text-xs font-medium text-slate-400 mt-2">${escapeHtml(record.dateStr || "未知时间")} · 用时 ${formatTime(record.timeSpent || 0)}</span></span>
                <span class="shrink-0 text-right"><span class="block text-xl font-black ${percent === 100 ? "text-green-600" : "text-slate-900"}">${record.score} / ${record.total}</span><span class="block text-xs font-bold text-slate-400 mt-1">查看详情</span></span>
            </button>`;
        }).join("") : `<div class="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-medium">还没有听力练习记录</div>`;
        return `<section class="listening-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
            <div class="max-w-4xl mx-auto pb-12">
                <button type="button" onclick="ListeningApp.resumePractice()" class="text-sm font-bold text-slate-500 hover:text-cyan-700 mb-4">返回练习</button>
                <div class="flex items-end justify-between gap-4 mb-8">
                    <div><h1 class="text-3xl font-black text-slate-900">听力最佳回应做题记录</h1><p class="text-sm font-medium text-slate-500 mt-2">记录保存在当前浏览器，仅本机可见。</p></div>
                    <span class="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-700 shadow-sm">${history.length} 次</span>
                </div>
                <div class="space-y-3">${cards}</div>
            </div>
        </section>`;
    }

    function renderHistoryDetail() {
        const record = state.historyRecord;
        if (!record) return renderHistory();
        const items = record.questions.map((question, index) => {
            const selected = record.answers[question.id];
            const correct = selected === question.correctIndex;
            return `<details class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" ${correct ? "" : "open"}>
                <summary class="p-5 cursor-pointer flex items-center justify-between gap-4 list-none">
                    <span class="min-w-0"><span class="text-xs font-black text-slate-400">QUESTION ${index + 1} · Practice ${escapeHtml(question.sourceSet.slice(-1))} M${question.module}</span><span class="block font-bold text-slate-800 mt-1 truncate">${escapeHtml(question.promptTranscript)}</span></span>
                    <span class="px-2.5 py-1 rounded-md text-xs font-black ${correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}">${correct ? "正确 · 1" : "错误 · 0"}</span>
                </summary>
                <div class="px-5 pb-5 border-t border-slate-100 pt-4 text-sm leading-relaxed">
                    <p class="text-slate-500">你的选择：<strong class="${correct ? "text-green-700" : "text-red-700"}">${escapeHtml(question.choices[selected])}</strong></p>
                    ${correct ? "" : `<p class="mt-2 text-slate-500">正确回应：<strong class="text-green-700">${escapeHtml(question.choices[question.correctIndex])}</strong></p>`}
                    <p class="mt-3 text-slate-600">${escapeHtml(question.explanation)}</p>
                </div>
            </details>`;
        }).join("");
        return `<section class="listening-view bg-[#f8fafc] p-6 md:p-10 lg:p-12">
            <div class="max-w-4xl mx-auto pb-12">
                <button type="button" onclick="ListeningApp.showHistory()" class="text-sm font-bold text-slate-500 hover:text-cyan-700 mb-4">返回记录列表</button>
                <div class="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                    <div><p class="text-xs font-black text-slate-400 mb-2">${escapeHtml(record.dateStr || "")}</p><h1 class="text-2xl font-black text-slate-900">Listen and Choose</h1><p class="text-sm font-medium text-slate-500 mt-2">用时 ${formatTime(record.timeSpent || 0)}</p></div>
                    <div class="text-4xl font-black text-slate-900">${record.score} / ${record.total}</div>
                </div>
                <div class="space-y-3">${items}</div>
            </div>
        </section>`;
    }

    function render() {
        updateHeader();
        if (!appEl) return;
        if (state.screen === "loading") appEl.innerHTML = renderLoading();
        else if (state.screen === "error") appEl.innerHTML = renderError();
        else if (state.screen === "practice") appEl.innerHTML = renderPractice();
        else if (state.screen === "summary") appEl.innerHTML = renderSummary();
        else if (state.screen === "history") appEl.innerHTML = renderHistory();
        else if (state.screen === "history-detail") appEl.innerHTML = renderHistoryDetail();
        if (state.screen === "practice") {
            loadCurrentAudio();
            requestAnimationFrame(syncAudioControls);
        }
    }

    function initializeSession() {
        state.screen = "practice";
        state.questions = manifest.questions || [];
        state.currentIndex = 0;
        state.answers = {};
        state.checked = new Set();
        state.played = new Set();
        state.showTranscript = new Set();
        state.timeSpent = {};
        state.elapsed = 0;
        state.summary = null;
        state.historyRecord = null;
        loadedAudioQuestionId = null;
        render();
        startTimer();
    }

    async function initialize() {
        stopTimer();
        pauseAudio();
        state.screen = "loading";
        state.loadError = "";
        render();
        try {
            const response = await fetch("./listening_qb/manifest.json?v=1", { cache: "no-store" });
            if (!response.ok) throw new Error(`未检测到听力题库（${response.status}）`);
            const data = await response.json();
            if (!data.enabled || !Array.isArray(data.questions) || data.questions.length !== data.questionCount) {
                throw new Error("听力题库清单无效");
            }
            manifest = data;
            initializeSession();
        } catch (error) {
            manifest = null;
            state.loadError = error instanceof Error ? error.message : "题库加载失败";
            state.screen = "error";
            render();
        }
    }

    function selectAnswer(index) {
        const question = currentQuestion();
        if (!question || !state.played.has(question.id)) return showToast("请先播放题目音频");
        state.answers[question.id] = Number(index);
        state.checked.delete(question.id);
        state.showTranscript.delete(question.id);
        render();
    }

    async function toggleAudio() {
        const question = currentQuestion();
        if (!question || !audioEl) return;
        loadCurrentAudio();
        if (!audioEl.paused) {
            audioEl.pause();
            syncAudioControls();
            return;
        }
        try {
            if (audioEl.ended) audioEl.currentTime = 0;
            await audioEl.play();
            state.played.add(question.id);
            render();
        } catch (error) {
            console.error("音频播放失败", error);
            showToast("音频无法播放，请稍后重试");
        }
    }

    function seekAudio(value) {
        if (!audioEl || !Number.isFinite(audioEl.duration) || audioEl.duration <= 0) return;
        audioEl.currentTime = Number(value) / 1000 * audioEl.duration;
        syncAudioControls();
    }

    function setVolume(value) {
        if (!audioEl) return;
        audioEl.volume = Math.min(1, Math.max(0, Number(value) / 100));
        try { localStorage.setItem("toefl_listening_volume", String(audioEl.volume)); } catch {}
    }

    function goToQuestion(index) {
        if (index < 0 || index >= state.questions.length) return;
        pauseAudio();
        state.currentIndex = index;
        loadedAudioQuestionId = null;
        render();
    }

    function goPrevious() {
        goToQuestion(state.currentIndex - 1);
    }

    function goNext() {
        if (state.currentIndex >= state.questions.length - 1) {
            stopTimer();
            pauseAudio();
            state.summary = saveSession();
            state.screen = "summary";
            render();
            return;
        }
        goToQuestion(state.currentIndex + 1);
    }

    function resetCurrent() {
        const question = currentQuestion();
        if (!question) return;
        delete state.answers[question.id];
        state.checked.delete(question.id);
        state.showTranscript.delete(question.id);
        if (audioEl) audioEl.currentTime = 0;
        render();
    }

    function checkCurrent() {
        const question = currentQuestion();
        if (!question) return;
        if (!state.played.has(question.id)) return showToast("请先播放题目音频");
        if (!Number.isInteger(state.answers[question.id])) return showToast("请先选择一个回应");
        state.checked.add(question.id);
        state.showTranscript.add(question.id);
        render();
    }

    function toggleTranscript() {
        const question = currentQuestion();
        if (!question || !state.played.has(question.id)) return showToast("请先播放题目音频");
        if (state.showTranscript.has(question.id)) state.showTranscript.delete(question.id);
        else state.showTranscript.add(question.id);
        render();
    }

    function showHistory() {
        stopTimer();
        pauseAudio();
        state.historyRecord = null;
        state.screen = "history";
        render();
    }

    function openHistory(recordId) {
        state.historyRecord = loadHistory().find(record => String(record.id) === String(recordId)) || null;
        state.screen = state.historyRecord ? "history-detail" : "history";
        render();
    }

    function resumePractice() {
        if (!manifest) return initialize();
        state.screen = "practice";
        render();
        startTimer();
    }

    function restart() {
        if (!manifest) return initialize();
        pauseAudio();
        initializeSession();
    }

    if (audioEl) {
        try {
            const savedVolumeRaw = localStorage.getItem("toefl_listening_volume");
            const savedVolume = savedVolumeRaw === null || savedVolumeRaw === "" ? Number.NaN : Number(savedVolumeRaw);
            audioEl.volume = Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 0.8;
        } catch {
            audioEl.volume = 0.8;
        }
        audioEl.addEventListener("timeupdate", syncAudioControls);
        audioEl.addEventListener("durationchange", syncAudioControls);
        audioEl.addEventListener("loadedmetadata", syncAudioControls);
        audioEl.addEventListener("play", syncAudioControls);
        audioEl.addEventListener("pause", syncAudioControls);
        audioEl.addEventListener("ended", syncAudioControls);
        audioEl.addEventListener("error", () => showToast("当前音频加载失败，请稍后重试"));
    }

    window.ListeningApp = {
        retry: initialize,
        restart,
        resumePractice,
        showHistory,
        openHistory,
        selectAnswer,
        toggleAudio,
        seekAudio,
        setVolume,
        goToQuestion,
        goPrevious,
        goNext,
        resetCurrent,
        checkCurrent,
        toggleTranscript,
        isCorrect
    };

    document.addEventListener("DOMContentLoaded", initialize);
})();
