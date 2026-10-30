import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const campaignDuration = new Trend('campaign_duration', true);

// Test configuration - Phase 2 optimizations
// Use light load by default - set K6_LOAD_LEVEL=medium or heavy for stress testing
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 500 },
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
};


export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // P95 should be < 15s (AI generation takes time)
    'http_req_duration{scenario:generate_campaign}': ['p(95)<15000'],
    // Success rate should be > 95%
    'checks': ['rate>0.95'],
    'http_req_failed': ['rate<0.02'],
  },
};

// Test data
const topics = [
  'Fitness Tips for Beginners',
  'Healthy Breakfast Recipes',
  'Social Media Marketing Trends',
  'Productivity Hacks for Remote Work',
  'Sustainable Living Guide',
];

const platforms = [
  ['instagram', 'x'],
  ['tiktok', 'instagram'],
  ['linkedin', 'x'],
  ['instagram', 'facebook'],
];

const tones = ['professional', 'casual', 'friendly', 'authoritative'];

const goals = [
  'Increase engagement and grow followers',
  'Drive traffic to website',
  'Build brand awareness',
  'Generate leads'
];

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  
  // Get real test credentials from environment (set by setup.js)
  const accessToken = __ENV.K6_TEST_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('K6_TEST_ACCESS_TOKEN not set. Run: k6 run tests/load/setup.js first');
    return;
  }
  
  // Random test data
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const selectedPlatforms = platforms[Math.floor(Math.random() * platforms.length)];
  const tone = tones[Math.floor(Math.random() * tones.length)];
  const goal = goals[Math.floor(Math.random() * goals.length)];
  
  const payload = JSON.stringify({
    goal: goal,
    topic: topic,
    tone: tone,
    durationWeeks: 1,
    platforms: selectedPlatforms,
    postFrequency: 3,
    language: 'en'
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'generate_campaign' },
    timeout: '30s', // AI generation can take time
  };

  const startTime = new Date();
  const response = http.post(
    `${supabaseUrl}/functions/v1/generate-campaign`,
    payload,
    params
  );
  const duration = new Date() - startTime;

  // Handle rate limiting FIRST (before checks) - don't count as error
  if (response.status === 429) {
    const retryAfter = response.headers['retry-after'] || '60';
    console.log(`Rate limited: ${retryAfter}s`);
    sleep(parseInt(retryAfter));
    return; // Exit early without counting as error
  }

  // Check response
  const success = check(response, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'response has body': (r) => r.body && r.body.length > 0,
    'response time < 15000ms': (r) => r.timings.duration < 15000,
  });

  // Track metrics (429 already handled above, won't reach here)
  errorRate.add(!success);
  campaignDuration.add(duration);

  // Check for errors
  if (response.status >= 400 && response.status !== 429) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: simulate user reading generated campaign
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = `\n${indent}=== Load Test Summary: generate-campaign (Load Level: ${loadLevel}) ===\n\n`;
  
  // Requests
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `${indent}Total Requests: ${requests.count || 0}\n`;
    summary += `${indent}Request Rate: ${(requests.rate || 0).toFixed(2)}/s\n\n`;
  }
  
  // Duration
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `${indent}Response Times:\n`;
    summary += `${indent}  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
  }
  
  // Errors
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = ((failed.rate || 0) * 100).toFixed(2);
    summary += `${indent}Error Rate: ${errorPercent}%\n`;
  }
  
  // Thresholds
  summary += `\n${indent}Thresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `${indent}  ${passed} ${name}\n`;
  });
  
  return summary;
}
