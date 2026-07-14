import { getStore } from "@edgeone/pages-blob";

const COOKIE_NAME = "auth_token";
const COOKIE_EXPIRATION = 30 * 60;
const HISTORY_STORE_NAME = "docker-sync-history";
const HISTORY_STORE_KEY = "history.json";
const INITIAL_HISTORY_ITEMS = [
  historyItem("2026-07-14 03:32:29", "mattermost/mattermost-team-edition:11.8.3", "mattermost-team-edition:11.8.3"),
  historyItem("2026-07-13 02:35:14", "ghcr.io/mhsanaei/3x-ui:v3.5.0", "3x-ui:v3.5.0"),
  historyItem("2026-06-26 10:41:40", "headscale/headscale:stable", "headscale:v0.29"),
  historyItem("2026-06-26 10:34:52", "ssliunian/derper:v1.98.5", "derper:v1.98.5"),
  historyItem("2026-06-26 07:47:47", "ssliunian/openvpn:latest", "openvpn:latest"),
  historyItem("2026-06-24 10:39:45", "ghcr.io/home-assistant/home-assistant:stable", "home-assistant:stable"),
  historyItem("2026-06-11 09:43:26", "monica:4.1.2-fpm-alpine", "monica:4.1.2-fpm-alpine"),
  historyItem("2026-06-01 09:44:07", "authelia/authelia:4.39.20", "authelia:4.39.20"),
  historyItem("2026-05-26 05:49:21", "louislam/uptime-kuma:2.3.2", "uptime-kuma:2.3.2"),
  historyItem("2026-05-25 06:23:07", "codercom/code-server:4.121.0-39", "code-server:4.121.0-39"),
  historyItem("2026-04-27 07:20:06", "nikolaik/python-nodejs:python3.11-nodejs20", "python-nodejs:python3.11-nodejs20"),
  historyItem("2026-04-27 03:25:23", "vaultwarden/server:1.35.8", "bitwarden:1.35.8"),
  historyItem("2026-04-23 14:57:38", "zhulinsen/daily_stock_analysis:latest", "daily_stock_analysis:latest"),
  historyItem("2026-04-13 05:50:13", "openilink/openilink-hub:0.1.31", "openilink-hub:0.1.31"),
  historyItem("2026-03-17 03:59:39", "ghcr.io/mtvpls/moontvplus:latest", "moontvplus:latest"),
  historyItem("2026-03-13 07:09:27", "alpine/openclaw:2026.3.12", "openclaw:2026.3.12"),
  historyItem("2026-02-24 03:26:26", "calciumion/new-api:v0.10.9", "new-api:v0.10.9"),
  historyItem("2026-02-24 03:26:24", "redis:7.2.13", "redis:7.2.13"),
  historyItem("2026-02-24 03:17:40", "stirlingtools/stirling-pdf:2.5.3-ultra-lite", "stirling-pdf:2.5.3-ultra-lite"),
  historyItem("2026-02-24 03:17:11", "henrygd/beszel:0.18.4", "beszel:0.18.4"),
  historyItem("2026-02-24 03:17:10", "henrygd/beszel-agent:0.18.4", "beszel-agent:0.18.4"),
  historyItem("2026-01-01 01:08:03", "su3817807/ctyun:latest", "ctyun:latest"),
  historyItem("2025-12-31 10:36:03", "hezhizheng/go-wxpush:v3", "go-wxpush:v3"),
  historyItem("2025-12-30 09:08:28", "nginx:1.28.1-alpine", "nginx:1.28.1-alpine"),
  historyItem("2025-12-16 03:27:16", "ghcr.io/hkuds/lightrag:latest", "lightrag:latest"),
  historyItem("2025-12-15 02:45:27", "infiniflow/ragflow:v0.21.1", "ragflow:v0.21.1"),
  historyItem("2025-12-12 09:41:12", "idootop/migpt-next:latest", "migpt-next:latest"),
  historyItem("2025-12-09 09:25:36", "vllm/vllm-openai:latest", "vllm-openai:latest"),
  historyItem("2025-12-02 09:29:17", "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", "cuda:12.4.1-cudnn-runtime-ubuntu22.04"),
  historyItem("2025-12-02 06:46:37", "lobehub/lobehub:2.0.0-next.144", "lobehub:2.0.0-next.144"),
  historyItem("2025-12-02 06:31:42", "kodcloud/kodbox:latest", "kodbox:1.64"),
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/healthy") {
    return jsonResponse({ code: 0, message: "success ok" });
  }

  if (url.pathname === "/login") {
    if (request.method === "GET") {
      return htmlResponse(renderLoginPage());
    }
    if (request.method === "POST") {
      return handleLoginPost(request, env);
    }
    return methodNotAllowed();
  }

  const authenticated = await hasValidSession(request, env);
  if (!authenticated) {
    const loginUrl = new URL(request.url);
    loginUrl.pathname = "/login";
    return redirectResponse(loginUrl.toString());
  }

  if (url.pathname === "/sync") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }
    return handleSyncPost(request, env);
  }

  if (url.pathname === "/history") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    return handleHistoryGet(env);
  }

  if (url.pathname === "/history-page") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    return handleHistoryPage(env);
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
    return handleMainPage(env);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleLoginPost(request, env) {
  const password = getRequiredEnv(env, "PASSWORD");
  if (!password) {
    return new Response("PASSWORD is not configured", { status: 500 });
  }

  const formData = await request.formData();
  const inputPassword = formData.get("password");

  if (inputPassword !== password) {
    return htmlResponse(renderLoginErrorPage(), 401);
  }

  const token = await createSessionToken(env);
  return new Response("Login Successful", {
    status: 302,
    headers: {
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_EXPIRATION}; HttpOnly; Secure; SameSite=Strict`,
      Location: "/",
    },
  });
}

async function handleSyncPost(request, env) {
  const githubToken = getRequiredEnv(env, "GITHUB_TOKEN");
  const repoOwner = getRequiredEnv(env, "REPO_OWNER");
  const repoName = getRequiredEnv(env, "REPO_NAME");

  if (!githubToken || !repoOwner || !repoName) {
    return jsonResponse(
      { message: "GITHUB_TOKEN, REPO_OWNER, or REPO_NAME is not configured" },
      500,
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ message: "Invalid JSON request body" }, 400);
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  if (!images.length || images.some((item) => !item.source || !item.target)) {
    return jsonResponse({ message: "请填写完整的镜像信息" }, 400);
  }

  const normalizedImages = images.map((item) => ({
    source: String(item.source).trim(),
    target: String(item.target).trim(),
    region: String(item.region || "shanghai").trim(),
    namespace: String(item.namespace || "mirco_service").trim(),
    platform: String(item.platform || "linux/amd64").trim(),
  }));

  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "User-Agent": "edgeone-docker-sync",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "sync_docker",
        client_payload: {
          images: normalizedImages,
          message: "github action sync",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    return jsonResponse(
      {
        message: `HTTP error ${response.status}: ${extractGithubMessage(errorText) || response.statusText}`,
      },
      response.status,
    );
  }

  const pullCommands = normalizedImages.map(
    (image) =>
      `docker pull registry.cn-${image.region}.aliyuncs.com/${image.namespace}/${image.target}`,
  );

  let historySaved = true;
  let historyError = "";
  try {
    await saveHistoryItems(env, normalizedImages);
  } catch (error) {
    console.warn("Save sync history failed:", error);
    historySaved = false;
    historyError = error.message;
  }

  return jsonResponse({ message: "sync request sent", pullCommands, historySaved, historyError });
}

async function handleHistoryGet(env) {
  return jsonResponse({ items: await loadHistoryItems(env) });
}

async function handleHistoryPage(env) {
  const items = await loadHistoryItems(env);
  const rows = items.map((item) => {
    const target = `registry.cn-${escapeHtml(item.region || "shanghai")}.aliyuncs.com/${escapeHtml(item.namespace || "mirco_service")}/${escapeHtml(item.targetName)}`;
    return `
      <tr class="border-b border-gray-200">
        <td class="px-4 py-3 align-top text-gray-600">${escapeHtml(item.key)}</td>
        <td class="px-4 py-3 align-top font-mono text-sm text-gray-800 break-all">${escapeHtml(item.source)}</td>
        <td class="px-4 py-3 align-top font-mono text-sm text-gray-800 break-all">${target}</td>
        <td class="px-4 py-3 align-top text-sm text-gray-500 whitespace-nowrap">${formatHistoryTime(item.updatedAt)}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Docker Sync History</title>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen bg-gradient-to-r from-pink-100 to-blue-100 p-4">
      <main class="max-w-6xl mx-auto bg-white shadow-lg rounded-lg p-6">
        <div class="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-800">Docker 镜像历史</h1>
            <p class="text-sm text-gray-500 mt-1">共 ${items.length} 条，按更新时间倒序展示</p>
          </div>
          <a href="/" class="bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300">返回同步页</a>
        </div>
        <div class="overflow-x-auto border border-gray-200 rounded-lg">
          <table class="min-w-full bg-white">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-700">镜像</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-700">Source</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-700">Target</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-700">更新时间</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">暂无历史记录</td></tr>`}
            </tbody>
          </table>
        </div>
      </main>
    </body>
    </html>`;

  return htmlResponse(html);
}

async function handleMainPage(env) {
  try {
    const [vueScript, tailwindCSS] = await Promise.all([
      fetch("https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js").then((r) =>
        r.text(),
      ),
      fetch("https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css").then((r) =>
        r.text(),
      ),
    ]);

    const defaultRegistry = env.ALIYUN_REGISTRY || "registry.cn-shanghai.aliyuncs.com";
    const defaultNamespace = env.ALIYUN_NAME_SPACE || "mirco_service";
    const defaultRegion = parseRegion(defaultRegistry) || "shanghai";

    const appTemplate = `
      <div class="min-h-screen bg-gradient-to-r from-pink-100 to-blue-100 flex items-center justify-center p-4">
        <div class="bg-white shadow-lg rounded-lg p-8 max-w-xl w-full">
          <div class="flex items-center justify-between gap-4 mb-6">
            <h1 class="text-3xl font-bold text-gray-800">Docker 镜像同步</h1>
            <a href="/history-page" class="text-sm text-blue-600 hover:text-blue-800">查看历史</a>
          </div>
          <div class="border border-gray-200 rounded-lg p-6 mb-6 bg-white shadow-sm">
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">已同步镜像:</label>
              <select v-model="selectedHistoryKey" @change="applyHistory" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">手动输入新镜像</option>
                <option v-for="item in historyItems" :key="item.key" :value="item.key">
                  {{ item.key }}
                </option>
              </select>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">来源镜像（例：vaultwarden/server:1.26.0）:</label>
              <input type="text" v-model.trim="image.source" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">目标镜像（例：bitwarden:1.26.0）:</label>
              <input type="text" v-model.trim="image.target" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">地域:</label>
              <input type="text" v-model.trim="image.region" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">命名空间:</label>
              <input type="text" v-model.trim="image.namespace" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
            </div>
          </div>
          <div>
            <button @click="syncImage" type="button" class="w-full bg-green-400 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300" :disabled="loading">
              {{ loading ? '同步中...' : '同步镜像' }}
            </button>
          </div>
          <div v-if="message" class="mt-6 p-4 rounded-lg" :class="messageClass">
            <p class="text-left overflow-auto text-gray-800 whitespace-pre-line">{{ message }}</p>
          </div>
        </div>
      </div>
    `;

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Docker Image Sync</title>
        <style>${tailwindCSS}</style>
      </head>
      <body class="bg-gray-50">
        <div id="app"></div>
        <script>${vueScript}<\/script>
        <script>
          const { createApp } = Vue;

          const App = {
            data() {
              return {
                image: {
                  source: 'vaultwarden/server:1.26.0',
                  target: 'bitwarden:1.26.0',
                  region: ${JSON.stringify(defaultRegion)},
                  namespace: ${JSON.stringify(defaultNamespace)}
                },
                historyItems: [],
                selectedHistoryKey: '',
                loading: false,
                message: null,
                messageClass: null
              };
            },
            mounted() {
              this.loadHistory();
            },
            methods: {
              async loadHistory() {
                try {
                  const response = await fetch('/history');
                  const result = await response.json();
                  if (response.ok && Array.isArray(result.items)) {
                    this.historyItems = result.items;
                    return;
                  }
                } catch (error) {
                  console.warn('Load history failed:', error);
                }
                this.historyItems = [];
              },
              applyHistory() {
                const item = this.historyItems.find(history => history.key === this.selectedHistoryKey);
                if (!item) {
                  return;
                }
                this.image = {
                  source: item.source,
                  target: item.targetName,
                  region: item.region || ${JSON.stringify(defaultRegion)},
                  namespace: item.namespace || ${JSON.stringify(defaultNamespace)}
                };
              },
              syncTargetFromSource() {
                const sourceParts = this.parseImageName(this.image.source);
                if (!sourceParts.name || !sourceParts.tag) {
                  return;
                }

                const targetParts = this.parseImageName(this.image.target);
                const shouldKeepMappedName = this.selectedHistoryKey && this.selectedHistoryKey === sourceParts.repository;
                const targetName = shouldKeepMappedName && targetParts.name ? targetParts.name : sourceParts.name;
                this.image.target = \`\${targetName}:\${sourceParts.tag}\`;
              },
              parseImageName(value) {
                const image = String(value || '').split('@')[0].trim();
                const slashIndex = image.lastIndexOf('/');
                const colonIndex = image.lastIndexOf(':');
                const hasTag = colonIndex > slashIndex;
                const repository = hasTag ? image.slice(0, colonIndex) : image;
                return {
                  repository,
                  name: repository.slice(repository.lastIndexOf('/') + 1),
                  tag: hasTag ? image.slice(colonIndex + 1) : ''
                };
              },
              async syncImage() {
                if (!this.image.source || !this.image.target || !this.image.region || !this.image.namespace) {
                  this.message = '请填写完整的镜像信息';
                  this.messageClass = 'bg-red-100 text-red-600';
                  return;
                }

                this.loading = true;
                this.message = null;

                try {
                  const response = await fetch('/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ images: [this.image] })
                  });

                  const result = await response.json();
                  if (!response.ok) {
                    throw new Error(result.message || response.statusText);
                  }

                  const now = new Date();
                  const formattedTime =
                    \`\${now.getFullYear()}-\${(now.getMonth() + 1).toString().padStart(2, '0')}-\${now.getDate().toString().padStart(2, '0')} \${now.getHours().toString().padStart(2, '0')}:\${now.getMinutes().toString().padStart(2, '0')}:\${now.getSeconds().toString().padStart(2, '0')}\`;

                  this.message =
                    \`同步请求已发送，时间：\${formattedTime}\\n稍等30S~60S后，请执行以下拉取命令：\\n\\n\${result.pullCommands.join('\\n\\n')}\\n\`;
                  if (result.historySaved === false && result.historyError) {
                    this.message += \`\\n历史保存失败：\${result.historyError}\\n\`;
                  }
                  this.messageClass = 'bg-green-100 text-green-600';
                  await this.loadHistory();
                  const sourceParts = this.parseImageName(this.image.source);
                  this.selectedHistoryKey = sourceParts.repository;
                } catch (error) {
                  this.message = \`同步请求失败：\${error.message}\`;
                  this.messageClass = 'bg-red-100 text-red-600';
                } finally {
                  this.loading = false;
                }
              }
            },
            watch: {
              'image.source'() {
                this.syncTargetFromSource();
              }
            },
            template: \`${appTemplate}\`
          };

          createApp(App).mount('#app');
        <\/script>
      </body>
      </html>`;

    return htmlResponse(html);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

function renderLoginPage() {
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>登录</title>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen bg-gradient-to-r from-pink-100 to-blue-100 flex items-center justify-center p-4">
      <div class="bg-white shadow-lg rounded-lg p-8 max-w-xl w-full">
        <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">登录</h1>
        <form method="POST" class="space-y-4">
          <div>
            <input type="password" name="password" id="password" placeholder="请输入密码" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
          </div>
          <div>
            <button type="submit" class="w-full bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300">登录</button>
          </div>
        </form>
      </div>
    </body>
    </html>`;
}

function renderLoginErrorPage() {
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>密码错误</title>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen bg-gradient-to-r from-pink-100 to-blue-100 flex items-center justify-center p-4">
      <div class="bg-white shadow-lg rounded-lg p-8 max-w-xl w-full">
        <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">密码错误</h1>
        <p class="text-center text-gray-600 mb-6">您输入的密码不正确，请返回登录页重新输入。</p>
        <div class="text-center">
          <a href="/login" class="block w-full bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300 text-center">返回登录页</a>
        </div>
      </div>
    </body>
    </html>`;
}

async function hasValidSession(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) {
    return false;
  }

  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = await signSessionValue(expiresAt, env);
  return timingSafeEqual(signature, expectedSignature);
}

async function createSessionToken(env) {
  const expiresAt = String(Math.floor(Date.now() / 1000) + COOKIE_EXPIRATION);
  const signature = await signSessionValue(expiresAt, env);
  return `${expiresAt}.${signature}`;
}

async function signSessionValue(value, env) {
  const secret = env.SESSION_SECRET || env.PASSWORD || "edgeone-docker-sync";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function getCookie(request, name) {
  const cookieString = request.headers.get("Cookie");
  if (!cookieString) {
    return null;
  }

  const cookies = cookieString.split(";");
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split("=");
    if (key === name) {
      return valueParts.join("=");
    }
  }
  return null;
}

function getRequiredEnv(env, key) {
  return env && typeof env[key] === "string" && env[key] ? env[key] : "";
}

function parseRegion(registry) {
  const match = String(registry).match(/^registry\.cn-([a-z0-9-]+)\.aliyuncs\.com$/);
  return match ? match[1] : "";
}

function historyItem(updatedAt, source, targetName, region = "shanghai", namespace = "mirco_service") {
  return {
    key: stripImageTag(source),
    source,
    targetName,
    region,
    namespace,
    updatedAt: `${updatedAt.replace(" ", "T")}.000Z`,
  };
}

async function loadHistoryItems(env) {
  const store = getHistoryStore(env);
  const items = await store.get(HISTORY_STORE_KEY, { type: "json", consistency: "strong" });
  if (!items) {
    const initialItems = sortHistoryItems(INITIAL_HISTORY_ITEMS);
    await store.setJSON(HISTORY_STORE_KEY, initialItems);
    return initialItems;
  }

  return Array.isArray(items) ? sortHistoryItems(items) : [];
}

async function saveHistoryItems(env, images) {
  const store = getHistoryStore(env);
  const currentItems = await loadHistoryItems(env);
  const itemMap = new Map(currentItems.map((item) => [item.key, item]));
  const updatedAt = new Date().toISOString();

  for (const image of images) {
    const source = image.source.trim();
    const targetName = getImageNameWithTag(image.target.trim());
    const key = stripImageTag(source);
    if (!source || !targetName || !key) {
      continue;
    }

    itemMap.set(key, {
      key,
      source,
      targetName,
      region: image.region,
      namespace: image.namespace,
      updatedAt,
    });
  }

  await store.setJSON(HISTORY_STORE_KEY, sortHistoryItems([...itemMap.values()]));
}

function getHistoryStore(env) {
  return getStore({
    name: env.BLOB_STORE_NAME || HISTORY_STORE_NAME,
    consistency: "strong",
  });
}

function sortHistoryItems(items) {
  return items
    .filter((item) => item && item.key && item.source && item.targetName)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

function stripImageTag(image) {
  const withoutDigest = String(image).split("@")[0];
  const slashIndex = withoutDigest.lastIndexOf("/");
  const colonIndex = withoutDigest.lastIndexOf(":");
  if (colonIndex > slashIndex) {
    return withoutDigest.slice(0, colonIndex);
  }
  return withoutDigest;
}

function getImageNameWithTag(image) {
  const withoutDigest = String(image).split("@")[0];
  return withoutDigest.slice(withoutDigest.lastIndexOf("/") + 1);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHistoryTime(value) {
  if (!value) {
    return "";
  }
  return String(value).replace("T", " ").replace(".000Z", " UTC");
}

function extractGithubMessage(body) {
  try {
    return JSON.parse(body).message;
  } catch (_error) {
    return body;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  });
}

function methodNotAllowed() {
  return new Response("Method Not Allowed", { status: 405 });
}

function redirectResponse(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}
