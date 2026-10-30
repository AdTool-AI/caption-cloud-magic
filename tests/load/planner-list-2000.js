import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const queryDuration = new Trend('query_duration', true);

// Test configuration - 2000 VU scaling test
export const options = {
  stages: [
    { duration: '1m', target: 500 },    // Ramp up to 500
    { duration: '2m', target: 1000 },   // Scale to 1000
    { duration: '3m', target: 2000 },   // Push to 2000 VUs
    { duration: '3m', target: 2000 },   // Hold at 2000 VUs
    { duration: '1m', target: 0 },      // Ramp down
  ],
  thresholds: {
    // P95 for DB queries should be < 1000ms at 2000 VUs
    'http_req_duration{scenario:planner_list}': ['p(95)<1000'],
    // 95% of checks must pass at this scale
    'checks': ['rate>0.95'],
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  
  const accessToken = __ENV.K6_TEST_ACCESS_TOKEN || anonKey;
  const workspaceId = __ENV.K6_TEST_WORKSPACE_ID;
  
  if (!workspaceId) {
    console.error('K6_TEST_WORKSPACE_ID not set. Run: k6 run tests/load/setup.js first');
    return;
  }
  
  // Simulate different query patterns
  const queryTypes = [
    { type: 'image', source: 'ai_generated' },
    { type: 'video', source: null },
    { search: 'fitness' },
    { tags: ['marketing', 'social'] },
    {}, // No filters - full list
  ];
  
  const query = queryTypes[Math.floor(Math.random() * queryTypes.length)];
  
  const payload = JSON.stringify({
    workspace_id: workspaceId,
    limit: 100, // Updated default limit
    offset: 0,
    ...query,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'planner_list' },
    timeout: '30s',
  };

  const startTime = new Date();
  const response = http.post(
    `${supabaseUrl}/functions/v1/planner-list`,
    payload,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
    'has total count': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.total === 'number';
      } catch {
        return false;
      }
    },
  });

  // Track metrics
  errorRate.add(!success);
  queryDuration.add(duration);

  if (response.status >= 400) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: user browsing content items
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
  const summary = generateSummary(data, 'planner-list-2000vus');
  return {
    'summary-planner-2000.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateSummary(data, endpoint) {
  let summary = `\n=== Load Test Summary: ${endpoint} (2000 VUs Scaling Test) ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `Total Requests: ${requests.count || 0}\n`;
    summary += `Request Rate: ${(requests.rate || 0).toFixed(2)}/s\n\n`;
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `Response Times:\n`;
    summary += `  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `  P50: ${(duration['p(50)'] || 0).toFixed(2)}ms\n`;
    summary += `  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `  P99: ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
    summary += `  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
    
    const p95 = duration['p(95)'] || 0;
    if (p95 < 500) {
      summary += `✓ Excellent: P95 < 500ms (Ready for 3000 VUs)\n`;
    } else if (p95 < 1000) {
      summary += `✓ Good: P95 < 1000ms (2000 VUs sustainable, optimization needed for 3000)\n`;
    } else {
      summary += `✗ Needs optimization: P95 > 1000ms (Bottleneck at 2000 VUs)\n`;
    }
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = ((failed.rate || 0) * 100).toFixed(2);
    summary += `\nError Rate: ${errorPercent}%\n`;
    if (failed.rate > 0.05) {
      summary += `⚠️  High error rate - investigate connection limits, cold starts, or query timeouts\n`;
    }
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  summary += `\n=== Next Steps ===\n`;
  if (duration && duration['p(95)'] < 1000) {
    summary += `✓ 2000 VUs passed - Ready for final 3000 VU test\n`;
    summary += `  Run: SET K6_LOAD_LEVEL=ultra && run-load-tests.bat\n`;
  } else {
    summary += `⚠️  Bottleneck found at 2000 VUs - Optimization needed:\n`;
    summary += `  1. Check Edge Function logs for cold starts\n`;
    summary += `  2. Review connection pool settings\n`;
    summary += `  3. Consider materialized views for hot queries\n`;
  }
  
  return summary;
}
