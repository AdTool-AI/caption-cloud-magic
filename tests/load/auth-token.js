import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const authDuration = new Trend('auth_duration', true);

// Test configuration - Auth should be extremely fast
// Use light load by default - set K6_LOAD_LEVEL=medium or heavy for stress testing
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 2 },
    { duration: '1m', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 500 },
    { duration: '1m', target: 0 },
  ],
};


export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // Auth under load should be reasonable (adjusted for realistic Supabase Auth latency)
    'http_req_duration{scenario:auth_token}': ['p(95)<1500'],
    // 98% of checks must pass
    'checks': ['rate>0.98'],
    'http_req_failed': ['rate<0.02'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  
  // Get access token from environment (set in config.json)
  const accessToken = __ENV.K6_TEST_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('Missing K6_TEST_ACCESS_TOKEN environment variable');
    console.error('Please ensure config.json has a valid accessToken');
    return;
  }
  
  // Test token validation by fetching user data
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${accessToken}`,
    },
    timeout: '30s',
    tags: { scenario: 'auth_token' },
  };

  const startTime = new Date();
  const response = http.get(
    `${supabaseUrl}/auth/v1/user`,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has user id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id !== undefined;
      } catch (e) {
        return false;
      }
    },
    'has user email': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.email !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  // Track metrics
  errorRate.add(!success);
  authDuration.add(duration);

  if (response.status >= 400) {
    console.error(`Auth error ${response.status}: ${response.body}`);
  }

  // Think time: user session is active (increased to avoid rate limiting)
  sleep(Math.random() * 2 + 2); // 2-4 seconds
}

export function handleSummary(data) {
  const summary = generateAuthSummary(data);
  return {
    'summary-auth.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateAuthSummary(data) {
  let summary = `\n=== Load Test Summary: auth-token (Load Level: ${loadLevel}) ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `Total Auth Requests: ${requests.count || 0}\n`;
    summary += `Request Rate: ${(requests.rate || 0).toFixed(2)}/s\n\n`;
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `Auth Performance:\n`;
    summary += `  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `  P50: ${(duration['p(50)'] || 0).toFixed(2)}ms\n`;
    summary += `  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `  P99: ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
    summary += `  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
    
    // Auth performance analysis
    const p95 = duration['p(95)'] || 0;
    if (p95 < 100) {
      summary += `✓ Excellent: P95 < 100ms (Very fast auth)\n`;
    } else if (p95 < 500) {
      summary += `✓ Good: P95 < 500ms (Auth within target)\n`;
    } else {
      summary += `✗ Slow: P95 > 500ms (Auth bottleneck - investigate)\n`;
    }
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = ((failed.rate || 0) * 100).toFixed(2);
    summary += `\nError Rate: ${errorPercent}%\n`;
    
    if ((failed.rate || 0) > 0.01) {
      summary += `⚠ WARNING: Auth error rate too high! (Target: < 1%)\n`;
    }
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  return summary;
}
