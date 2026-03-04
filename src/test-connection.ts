import { createClient } from '@supabase/supabase-js';

/**
 * Diagnostic function to test environment variables and database connectivity
 * 诊断函数：用于测试环境变量和数据库连接性
 */
export const runDiagnosticTest = async (env: any) => {
    const report: any = {
        timestamp: new Date().toISOString(),
        // Check if the required environment variables are injected
        // 检查所需的环境变量是否已成功注入
        environment: {
            hasSupabaseUrl: !!env.SUPABASE_URL,
            hasSupabaseAnonKey: !!env.SUPABASE_ANON_KEY,
            hasKvBinding: !!env.UNISKILL_KV,
        },
        results: {}
    };

    // 1. Test Cloudflare KV Binding
    // 测试 Cloudflare KV 绑定是否正常
    try {
        await env.UNISKILL_KV.put('connection_test_ping', 'pong', { expirationTtl: 60 });
        const kvCheck = await env.UNISKILL_KV.get('connection_test_ping');
        report.results.kv_storage = kvCheck === 'pong' ? 'PASSED' : 'FAILED_DATA_MISMATCH';
    } catch (error: any) {
        report.results.kv_storage = `ERROR: ${error.message}`;
    }

    // 2. Test Supabase Connection
    // 测试 Supabase 数据库连接
    try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        // Attempt to query the api_keys table to verify permissions and connectivity
        // 尝试查询 api_keys 表，以验证权限和连接是否正常
        const { error } = await supabase
            .from('api_keys')
            .select('count', { count: 'exact', head: true });

        if (error) throw error;
        report.results.supabase_connectivity = 'PASSED';
    } catch (error: any) {
        report.results.supabase_connectivity = `ERROR: ${error.message}`;
    }

    return report;
};
