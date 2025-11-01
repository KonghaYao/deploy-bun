#!/usr/bin/env node
import { existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";
import { createHash } from "crypto";

// 执行 shell 命令的通用函数
function execCommand(command: string, args: string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: "inherit",
            shell: true,
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`命令执行失败，退出码: ${code}`));
            }
        });

        proc.on("error", (error) => {
            reject(error);
        });
    });
}

interface DeployConfig {
    name: string;
    build: string;
    deploy: {
        dist: string;
        entrypoint: string;
        port: number;
        server?: string; // 部署服务器地址
    };
}

async function readDeployConfig(): Promise<DeployConfig> {
    const configPath = resolve(process.cwd(), "deploy.json");
    console.log(`[CLI] 读取配置文件: ${configPath}`);

    if (!existsSync(configPath)) {
        throw new Error("未找到 deploy.json 文件");
    }

    const { readFileSync } = await import("fs");
    const file = readFileSync(configPath, "utf-8");
    const config = JSON.parse(file);
    console.log(`[CLI] 配置加载成功: ${config.name}`);
    return config;
}

async function executeBuild(buildCommand: string): Promise<void> {
    console.log(`[CLI] ==================== 开始构建 ====================`);
    console.log(`[CLI] 执行构建命令: ${buildCommand}`);
    const startTime = Date.now();

    // 直接执行完整的构建命令
    await execCommand(buildCommand);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[CLI] 构建完成，耗时: ${duration}s`);
}

async function createTarGz(
    sourceDir: string,
    outputFile: string
): Promise<void> {
    console.log(`[CLI] ==================== 开始打包 ====================`);
    console.log(`[CLI] 源文件夹: ${sourceDir}`);
    console.log(`[CLI] 目标文件: ${outputFile}`);

    const startTime = Date.now();
    // 使用 tar 命令打包成 tar.gz
    await execCommand("tar", ["-czf", outputFile, "-C", sourceDir, "."]);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const { readFileSync, statSync } = await import("fs");
    const stats = statSync(outputFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`[CLI] 打包完成，大小: ${sizeMB}MB，耗时: ${duration}s`);
}

function generateHash(content: Buffer): string {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
    const hash = createHash("sha256")
        .update(content)
        .digest("hex")
        .substring(0, 12);
    return `${timestamp}_${hash}`;
}

async function uploadToServer(
    filePath: string,
    serverUrl: string,
    config: DeployConfig
): Promise<void> {
    console.log(`[CLI] ==================== 开始上传 ====================`);
    console.log(`[CLI] 服务器地址: ${serverUrl}`);

    const startTime = Date.now();
    console.log(`[CLI] 读取文件: ${filePath}`);

    const { readFileSync } = await import("fs");
    const fileBuffer = readFileSync(filePath);
    const hash = generateHash(fileBuffer);

    console.log(`[CLI] 部署版本: ${hash}`);
    console.log(`[CLI] 应用端口: ${config.deploy.port}`);
    console.log(`[CLI] 入口文件: ${config.deploy.entrypoint}`);
    console.log(`[CLI] 正在上传...`);

    const response = await fetch(`${serverUrl}/upload`, {
        method: "POST",
        headers: {
            "Content-Type": "application/gzip",
            "X-Deploy-Hash": hash,
            "X-Deploy-Port": config.deploy.port.toString(),
            "X-Deploy-Entrypoint": config.deploy.entrypoint,
        },
        body: fileBuffer,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败: ${response.status} ${errorText}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const result = await response.json();
    console.log(`[CLI] 上传成功，耗时: ${duration}s`);
    console.log(`[CLI] 服务器响应:`, result);
}

async function main() {
    const totalStartTime = Date.now();
    console.log(`[CLI] ========================================`);
    console.log(`[CLI] 开始部署流程: ${new Date().toLocaleString()}`);
    console.log(`[CLI] ========================================`);

    try {
        const config = await readDeployConfig();

        // 执行构建
        await executeBuild(config.build);

        // 检查构建产物
        const distPath = resolve(process.cwd(), config.deploy.dist);
        console.log(`[CLI] 检查构建产物: ${distPath}`);
        if (!existsSync(distPath)) {
            throw new Error(`构建产物不存在: ${distPath}`);
        }
        console.log(`[CLI] 构建产物验证通过`);

        // 打包成 tar.gz
        const tarFile = `/tmp/deploy-${Date.now()}.tar.gz`;
        await createTarGz(distPath, tarFile);

        // 上传到服务器
        const serverUrl =
            config.deploy.server ||
            process.env.DEPLOY_SERVER_URL ||
            "http://localhost:7899";
        await uploadToServer(tarFile, serverUrl, config);

        // 清理临时文件
        console.log(`[CLI] 清理临时文件: ${tarFile}`);
        unlinkSync(tarFile);

        const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
        console.log(`[CLI] ========================================`);
        console.log(`[CLI] 🎉 部署成功！总耗时: ${totalDuration}s`);
        console.log(`[CLI] ========================================`);
    } catch (error) {
        console.error(`[CLI] ❌ 部署失败:`, error);
        process.exit(1);
    }
}

main();
