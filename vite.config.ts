import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

/**
 * 路径重写插件：把 /sentence 这种无扩展名短路径重写到静态页 /practice/sentence.html。
 * 原因：Vite 的 fs serve 中间件会把无扩展名的 /sentence 误解析成根目录的 sentence.js，
 * 抢在 vinext app router 之前返回一段 JS，导致浏览器收到 text/javascript 当 HTML 解析而空白报错。
 * 这里把 rewrite 中间件插到 Vite 内置中间件栈顶，确保先重写再交给后续处理。
 */
function rewriteShortPaths() {
  return {
    name: "rewrite-short-paths",
    configureServer(server: { middlewares: { use: Function; stack: Array<{ handle: Function }> } }) {
      // 精确路径重写：/sentence 及其同目录相对资源（.css/.js）统一指向 /practice/ 下原始静态文件，
      // 避免 Vite 把 .css 当 HMR JS 模块转换导致 <link> 样式失效，.js 也避免被注入 HMR 后膨胀
      const REWRITES: Record<string, string> = {
        "/sentence": "/practice/sentence.html",
        "/sentence.css": "/practice/sentence.css",
        "/sentence.js": "/practice/sentence.js",
      };
      // 前缀路径重写：sentence.js 用相对路径 fetch 的题库 JSON（./sentence_qb/）
      // 与 <img> 引用的图片资源（./sentence_assets/），在 /sentence URL 下会解析到项目根目录，
      // 根目录没有 sentence_qb/ 会 404；统一指回 /practice/ 下的原始静态文件
      const PREFIX_REWRITES: Array<[string, string]> = [
        ["/sentence_qb/", "/practice/sentence_qb/"],
        ["/sentence_assets/", "/practice/sentence_assets/"],
      ];
      const rewrite = (req: { url?: string }, _res: unknown, next: Function) => {
        const raw = req.url ?? "";
        const qIdx = raw.indexOf("?");
        const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx);
        let target = REWRITES[pathname];
        if (!target) {
          for (const [from, to] of PREFIX_REWRITES) {
            if (pathname.startsWith(from)) {
              target = to + pathname.slice(from.length);
              break;
            }
          }
        }
        if (target) {
          const qs = qIdx === -1 ? "" : raw.slice(qIdx);
          req.url = target + qs;
        }
        next();
      };
      server.middlewares.use(rewrite);
      // 把刚注册的中间件移到栈顶，抢在 Vite 内置 fs/transform 中间件之前
      const stack = server.middlewares.stack;
      const idx = stack.findIndex((l: { handle: Function }) => l.handle === rewrite);
      if (idx > 0) {
        const [layer] = stack.splice(idx, 1);
        stack.unshift(layer);
      }
    },
  };
}

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      rewriteShortPaths(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
        },
      }),
    ],
  };
});
