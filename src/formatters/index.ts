// src/formatters/index.ts
// Logic: Plugin Registry - Entry point for all formatters

import { SearchFormatter } from "./search";
import { ScrapeFormatter } from "./scrape";
import { NewsFormatter } from "./news";
import { WeatherFormatter } from "./weather";

/**
 * Logic: Central registry for all data cleaning plugins
 * 逻辑：所有数据清洗插件的中心注册表
 */
export const PluginRegistry: Record<string, { format: (data: any) => string | Promise<string> }> = {
    "UNISKILL_SEARCH_FORMATTER": SearchFormatter,
    "JINA_READER_FORMATTER": ScrapeFormatter,
    "NEWS_AGGREGATOR_FORMATTER": NewsFormatter,
    "WEATHER_FORMATTER": WeatherFormatter, // 🔴 新增：天气格式化插件示例
};

export const PluginRegistryManager = {
    async format(hookName: string, rawData: any): Promise<string> {
        const formatter = PluginRegistry[hookName];

        if (formatter) {
            return await formatter.format(rawData);
        }

        // Fallback: If no plugin registered, return raw JSON string
        return JSON.stringify(rawData);
    }
};
