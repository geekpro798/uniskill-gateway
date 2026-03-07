// src/formatters/weather.ts
// Logic: Example formatter for weather data

export const WeatherFormatter = {
    format(data: any): string {
        // 逻辑：示例天气数据清洗
        const location = data.location?.name || "Unknown";
        const temp = data.current?.temp_c || "N/A";
        const condition = data.current?.condition?.text || "Unknown";

        return `Current weather in ${location}: ${temp}°C, ${condition}.`;
    }
};
