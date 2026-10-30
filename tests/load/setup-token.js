// Setup script to generate access token for load tests
// Run this once before running load tests: node tests/load/setup-token.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const SUPABASE_URL = 'https://lbunafpxuskwmsrraqxl.supabase.co';
const ANON_KEY = 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';

async function login(email, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const url = new URL(`${SUPABASE_URL}/auth/v1/token?grant_type=password`);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Login failed: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔧 Load Test Token Setup\n');

  // Read config.json
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ config.json not found!');
    console.error('Please create tests/load/config.json with email and password');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  
  if (!config.email || !config.password) {
    console.error('❌ config.json missing email or password');
    process.exit(1);
  }

  console.log(`📧 Email: ${config.email}`);
  console.log('🔐 Logging in to generate access token...\n');

  try {
    const authResponse = await login(config.email, config.password);
    
    // Update config with access token
    config.accessToken = authResponse.access_token;
    
    // Write back to config.json
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    console.log('✅ Access token generated and saved to config.json');
    console.log(`🎫 Token: ${authResponse.access_token.substring(0, 20)}...`);
    console.log(`⏰ Expires: ${new Date(authResponse.expires_at * 1000).toLocaleString()}\n`);
    console.log('✨ Ready to run load tests! Execute: .\\tests\\load\\run-load-tests.bat');
    
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }
}

main();
