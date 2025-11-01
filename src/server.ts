#!/usr/bin/env bun
import { existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { $ } from "bun";
import type { Server } from "bun";

const UPLOAD_PORT = 7899;
const DEPLOYMENTS_DIR = resolve(process.cwd(), "deployments");

// 确保部署目录存在
if (!existsSync(DEPLOYMENTS_DIR)) {
    mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
}

let currentAppServer: Server<unknown> | null = null;
let currentDeploymentHash: string | null = null;

async function stopCurrentApp() {
    if (currentAppServer) {
        console.log(
            `[SERVER] ==================== 停止应用 ====================`
        );
        console.log(`[SERVER] 当前部署版本: ${currentDeploymentHash}`);
        currentAppServer.stop();
        currentAppServer = null;
        console.log(`[SERVER] 应用服务已停止`);
    }
}

async function startApp(hash: string, port: number, entrypoint: string) {
    console.log(`[SERVER] ==================== 启动应用 ====================`);
    const deploymentPath = join(DEPLOYMENTS_DIR, hash);
    const entrypointPath = join(deploymentPath, entrypoint);

    console.log(`[SERVER] 部署版本: ${hash}`);
    console.log(`[SERVER] 部署路径: ${deploymentPath}`);
    console.log(`[SERVER] 入口文件: ${entrypointPath}`);

    if (!existsSync(entrypointPath)) {
        throw new Error(`入口文件不存在: ${entrypointPath}`);
    }

    console.log(`[SERVER] 加载应用模块...`);

    // 动态导入并启动应用
    const app = await import(entrypointPath);

    console.log(`[SERVER] 启动 HTTP 服务，端口: ${port}`);
    currentAppServer = Bun.serve({
        port,
        fetch: app.default.fetch || app.fetch,
        error(error) {
            console.error(`[SERVER] 应用错误:`, error);
            return new Response("Internal Server Error", { status: 500 });
        },
    });

    currentDeploymentHash = hash;
    console.log(`[SERVER] ✅ 应用启动成功！`);
    console.log(`[SERVER] 访问地址: http://localhost:${port}`);
}

async function handleUpload(request: Request): Promise<Response> {
    const startTime = Date.now();
    console.log(`[SERVER] ========================================`);
    console.log(`[SERVER] 收到部署请求: ${new Date().toLocaleString()}`);
    console.log(`[SERVER] ========================================`);

    try {
        const hash = request.headers.get("X-Deploy-Hash");
        const port = request.headers.get("X-Deploy-Port");
        const entrypoint = request.headers.get("X-Deploy-Entrypoint");

        console.log(`[SERVER] 解析部署信息...`);
        console.log(`[SERVER] - 版本 Hash: ${hash}`);
        console.log(`[SERVER] - 应用端口: ${port}`);
        console.log(`[SERVER] - 入口文件: ${entrypoint}`);

        if (!hash || !port || !entrypoint) {
            console.error(`[SERVER] ❌ 缺少必要的部署信息`);
            return new Response("缺少必要的部署信息", { status: 400 });
        }

        const appPort = parseInt(port);
        if (isNaN(appPort)) {
            console.error(`[SERVER] ❌ 无效的端口号: ${port}`);
            return new Response("无效的端口号", { status: 400 });
        }

        // 保存上传的 gzip 文件
        const tempFile = `/tmp/deploy-${hash}.tar.gz`;
        console.log(`[SERVER] 接收文件数据...`);
        const arrayBuffer = await request.arrayBuffer();
        const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
        console.log(`[SERVER] 文件大小: ${sizeMB}MB`);

        console.log(`[SERVER] 保存临时文件: ${tempFile}`);
        await Bun.write(tempFile, arrayBuffer);

        // 创建部署目录
        const deploymentPath = join(DEPLOYMENTS_DIR, hash);
        if (existsSync(deploymentPath)) {
            console.log(`[SERVER] 清理已存在的部署目录: ${deploymentPath}`);
            await $`rm -rf ${deploymentPath}`;
        }
        console.log(`[SERVER] 创建部署目录: ${deploymentPath}`);
        mkdirSync(deploymentPath, { recursive: true });

        // 解压文件
        console.log(
            `[SERVER] ==================== 解压文件 ====================`
        );
        const unzipStartTime = Date.now();
        await $`tar -xzf ${tempFile} -C ${deploymentPath}`;
        const unzipDuration = ((Date.now() - unzipStartTime) / 1000).toFixed(2);
        console.log(`[SERVER] 解压完成，耗时: ${unzipDuration}s`);

        // 清理临时文件
        console.log(`[SERVER] 清理临时文件: ${tempFile}`);
        await $`rm ${tempFile}`;

        // 停止当前应用
        await stopCurrentApp();

        // 启动新应用
        await startApp(hash, appPort, entrypoint);

        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[SERVER] ========================================`);
        console.log(`[SERVER] 🎉 部署成功！总耗时: ${totalDuration}s`);
        console.log(`[SERVER] ========================================`);

        return new Response(
            JSON.stringify({
                success: true,
                hash,
                port: appPort,
                message: "部署成功",
                duration: totalDuration,
            }),
            {
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        console.error(`[SERVER] ========================================`);
        console.error(`[SERVER] ❌ 部署失败:`, error);
        console.error(`[SERVER] ========================================`);
        return new Response(
            JSON.stringify({
                success: false,
                error: errorMsg,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}

// 启动上传服务器
console.log(`[SERVER] ========================================`);
console.log(`[SERVER] 初始化部署服务器`);
console.log(`[SERVER] 启动时间: ${new Date().toLocaleString()}`);
console.log(`[SERVER] ========================================`);

const uploadServer = Bun.serve({
    port: UPLOAD_PORT,
    fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/upload" && request.method === "POST") {
            return handleUpload(request);
        }

        if (url.pathname === "/status" && request.method === "GET") {
            console.log(`[SERVER] 状态查询请求`);
            return new Response(
                JSON.stringify({
                    currentDeployment: currentDeploymentHash,
                    uploadPort: UPLOAD_PORT,
                    deploymentsDir: DEPLOYMENTS_DIR,
                    uptime: process.uptime(),
                }),
                {
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        console.log(`[SERVER] 未知请求: ${request.method} ${url.pathname}`);
        return new Response("Not Found", { status: 404 });
    },
    error(error) {
        console.error(`[SERVER] 上传服务器错误:`, error);
        return new Response("Internal Server Error", { status: 500 });
    },
});

console.log(`[SERVER] ✅ 上传服务器已启动`);
console.log(`[SERVER] 上传端口: ${UPLOAD_PORT}`);
console.log(`[SERVER] 部署目录: ${DEPLOYMENTS_DIR}`);
console.log(`[SERVER] 访问 http://localhost:${UPLOAD_PORT}/status 查看状态`);

// 优雅退出
process.on("SIGINT", async () => {
    console.log(`\n[SERVER] ========================================`);
    console.log(`[SERVER] 收到退出信号 (SIGINT)，正在关闭服务器...`);
    await stopCurrentApp();
    uploadServer.stop();
    console.log(`[SERVER] 服务器已关闭`);
    console.log(`[SERVER] ========================================`);
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log(`\n[SERVER] ========================================`);
    console.log(`[SERVER] 收到退出信号 (SIGTERM)，正在关闭服务器...`);
    await stopCurrentApp();
    uploadServer.stop();
    console.log(`[SERVER] 服务器已关闭`);
    console.log(`[SERVER] ========================================`);
    process.exit(0);
});
