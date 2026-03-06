// src/engine/parser.ts
// Logic: Core engine parser to convert skill.md into an executable Spec

import { parse as parseYaml } from 'yaml'; // 逻辑：需要 npm install yaml

// Logic: Define the standard structure of an executable skill
// 逻辑：定义可执行技能的标准结构
export interface SkillSpec {
    name: string;
    description: string;
    parameters: Record<string, any>;
    implementation: {
        type: string;
        endpoint?: string;
        method?: string;
        api_key?: string;
        payload?: Record<string, any>;
        plugin_hook?: string;
        [key: string]: any;
    };
}

export const SkillParser = {
    /**
     * Logic: Parse raw Markdown text into a structured SkillSpec object
     * 逻辑：将原始 Markdown 文本解析为结构化的 SkillSpec 对象
     */
    parse(markdown: string): SkillSpec {
        // ── Step 1: Extract Skill Name (H1) ──
        // 逻辑：匹配一级标题作为技能的全局唯一标识符
        const nameMatch = markdown.match(/^#\s+(.+)/m);
        const name = nameMatch ? nameMatch[1].trim() : "Unknown_Skill";

        // ── Step 2: Extract Description (Text block) ──
        // 逻辑：提取 ## Description 下的文本，并使用正则剔除 HTML 注释
        const descMatch = markdown.match(/## Description\s*\n([\s\S]*?)(?=##|$)/);
        const description = descMatch
            ? descMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim()
            : "";

        // ── Step 3: Extract Parameters (JSON block) ──
        // 逻辑：精准提取 ```json 和 ``` 之间的内容并反序列化
        const jsonMatch = markdown.match(/```json\s*\n([\s\S]*?)\n\s*```/);
        let parameters = {};
        if (jsonMatch) {
            try {
                parameters = JSON.parse(jsonMatch[1]);
            } catch (error) {
                console.error(`[Parser Error] Invalid JSON parameters in skill: ${name}`);
            }
        }

        // ── Step 4: Extract Implementation (YAML block) ──
        // 逻辑：精准提取 ```yaml 和 ``` 之间的内容，转换为 JS 对象
        const yamlMatch = markdown.match(/```yaml\s*\n([\s\S]*?)\n\s*```/);
        let implementation: any = { type: 'unknown' };
        if (yamlMatch) {
            try {
                implementation = parseYaml(yamlMatch[1]);
            } catch (error) {
                console.error(`[Parser Error] Invalid YAML implementation in skill: ${name}`);
            }
        }

        // Logic: Return the standardized executable specification
        // 逻辑：返回标准化后的可执行规格说明
        return {
            name,
            description,
            parameters,
            implementation
        };
    }
};
