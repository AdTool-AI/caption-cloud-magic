import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryDuration = new Trend('posting_times_duration', true);

// Test configuration
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 40 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 30 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 300 },
    { duration: '2m', target: 800 },
    { duration: '1m', target: 0 },
  ],
};


export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // P95 should be < 200ms (simple aggregation query with cache)
    'http_req_duration{scenario:posting_times}': ['p(95)<200'],
    // Error rate must be < 0.5%
    'errors': ['rate<0.005'],
    // Cache performance
    'http_req_duration{scenario:posting_times}': ['p(50)<80'], // Fast median = cache hits
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

  // Test different platforms
  const platforms = ['instagram', 'tiktok', 'linkedin', 'facebook'];
  const platform = platforms[Math.floor(Math.random() * platforms.length)];

  const params = {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'posting_times', platform },
    timeout: '30s',
  };

  const startTime = new Date();
  const response = http.get(
    `${supabaseUrl}/functions/v1/posting-times-api?platform=${platform}`,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has suggestions': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.suggestions) && body.suggestions.length > 0;
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
    'cache hit < 80ms': (r) => {
      const cacheHeader = r.headers['X-Cache-Status'];
      if (cacheHeader === 'HIT') {
        return r.timings.duration < 80;
      }
      return true;
    },
  });

  // Track metrics
  errorRate.add(!success);
  queryDuration.add(duration);

  // Log cache performance
  const cacheStatus = response.headers['X-Cache-Status'] || 'UNKNOWN';
  if (cacheStatus === 'HIT') {
    console.log(`✓ ${platform} Cache HIT - ${response.timings.duration.toFixed(0)}ms`);
  } else if (cacheStatus === 'MISS') {
    console.log(`○ ${platform} Cache MISS - ${response.timings.duration.toFixed(0)}ms`);
  }

  if (response.status >= 400) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: user reviewing posting times
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
  const summary = generateSummary(data);
  return {
    'summary-posting-times.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateSummary(data) {
  let summary = `\n=== Load Test Summary: posting-times-api (Load Level: ${loadLevel}) ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `Total Requests: ${requests.count || 0}\n`;
    summary += `Request Rate: ${(requests.rate || 0).toFixed(2)}/s\n\n`;
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `Response Times:\n`;
    summary += `  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `  P50: ${(duration['p(50)'] || 0).toFixed(2)}ms (Cache Hit Target: <80ms)\n`;
    summary += `  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms (Target: <200ms)\n`;
    summary += `  P99: ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
    summary += `  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
    
    // Performance analysis
    const p50 = duration['p(50)'] || 0;
    const p95 = duration['p(95)'] || 0;
    
    if (p50 < 50) {
      summary += `✓ Excellent: P50 < 50ms (Cache working perfectly)\n`;
    } else if (p50 < 80) {
      summary += `✓ Good: P50 < 80ms (High cache hit rate)\n`;
    } else {
      summary += `✗ Needs improvement: P50 > 80ms (Check cache configuration)\n`;
    }
    
    if (p95 < 200) {
      summary += `✓ P95 Target Met: < 200ms\n`;
    } else {
      summary += `✗ P95 Target Missed: > 200ms\n`;
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
