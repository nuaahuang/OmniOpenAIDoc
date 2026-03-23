import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface matching the data structure from RepositoryScanner
 */
export interface OmniApi {
    class: string;
    signature: string;
    description?: string;
}

export interface OmniManifest {
    module: string;
    apis: OmniApi[];
}

export class SourceGenerator {
    private readonly outputDir: string;

    constructor(projectRoot: string) {
        // Output to .omni/temp_sources to ensure AI indexing
        this.outputDir = path.join(projectRoot, '.omni', 'temp_sources');
    }

    /**
     * Entry point: Generates shadow Java files for all detected manifests
     */
    public async generate(manifestMap: Map<string, OmniManifest>): Promise<void> {
        this.initializeOutputDir();

        for (const [moduleName, manifest] of manifestMap) {
            console.log(`[SourceGen] Generating shadow sources for module: ${moduleName}`);
            
            // Group APIs by class to avoid duplicate class definitions in one file
            const classGroups = new Map<string, OmniApi[]>();
            
            if (!manifest.apis) continue;

            manifest.apis.forEach(api => {
                const list = classGroups.get(api.class) || [];
                list.push(api);
                classGroups.set(api.class, list);
            });

            for (const [fullClassName, apis] of classGroups) {
                this.writeShadowJavaFile(moduleName, fullClassName, apis);
            }
        }
    }

    private writeShadowJavaFile(moduleName: string, fullClassName: string, apis: OmniApi[]) {
        const parts = fullClassName.split('.');
        const className = parts.pop()!;
        const packageName = parts.join('.');

        // Map package hierarchy to physical directory structure
        const packagePath = path.join(this.outputDir, ...parts);
        if (!fs.existsSync(packagePath)) {
            fs.mkdirSync(packagePath, { recursive: true });
        }

        // Build English Shadow Source Content
        let content = `package ${packageName};\n\n`;
        content += `/**\n`;
        content += ` * [OmniSense Shadow Source]\n`;
        content += ` * Origin Module: ${moduleName}\n`;
        content += ` * This file is generated for AI context. DO NOT EDIT.\n`;
        content += ` */\n`;
        content += `public class ${className} {\n\n`;

        for (const api of apis) {
            const description = api.description ? api.description : "No description provided.";
            content += `    /**\n`;
            content += `     * ${description}\n`;
            content += `     * @origin ${moduleName}\n`;
            content += `     */\n`;
            content += `    public ${this.createMethodStub(api.signature)}\n\n`;
        }

        content += `}\n`;

        const filePath = path.join(packagePath, `${className}.java`);
        fs.writeFileSync(filePath, content);
    }

    /**
     * Creates a valid Java method stub based on the return type in the signature
     */
    private createMethodStub(signature: string): string {
        let s = signature.trim();
        // Remove trailing semicolon if present
        if (s.endsWith(';')) s = s.slice(0, -1);

        if (s.includes('void ')) return `${s} { /* Shadow Body */ }`;
        if (s.includes('boolean ')) return `${s} { return false; }`;
        
        // Handle numeric primitives
        if (s.match(/\b(int|long|double|float|short|byte)\b/)) {
            return `${s} { return 0; }`;
        }

        // Default for Objects/Strings
        return `${s} { return null; }`;
    }

    private initializeOutputDir() {
        if (fs.existsSync(this.outputDir)) {
            // Clean up old shadow files to avoid stale context
            fs.rmSync(this.outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.outputDir, { recursive: true });
    }
}