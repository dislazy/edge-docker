const COOKIE_NAME = "auth_token";
const COOKIE_EXPIRATION = 30 * 60;

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

  return jsonResponse({ message: "sync request sent", pullCommands });
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
          <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">Docker 镜像同步</h1>
          <div v-for="(image, index) in images" :key="index" class="border border-gray-200 rounded-lg p-6 mb-6 bg-white shadow-sm">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">镜像 {{ index + 1 }}</h2>
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
            <button @click="removeImage(index)" type="button" class="w-full bg-red-400 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300">删除</button>
          </div>
          <div class="flex justify-between gap-4">
            <button @click="addImage" type="button" class="bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300">添加镜像</button>
            <button @click="syncImages" type="button" class="bg-green-400 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition duration-300" :disabled="loading">
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
                images: [{
                  source: 'vaultwarden/server:1.26.0',
                  target: 'bitwarden:1.26.0',
                  region: ${JSON.stringify(defaultRegion)},
                  namespace: ${JSON.stringify(defaultNamespace)}
                }],
                loading: false,
                message: null,
                messageClass: null
              };
            },
            methods: {
              addImage() {
                this.images.push({
                  source: '',
                  target: '',
                  region: ${JSON.stringify(defaultRegion)},
                  namespace: ${JSON.stringify(defaultNamespace)}
                });
              },
              removeImage(index) {
                this.images.splice(index, 1);
              },
              async syncImages() {
                if (this.images.some(item => !item.source || !item.target || !item.region || !item.namespace)) {
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
                    body: JSON.stringify({ images: this.images })
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
                  this.messageClass = 'bg-green-100 text-green-600';
                } catch (error) {
                  this.message = \`同步请求失败：\${error.message}\`;
                  this.messageClass = 'bg-red-100 text-red-600';
                } finally {
                  this.loading = false;
                }
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
