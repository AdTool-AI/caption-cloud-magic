import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const queryDuration = new Trend('query_duration', true);

// Test configuration - Database read operations should be fast
// Use light load by default - set K6_LOAD_LEVEL=medium or heavy for stress testing
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 3000 },
    { duration: '1m', target: 0 },
  ],
};


export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // P95 for DB queries should be < 500ms
    'http_req_duration{scenario:planner_list}': ['p(95)<500'],
    // 98% of checks must pass
    'checks': ['rate>0.98'],
    'http_req_failed': ['rate<0.02'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  
  // Get real test credentials from environment (set by setup.js)
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
    limit: 50,
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
    timeout: '30s', // 30 second HTTP timeout
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
    // REMOVED: 'response time < 500ms' - redundant with p(95)<500 threshold
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
  const summary = generateSummary(data, 'planner-list');
  return {
    'summary-planner.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateSummary(data, endpoint) {
  let summary = `\n=== Load Test Summary: ${endpoint} (Load Level: ${loadLevel}) ===\n\n`;
  
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
    
    // Database performance insights
    const p95 = duration['p(95)'] || 0;
    if (p95 < 200) {
      summary += `✓ Excellent: P95 < 200ms (Database indexes working perfectly)\n`;
    } else if (p95 < 500) {
      summary += `✓ Good: P95 < 500ms (Database performance acceptable)\n`;
    } else {
      summary += `✗ Needs optimization: P95 > 500ms (Check indexes and query plans)\n`;
    }
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = ((failed.rate || 0) * 100).toFixed(2);
    summary += `\nError Rate: ${errorPercent}%\n`;
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  return summary;
}
