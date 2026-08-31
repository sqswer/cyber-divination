# 赛博卜卦 · Cyber Divination

> 三枚铜钱起六爻，随机成卦；依卦辞、大象传、小象传与爻位分析参详，并预留外部大模型接口，可结合所问之事做独立分析与指导性建议。

零第三方依赖，一个 `node server.js` 就能跑。

## 快速开始

```bash
cd 赛博卜卦
node server.js
# 浏览器打开 http://localhost:3000
```

无需 `npm install`，不配大模型也能完整起卦、看卦辞爻辞。

## 核心功能

| 功能 | 说明 |
|---|---|
| 三枚铜钱起卦 | 每次掷三枚铜钱成一爻，自下而上六次成卦。概率严格遵循古法：老阴 / 老阳 各 12.5%，少阳 / 少阴 各 37.5% |
| 本卦 · 变卦 · 互卦 | 动爻（老阴 / 老阳）阴阳互变得**变卦**；二三四爻为下卦、三四五爻为上卦得**互卦**。三宫并列展示，卦画逐爻有生长动画 |
| 卦辞 + 大象传 | 每卦的卦辞、卦辞精解、**大象传**（卦象层面的修身指引），以及该卦对应的**卦理**（人生处境与化解之道） |
| 六爻详解 | 每爻四行：**爻辞** + **小象传**（逐爻权威解释）+ **爻位分析**（当位 / 得中 / 相应 / 承乘，依卦象自动推导）+ 精解。动爻以玫红高亮并标注「老阴 · 动 / 老阳 · 动」 |
| 为何变卦 | 讲清变卦由掷出老阴(6)/老阳(9)「物极必反」产生，与当位与否**没有**因果关联 |
| 卦象知识 | 可折叠的术语速查：变卦成因、当位 / 不当位、得中、相应、承乘、互卦 |
| 三卦关系 | 自动讲清本卦 → 变卦（本之卦）、本卦 → 互卦（互体）的来龙去脉，并三卦合参 |
| 断卦例法 | 依朱熹《易学启蒙》自动判定主断对象（0/1/2/3/4/5/6 个动爻各有章法） |
| 手选六爻 | 可手动指定每一爻的老阴 / 少阳 / 少阴 / 老阳，用于复盘或验证特定卦象 |
| 六十四卦速查 | 全部 64 卦网格，支持搜卦名，点开看完整卦辞与卦理 |
| **AI 解卦** | 一键结合所问之事做独立分析；未配置密钥时自动回传组装好的提示词供手动复制 |

## 起卦法

三枚铜钱，一爻一掷，自下而上共六掷：

| 三枚之和 | 爻性 | 动静 | 概率 |
|---|---|---|---|
| 6（字字字） | 老阴 ⚋ | **动爻**，阴极生阳，变而为阳 | 12.5% |
| 7（字字背） | 少阳 ⚊ | 静爻 | 37.5% |
| 8（字背背） | 少阴 ⚋ | 静爻 | 37.5% |
| 9（背背背） | 老阳 ⚊ | **动爻**，阳极生阴，变而为阴 | 12.5% |

记分规则：背（阳）记 3 分，字（阴）记 2 分，三枚相加即为爻数。

## 断卦例法（依朱熹《易学启蒙》）

| 动爻数 | 主断 |
|---|---|
| 0 | 本卦卦辞 |
| 1 | 本卦该动爻爻辞 |
| 2 | 本卦两动爻爻辞合参，上爻为主 |
| 3 | 本卦卦辞为主，参变卦卦辞 |
| 4 | 变卦两静爻爻辞，下爻为主 |
| 5 | 变卦唯一静爻爻辞 |
| 6 | 变卦卦辞（乾坤另参「用九」「用六」） |

## 接入大模型

接口兼容任何 OpenAI `/v1/chat/completions` 协议的服务端。二选一：

**方式一：配置文件**（推荐本地开发）

```bash
cp llm.config.example.json llm.config.json
```

```json
{
  "base": "https://api.deepseek.com/v1",
  "key": "sk-你的密钥",
  "model": "deepseek-chat",
  "temperature": 0.7
}
```

**方式二：环境变量**（推荐部署环境，优先级更高）

```bash
LLM_API_BASE=https://api.deepseek.com/v1 \
LLM_API_KEY=sk-你的密钥 \
LLM_MODEL=deepseek-chat \
node server.js
```

### 免费 / 开源模型参考示例

不想付费也能用。仓库已附 `llm.config.free-example.json`，复制为 `llm.config.json` 填好 key 即可：

```bash
cp llm.config.free-example.json llm.config.json
```

其中整理了若干免费档兼容端点（模型名随平台政策变动，以官网为准）：

| 方案 | base | 备注 |
|---|---|---|
| OpenRouter（标 `:free`） | `https://openrouter.ai/api/v1` | 注册送额度，部分模型免费用 |
| 硅基流动 SiliconFlow | `https://api.siliconflow.cn/v1` | 新用户送免费额度，DeepSeek 系列可用 |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | 完全免费、离线，需本机已 pull 模型（线上部署无法用本机地址） |
| 自建开源权重（如 `deepseek-v4-flash`） | 你的兼容端点 `/v1` | 把 base 换成提供服务地址，model 填其对外暴露的模型 ID |

> 若你用的是 `deepseek-v4-flash` 这类开源权重，只需把 `base`/`model` 换成对应服务的 OpenAI 兼容端点即可，提示词与前端无需任何改动。

`llm.config.json` 已在 `.gitignore` 中，密钥不会入库。

可选服务商（换 `base` + `model` 即可）：

| 服务商 | base | model 示例 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 月之暗面 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 阿里通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |

**未配置密钥时不会报错**：接口会返回按当前卦象完整组装好的提示词（含所问之事、本卦变卦互卦、卦辞卦理、六爻爻辞与精解、断卦例法），前端自动展开，可一键复制到任意大模型对话中使用。

## 接口

```
GET  /api/hexagrams       六十四卦列表（卦名 / 卦象 / 卦辞 / 精解 / 卦理）
POST /api/divine          起卦；body: { question?, tosses? }
                          tosses 为 6 个 6/7/8/9 的数组，省略则随机
GET  /api/ai/status       大模型是否已配置
POST /api/ai/interpret    AI 解卦；body: { question?, tosses? }
                          已配置 → SSE 流式返回 { ok, delta } … { ok, done }
                          未配置 → JSON 返回 { ok:false, reason:'not_configured', prompt }
```

## 部署

### Bonto / Docker

沿用「一夜狼人杀在线网页版」的模式：GitHub 仓库 + 根目录 `Dockerfile`，平台按 Dockerfile 构建。

```bash
docker build -t cyber-divination .
docker run -d -p 3000:3000 \
  -e LLM_API_BASE=https://api.deepseek.com/v1 \
  -e LLM_API_KEY=sk-xxx \
  -e LLM_MODEL=deepseek-chat \
  --name cyber-divination cyber-divination
```

镜像基于 `node:20-alpine`，零依赖，构建快、体积小。脚本文件即全部产物，无编译步骤。

### 静态托管

前端不强依赖后端：`app.js` 在接口不可达时会用本地引擎兜底起卦，因此 `public/` 目录可单独托管到任意静态空间（GitHub Pages / EdgeOne / OSS 等），只是 AI 解卦功能需要后端代理。

## 文件结构

```
server.js                  零依赖 Node 服务：静态托管 + 起卦接口 + 大模型 SSE 代理
package.json
Dockerfile                 Bonto / Docker 部署镜像
llm.config.example.json    大模型配置模板
public/                    ← 自包含静态包，可单独托管到任意静态空间
  hexagrams.js             六十四卦数据（卦辞 / 大象传 / 爻辞 / 小象传 / 精解 / 卦理 / 爻位分析）
  hexagrams-data.js        Node 侧桥接，保证前后端数据同源
  divine.js                起卦引擎（Node / 浏览器共用）：铜钱法、变卦、互卦、断卦例法、提示词组装
  index.html
  styles.css
  app.js
```

`public/` 目录本身就是一个完整可用的静态站点：直接丢到任意静态空间即可起卦、查卦，只有「AI 解卦」需要 `server.js` 做代理。

## 数据来源

- **卦辞、爻辞及其精解**：传统易学典籍「六十四卦精解」
- **大象传**：《周易·大象》，每卦一条，卦象层面的修身指引
- **小象传**：《周易·小象》，每爻一条，逐爻的权威解释
- **卦理（人生哲理）**：易学讲学公开整理稿
- **爻位分析**（当位 / 得中 / 相应 / 承乘）：由卦象自动推导，无需外部数据

关于爻位分析的推导规则：初、三、五为阳位，二、四、上为阴位，阳爻居阳位、阴爻居阴位即「当位」；
二、五为上下卦之中位，居之即「得中」；初与四、二与五、三与上一阴一阳则「相应」，同性则「相敌无应」；
上对下为「乘」、下对上为「承」，柔乘刚多吝、柔承刚多顺。

> ⚠️ **变卦与当位是两回事**：变卦只因掷出老阴(6)或老阳(9)「物极必反」而产生，
> 与当位与否没有任何因果关联。一个当位的爻照样可能掷成老阳而发动，一个不当位的爻也完全可能掷成少阴而静。
> 把两者混为一谈是初学最常犯的错误，页面「卦象知识」与送大模型的提示词中都对此作了明确说明。

数据已在载入时做自洽性校验：64 卦卦象编码两两唯一，且每一卦的爻名（九为阳、六为阴）与由上下卦推得的六爻阴阳完全一致。

## 说明

卦者，时也。内容整理自公开资料，供学习与文化参考，不构成重大决策依据。
