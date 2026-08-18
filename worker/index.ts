import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    // /sentence 及其相对资源重写到 /practice/ 下原始静态文件：
    // - /sentence → /practice/sentence.html（避免 Vite 把无扩展名路径误解析成根目录 sentence.js）
    // - /sentence.css、/sentence.js → 避免被 Vite 当 HMR JS 模块转换
    // - /sentence_qb/、/sentence_assets/ → sentence.js 用相对路径 fetch 的题库 JSON 与图片，
    //   在 /sentence URL 下会解析到项目根目录（sentence_qb/ 不存在会 404）
    const REWRITES: Record<string, string> = {
      "/sentence": "/practice/sentence.html",
      "/sentence.css": "/practice/sentence.css",
      "/sentence.js": "/practice/sentence.js",
    };
    const PREFIX_REWRITES: Array<[string, string]> = [
      ["/sentence_qb/", "/practice/sentence_qb/"],
      ["/sentence_assets/", "/practice/sentence_assets/"],
    ];
    let rewriteTarget: string | undefined = REWRITES[url.pathname];
    if (!rewriteTarget) {
      for (const [from, to] of PREFIX_REWRITES) {
        if (url.pathname.startsWith(from)) {
          rewriteTarget = to + url.pathname.slice(from.length);
          break;
        }
      }
    }
    if (rewriteTarget) {
      const rewriteUrl = new URL(rewriteTarget, request.url);
      rewriteUrl.search = url.search;
      return handler.fetch(new Request(rewriteUrl, request), env, ctx);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
