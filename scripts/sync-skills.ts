import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Logic: ESM compatibility for __dirname
// 逻辑：兼容 ESM 环境下的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logic: Define the target directory and the KV binding name
// 逻辑：定义目标技能文件夹路径和 KV 绑定的名称
const OFFICIAL_SKILLS_DIR = path.join(__dirname, '../skills/official');
const KV_BINDING = 'UNISKILL_KV';

console.log(`🚀 Starting UniSkill Official Skills Sync...\n`);

function syncOfficialSkills() {
    // Logic: Ensure the directory exists to prevent crash
    // 逻辑：确保文件夹存在，防止在新克隆的项目中运行报错
    if (!fs.existsSync(OFFICIAL_SKILLS_DIR)) {
        console.error(`❌ Error: Directory not found at ${OFFICIAL_SKILLS_DIR}`);
        process.exit(1);
    }

    // Logic: Read all files in the directory
    // 逻辑：读取文件夹下的所有文件
    const files = fs.readdirSync(OFFICIAL_SKILLS_DIR);
    let successCount = 0;

    for (const file of files) {
        // Logic: Only process Markdown files
        // 逻辑：过滤出所有的 .md 技能规约文件
        if (file.endsWith('.md')) {
            const skillName = file.replace('.md', '');
            const kvKey = `skill:official:${skillName}`;
            const filePath = path.join(OFFICIAL_SKILLS_DIR, file);

            console.log(`⏳ Syncing [${skillName}] to KV...`);

            try {
                // Logic: Construct and execute the wrangler CLI command synchronously
                // 逻辑：构建并同步执行 wrangler 命令行，将文件内容推送到云端 KV
                // We use --remote to ensure it syncs to the live Cloudflare environment
                const command = `npx wrangler kv key put "${kvKey}" --binding=${KV_BINDING} --path="${filePath}" --remote`;

                // stdio: 'pipe' keeps the terminal clean from wrangler's default output
                execSync(command, { stdio: 'pipe' });

                console.log(`✅ Success: ${kvKey}`);
                successCount++;
            } catch (error: any) {
                // Logic: Catch and display specific command execution errors
                // 逻辑：捕获并展示命令执行过程中的具体错误
                console.error(`❌ Failed to sync ${skillName}:`);
                console.error(error.message || error);
            }
        }
    }

    console.log(`\n🎉 Sync complete! Successfully updated ${successCount} official skill(s).`);
}

// Logic: Execute the main function
// 逻辑：执行主函数
syncOfficialSkills();
