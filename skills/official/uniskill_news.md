# uniskill_news

## Description
Get the latest global news headlines, summaries, and metadata across various categories.

## Parameters
```json
{
  "query": {
    "type": "string",
    "description": "Search keyword for specific news topics.",
    "required": false
  },
  "category": {
    "type": "string",
    "description": "News category: 'business', 'technology', 'sports', etc.",
    "required": false
  },
  "max_results": {
    "type": "integer",
    "description": "Number of articles to return.",
    "default": 8
  }
}
```

## Implementation YAML
```yaml
# Logic: Identification for applying UniSkill official optimizations
# 逻辑：标识符，用于应用 UniSkill 官方深度优化
type: official_optimized
endpoint: "https://api.uniskill.ai/news/aggregate"
method: "POST"

# Logic: Mapping internal credentials
# 逻辑：映射内部凭证
api_key: "{{NEWS_API_KEY}}"

# Logic: Mapping AI-generated arguments to the API payload
# 逻辑：将 AI 生成的参数映射到 API 请求体
payload:
  q: "{{query}}"
  category: "{{category}}"
  limit: "{{max_results}}"

# Logic: Hook to trigger the data cleaning plugin
# 逻辑：触发数据清洗插件的钩子
plugin_hook: "NEWS_AGGREGATOR_FORMATTER"
```
## Returns
```json
{
  "articles": [
    {
      "title": "Global Markets Rally on Tech Earnings",
      "summary": "Major indices hit record highs today following stronger-than-expected earnings reports from leading technology companies. AI sector leads the growth.",
      "source": "Reuters",
      "url": "[https://www.reuters.com/markets/us/example](https://www.reuters.com/markets/us/example)",
      "published_at": "2026-03-07T08:30:00Z"
    }
  ],
  "metadata": {
    "total_results": 1,
    "query": "tech earnings"
  }
}