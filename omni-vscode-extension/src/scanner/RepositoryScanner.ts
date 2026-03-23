import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as StreamZip from 'node-stream-zip';

export class RepositoryScanner {
    private outputChannel = vscode.window.createOutputChannel("OmniSense-Scanner");

    /**
     * 主扫描逻辑：穿透 Maven 依赖（外部 JAR + 本地子模块）
     */
    async scan(): Promise<Map<string, any>> {
        const manifests = new Map<string, any>();
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

        if (!rootPath) {
            vscode.window.showErrorMessage("未找到打开的工作区目录");
            return manifests;
        }

        try {
            this.outputChannel.appendLine(`开始扫描工程: ${rootPath}`);
            
            // 1. 获取所有路径 (外部 JAR + 本地 target 目录)
            const allPaths = await this.resolveAllContextPaths(rootPath);

            // 2. 遍历路径提取 manifest
            for (const itemPath of allPaths) {
                // 过滤逻辑：只扫描你公司或特定范围的包，避免扫描所有的 Spring/Apache 库
                // 建议根据你的工程包名修改，例如包含 'yudao' 或 'omni'
                console.log(`正在穿透: ${itemPath}`);
                
                let manifest = null;
                // 情况 C: 如果路径直接就是一个 .json 文件 (也就是你现在的情况)
                if (itemPath.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(itemPath, 'utf8');
                        manifest = JSON.parse(content);
                    } catch (e) {
                        this.outputChannel.appendLine(`解析 JSON 失败: ${itemPath}`);
                    }
                } 
                // 情况 A & B: 目录或 JAR (兼容其他情况)
                else if (fs.existsSync(itemPath)) {
                    if (fs.statSync(itemPath).isDirectory()) {
                        manifest = this.extractFromDirectory(itemPath);
                    } else if (itemPath.endsWith('.jar')) {
                        manifest = await this.extractFromJar(itemPath);
                    }
                }

                if (manifest) {
                    const moduleName = manifest.module || path.basename(itemPath);
                    manifests.set(moduleName, manifest);
                    this.outputChannel.appendLine(`✅ 成功发现配置: ${moduleName} [来源: ${itemPath}]`);
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ 扫描过程出错: ${error.message}`);
        }

        return manifests;
    }

    /**
     * 解析 Maven 上下文路径：合并外部 Classpath 和本地模块 target 路径
     */
    private async resolveAllContextPaths(rootPath: string): Promise<string[]> {
        const paths: string[] = [];

        // 1. 【新增】直接加入根目录下的聚合 JSON 路径
        const omniManifestsPath = path.join(rootPath, '.omni', 'manifests');
        if (fs.existsSync(omniManifestsPath)) {
            this.outputChannel.appendLine(`发现根目录聚合路径: ${omniManifestsPath}`);
            // 获取该目录下所有的 .json 文件
            const files = fs.readdirSync(omniManifestsPath)
                .filter(f => f.endsWith('.json'))
                .map(f => path.join(omniManifestsPath, f));
            paths.push(...files);
        }

        // 获取外部 JAR 依赖 (注意：Mac 上 Maven 路径分隔符是冒号 :)
        try {
            this.outputChannel.appendLine("执行 Maven 依赖构建...");
            const cpOutput = execSync('mvn dependency:build-classpath', { cwd: rootPath, encoding: 'utf8' });
            const jarPaths = cpOutput.split('\n')
                .find(line => line.includes('.jar'))
                ?.split(':') || [];
            paths.push(...jarPaths.map(p => p.trim()));
        } catch (e) {
            this.outputChannel.appendLine("警告: 无法获取外部 Classpath，请确保工程根目录有 pom.xml");
        }

        // 递归寻找本地子模块的 target/classes 目录
        const findTargetDirs = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                if (file === 'node_modules' || file === '.git' || file === '.omni') continue;
                
                if (fs.statSync(fullPath).isDirectory()) {
                    if (file === 'classes' && dir.endsWith('target')) {
                        paths.push(fullPath);
                    } else {
                        findTargetDirs(fullPath);
                    }
                }
            }
        };
        
        try {
            findTargetDirs(rootPath);
        } catch (e) {
            this.outputChannel.appendLine("扫描本地模块目录失败");
        }

        return [...new Set(paths)]; // 去重
    }

    /**
     * 从本地目录（子模块编译产物）读取配置
     */
    private extractFromDirectory(dirPath: string): any | null {
        const manifestPath = path.join(dirPath, 'META-INF', 'omni-manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const content = fs.readFileSync(manifestPath, 'utf8');
                return JSON.parse(content);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * 从 JAR 包中提取配置
     */
    private async extractFromJar(jarPath: string): Promise<any | null> {
        const zip = new StreamZip.async({ file: jarPath });
        try {
            const entry = await zip.entryData('META-INF/omni-manifest.json');
            const content = entry.toString('utf8');
            await zip.close();
            return JSON.parse(content);
        } catch (e) {
            // 大多数 JAR 没这个文件，静默跳过
            await zip.close();
            return null;
        }
    }
}