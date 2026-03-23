import * as fs from 'fs';
import * as path from 'path';

export class ContextGateway {
    private readonly ruleFilePath: string;
    private readonly settingsPath: string;

    constructor(private projectRoot: string) {
        this.ruleFilePath = path.join(projectRoot, '.cursorrules');
        this.settingsPath = path.join(projectRoot, '.vscode', 'settings.json');
    }

    public async injectRules() {
        /**
         * 1. Inject .cursorrules Guidance (English Optimized)
         * Using strong keywords like "AUTHORITATIVE" and "PRIORITIZE" 
         * to force the AI model to index shadow sources first.
         */
        const ruleBanner = `
# [OmniSense Start]
# AI CONTEXT ENHANCEMENT:
# 1. ALWAYS reference shadow sources in .omni/temp_sources/ to understand internal APIs.
# 2. These shadow files are the AUTHORITATIVE source for cross-module semantics.
# 3. Use Javadoc in these files as the ground truth for business logic and contracts.
# [OmniSense End]
`.trim();

        let content = fs.existsSync(this.ruleFilePath) ? fs.readFileSync(this.ruleFilePath, 'utf8') : '';
        
        // Match both English and the old Chinese tags to ensure a clean migration/replacement
        const regex = /# \[OmniSense Start\][\s\S]*# \[OmniSense End\]/g;
        
        if (regex.test(content)) {
            content = content.replace(regex, ruleBanner);
        } else {
            content = content.trim() + '\n\n' + ruleBanner;
        }
        
        fs.writeFileSync(this.ruleFilePath, content);

        // 2. Adjust VS Code settings to ensure indexing without cluttering search
        this.updateVsCodeSettings();
    }

    private updateVsCodeSettings() {
        let settings: any = {};
        if (fs.existsSync(this.settingsPath)) {
            try { 
                settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')); 
            } catch(e) {
                // Silently handle JSON parse errors
            }
        }

        /**
         * Ensure Cursor's AI engine can index these files.
         * We explicitly set shadow sources to 'false' in exclude patterns.
         */
        settings["search.exclude"] = settings["search.exclude"] || {};
        settings["search.exclude"][".omni/temp_sources"] = false; 

        settings["files.watcherExclude"] = settings["files.watcherExclude"] || {};
        settings["files.watcherExclude"][".omni/temp_sources"] = false;

        const vscodeDir = path.join(this.projectRoot, '.vscode');
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }
        
        fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 4));
    }
}