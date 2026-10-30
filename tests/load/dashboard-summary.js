import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryDuration = new Trend('dashboard_duration', true);

// Test configuration
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 150 },
    { duration: '1m', target: 300 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 500 },
    { duration: '2m', target: 1500 },
    { duration: '1m', target: 0 },
  ],
};


export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // P95 for dashboard should be < 300ms (with Redis cache)
    'http_req_duration{scenario:dashboard_summary}': ['p(95)<300'],
    // Error rate must be < 0.5%
    'errors': ['rate<0.005'],
    // Cache hit rate should be > 70% after warmup
    'http_req_duration{scenario:dashboard_summary}': ['p(50)<150'], // Fast median = cache hits
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  
  const accessToken = __ENV.K6_TEST_ACCESS_TOKEN || anonKey;
  
  if (!accessToken || accessToken === anonKey) {
    console.error('K6_TEST_ACCESS_TOKEN not set. Run: k6 run tests/load/setup.js first');
    return;
  }

  const params = {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'dashboard_summary' },
    timeout: '30s',
  };

  const startTime = new Date();
  const response = http.get(
    `${supabaseUrl}/functions/v1/dashboard-calendar-summary`,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.scheduled_count !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 300ms': (r) => r.timings.duration < 300,
    'cached response < 100ms': (r) => {
      const cacheHeader = r.headers['X-Cache-Status'];
      if (cacheHeader === 'HIT') {
        return r.timings.duration < 100;
      }
      return true;
    },
  });

  // Track metrics
  errorRate.add(!success);
  queryDuration.add(duration);

  // Log cache hits/misses
  const cacheStatus = response.headers['X-Cache-Status'] || 'UNKNOWN';
  if (cacheStatus === 'HIT') {
    console.log(`✓ Cache HIT - ${response.timings.duration.toFixed(0)}ms`);
  } else if (cacheStatus === 'MISS') {
    console.log(`○ Cache MISS - ${response.timings.duration.toFixed(0)}ms`);
  }

  if (response.status >= 400) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: user viewing dashboard
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function handleSummary(data) {
  const summary = generateSummary(data);
  return {
    'summary-dashboard.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateSummary(data) {
  let summary = `\n=== Load Test Summary: dashboard-calendar-summary (Load Level: ${loadLevel}) ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `Total Requests: ${requests.count || 0}\n`;
    summary += `Request Rate: ${(requests.rate || 0).toFixed(2)}/s\n\n`;
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `Response Times:\n`;
    summary += `  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `  P50: ${(duration['p(50)'] || 0).toFixed(2)}ms (Cache Hit Performance)\n`;
    summary += `  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `  P99: ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
    summary += `  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
    
    // Cache performance analysis
    const p50 = duration['p(50)'] || 0;
    const p95 = duration['p(95)'] || 0;
    
    if (p50 < 100) {
      summary += `✓ Excellent Cache Performance: P50 < 100ms (High hit rate)\n`;
    } else if (p50 < 150) {
      summary += `✓ Good Cache Performance: P50 < 150ms (Decent hit rate)\n`;
    } else {
      summary += `✗ Poor Cache Performance: P50 > 150ms (Low hit rate - check cache TTL)\n`;
    }
    
    if (p95 < 300) {
      summary += `✓ P95 Target Met: < 300ms\n`;
    } else {
      summary += `✗ P95 Target Missed: > 300ms (Investigate slow queries)\n`;
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
