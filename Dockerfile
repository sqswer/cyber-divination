# 赛博卜卦 · 部署镜像（Bonto / Docker 通用）
FROM node:20-alpine
WORKDIR /app

COPY package.json server.js ./
COPY public ./public

# 大模型为可选项，不配置也能正常起卦（仅回传提示词）
# 如需接入，构建后挂载或写入 /app/llm.config.json，或直接注入环境变量：
#   LLM_API_BASE / LLM_API_KEY / LLM_MODEL / LLM_TEMPERATURE
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
