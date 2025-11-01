FROM oven/bun:1.3-slim

WORKDIR /app

# 复制源代码
COPY src/ /app/src/

# 创建部署目录
RUN mkdir -p /app/deployments

# 暴露上传端口（7899）和应用端口范围
EXPOSE 7899
EXPOSE 3000-3100

# 设置环境变量
ENV NODE_ENV=production

# 健康检查（使用 bun 的 fetch）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:7899/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# 启动服务器
CMD ["bun", "src/server.ts"]