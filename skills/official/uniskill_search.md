# uniskill_search

## Description
Real-time web search for news, stocks, and trends. Powered by Tavily.

## Parameters
```json
{
  "query": {
    "type": "string",
    "description": "The specific query string to search on the web.",
    "required": true
  },
  "search_depth": {
    "type": "string",
    "description": "Depth of the search: 'basic' or 'advanced'.",
    "enum": ["basic", "advanced"],
    "default": "basic"
  },
  "max_results": {
    "type": "integer",
    "description": "Maximum number of results to return.",
    "default": 5
  },
  "include_answer": {
    "type": "boolean",
    "description": "Include a short LLM-generated answer based on results.",
    "default": false
  }
}
```

## Implementation YAML
```yaml
# Logic: Identification for applying UniSkill official optimizations
# 逻辑：标识符，用于应用 UniSkill 官方深度优化
type: official_optimized
endpoint: "https://api.tavily.com/search"
method: "POST"

# Logic: Mapping internal credentials 
# 逻辑：映射内部凭证
api_key: "{{TAVILY_API_KEY}}"

# Logic: Mapping AI-generated arguments to the API payload
# 逻辑：将 AI 生成的参数映射到 API 请求体
payload:
  query: "{{query}}"
  search_depth: "{{search_depth}}"
  max_results: "{{max_results}}"
  include_answer: "{{include_answer}}"

# Logic: Hook to trigger the data cleaning plugin
# 逻辑：触发数据清洗插件的钩子
plugin_hook: "UNISKILL_SEARCH_FORMATTER"
```
