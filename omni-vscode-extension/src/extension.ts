import * as vscode from 'vscode';
import * as path from 'path';
import { RepositoryScanner } from './scanner/RepositoryScanner';
import { SourceGenerator } from './generator/SourceGenerator';
import { ContextGateway } from './gateway/ContextGateway';

export async function activate(context: vscode.ExtensionContext) {
    console.log('OmniSense 插件已激活');

    // 获取当前工作区根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const projectRoot = workspaceFolders[0].uri.fsPath;

    // 初始化核心组件
    const scanner = new RepositoryScanner();
    const generator = new SourceGenerator(projectRoot);
    const gateway = new ContextGateway(projectRoot);

    // 注册同步命令：omnisense.sync
    let disposable = vscode.commands.registerCommand('omnisense.sync', async () => {
        // 使用 VS Code 原生进度条 API
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "OmniSense: 正在同步全域语义",
            cancellable: false
        }, async (progress) => {
            try {
                // 1. 扫描 Maven 依赖
                progress.report({ message: "正在分析 Maven 依赖树 (mvn dependency)...", increment: 20 });
                const manifests = await scanner.scan();

                if (manifests.size === 0) {
                    vscode.window.showWarningMessage('OmniSense: 未在依赖中发现任何 omni-manifest.json 文件。');
                    return;
                }

                // 2. 生成虚拟源码
                progress.report({ message: `正在为 ${manifests.size} 个模块生成影子源码...`, increment: 50 });
                await generator.generate(manifests);

                // 3. 注入 Cursor 规则
                progress.report({ message: "正在配置 AI 引导规则...", increment: 20 });
                await gateway.injectRules();

                progress.report({ message: "同步完成！", increment: 10 });
                vscode.window.showInformationMessage(`OmniSense: 成功穿透 ${manifests.size} 个二方包，AI 上下文已更新。`);

            } catch (error: any) {
                vscode.window.showErrorMessage(`OmniSense 同步失败: ${error.message}`);
                console.error(error);
            }
        });
    });

    context.subscriptions.push(disposable);
}

// 插件去激活时的清理逻辑
export function deactivate() {}