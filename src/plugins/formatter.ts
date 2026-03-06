// src/plugins/formatter.ts
// Logic: Centralized data formatting for official skills

export const PluginFormatter = {
    /**
     * Logic: Main entry point to route data to specific formatters
     * 逻辑：根据钩子名称将数据路由到特定格式化程序的入口
     */
    async format(hookName: string, rawData: any): Promise<string> {
        switch (hookName) {
            case "UNISKILL_SEARCH_FORMATTER":
                return this.tavilySearchFormatter(rawData);
            case "JINA_READER_FORMATTER":
                return this.jinaScrapeFormatter(rawData);
            case "NEWS_AGGREGATOR_FORMATTER":
                return this.newsFormatter(rawData);
            default:
                // 逻辑：如果没有匹配的钩子，回退到原始 JSON 字符串
                return JSON.stringify(rawData);
        }
    },

    /**
     * Logic: Specialized formatter for uniskill_search (Tavily)
     * 逻辑：为 uniskill_search (Tavily) 定制的格式化程序，继承原 search.ts 的核心清洗逻辑
     */
    tavilySearchFormatter(data: any): string {
        // 逻辑：提取 Tavily 生成的综合答案（Agent 可直接引用）
        const answer = data.answer ?? null;
        const rawResults = data.results ?? [];

        // 逻辑：将结果规范化为 Agent 易于处理的格式，并进行强截断以节省模型 Token
        const cleanedResults = rawResults.slice(0, 5).map((r: any) => {
            const title = r.title ?? "";
            const url = r.url ?? "";
            const score = r.score ?? 0;

            // 逻辑：单条内容硬截断至 1500 字符，防止撑爆上下文上限
            let content = r.content ?? "";
            if (content.length > 1500) {
                content = content.substring(0, 1500) + "...";
            }

            return {
                title,
                url,
                content,
                relevance_score: score,
            };
        });

        // 逻辑：返回结构化的 JSON 字符串。
        // 注意：原先的 _uniskill 元数据注入逻辑已被剥离到最外层的 index.ts 中统一处理。
        return JSON.stringify({
            answer: answer,
            results: cleanedResults,
            total_results: cleanedResults.length
        });
    },

    /**
     * Logic: Formatter for webpage scraping (Jina)
     */
    jinaScrapeFormatter(data: any): string {
        const content = data.content || data.markdown || "Failed to extract content.";
        const url = data.url || "Unknown Source";

        // 逻辑：对于抓取，我们保留其原生的 Markdown 输出，但限制长度
        let truncatedContent = content;
        if (truncatedContent.length > 10000) {
            truncatedContent = truncatedContent.substring(0, 10000) + "... [Content Truncated]";
        }

        return `### Scraped Content from: ${url}\n---\n${truncatedContent}\n---`;
    },

    /**
     * Logic: Formatter for news aggregation
     */
    newsFormatter(data: any): string {
        const articles = data.articles || [];
        if (articles.length === 0) return "No recent news found.";

        const cleanedArticles = articles.slice(0, 8).map((article: any) => ({
            title: article.title,
            url: article.url,
            publishedAt: article.publishedAt,
            description: article.description?.substring(0, 200)
        }));

        return JSON.stringify({
            status: "success",
            articles: cleanedArticles
        });
    }
};
