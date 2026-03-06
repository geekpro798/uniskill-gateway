# uniskill_scrape

## Description
Extract clean, LLM-friendly Markdown content from any website URL. Powered by Jina Reader.

## Parameters
```json
{
  "url": {
    "type": "string",
    "description": "The URL of the webpage to scrape.",
    "required": true
  }
}
```

## Implementation YAML
```yaml
# Logic: Identification for applying UniSkill official optimizations
# 逻辑：标识符，用于应用 UniSkill 官方深度优化
type: official_optimized
endpoint: "https://r.jina.ai/"
method: "POST"

# Logic: Mapping internal credentials
# 逻辑：映射内部凭证
api_key: "{{JINA_API_KEY}}"

# Logic: Mapping AI-generated arguments to the API payload
# 逻辑：将 AI 生成的参数映射到 API 请求体
payload:
  url: "{{url}}"

# Logic: Hook to trigger the data cleaning plugin
# 逻辑：触发数据清洗插件的钩子
plugin_hook: "JINA_READER_FORMATTER"
```
