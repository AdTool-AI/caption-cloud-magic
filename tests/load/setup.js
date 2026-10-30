import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// This script sets up test data for load tests
// Run once before executing load tests: k6 run tests/load/setup.js

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
  const serviceRoleKey = __ENV.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set!');
    exec.test.abort('Missing service role key');
    return;
  }
  
  console.log('\n=== Load Test Setup Starting ===\n');
  
  // Generate unique test email
  const timestamp = Date.now();
  const testEmail = `loadtest-${timestamp}@example.com`;
  const testPassword = `LoadTest123!${timestamp}`;
  
  console.log(`Creating test user: ${testEmail}`);
  
  // 1. Create test user
  const signupPayload = JSON.stringify({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        language: 'en'
      }
    }
  });
  
  const signupResponse = http.post(
    `${supabaseUrl}/auth/v1/signup`,
    signupPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
    }
  );
  
  const signupSuccess = check(signupResponse, {
    'user created': (r) => r.status === 200,
    'has user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.user && body.user.id;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!signupSuccess) {
    console.error(`Failed to create user: ${signupResponse.status} - ${signupResponse.body}`);
    exec.test.abort('User creation failed');
    return;
  }
  
  const userData = JSON.parse(signupResponse.body);
  const userId = userData.user.id;

  // If no session returned (email confirmation required), login explicitly
  let accessToken;
  if (userData.session && userData.session.access_token) {
    accessToken = userData.session.access_token;
    console.log('✓ Session obtained from signup');
  } else {
    console.log('⚠ No session from signup, performing login...');
    
    // Login to get session
    const loginResponse = http.post(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
      {
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (loginResponse.status !== 200) {
      console.error(`Login failed: ${loginResponse.status} - ${loginResponse.body}`);
      exec.test.abort('Login failed');
      return;
    }
    
    const loginData = JSON.parse(loginResponse.body);
    accessToken = loginData.access_token;
    console.log('✓ Session obtained from login');
  }

  console.log(`✓ User created: ${userId}`);
  console.log(`✓ Access token obtained`);
  
  // 2. Upgrade test user to ENTERPRISE plan via edge function
  console.log('Upgrading test user to ENTERPRISE plan...');
  const upgradeResponse = http.post(
    `${supabaseUrl}/functions/v1/upgrade-to-enterprise`,
    JSON.stringify({ userEmail: testEmail }),
    {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      timeout: '30s',
    }
  );

  const planUpgradeSuccess = check(upgradeResponse, {
    'plan upgraded': (r) => r.status === 200,
    'has success response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch (e) {
        return false;
      }
    },
  });

  if (!planUpgradeSuccess) {
    console.error(`Plan upgrade failed: ${upgradeResponse.status} - ${upgradeResponse.body}`);
    exec.test.abort('Plan upgrade failed');
    return;
  }

  console.log('✓ Plan upgraded to ENTERPRISE');

  // 3. Wait for workspace creation (with retry logic)
  console.log('Checking for workspace...');
  let workspace = null;
  let retries = 0;
  const maxRetries = 10;

  while (!workspace && retries < maxRetries) {
    const workspaceResponse = http.get(
      `${supabaseUrl}/rest/v1/workspace_members?user_id=eq.${userId}&select=workspace_id`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (workspaceResponse.status === 200) {
      const data = JSON.parse(workspaceResponse.body);
      if (data.length > 0) {
        workspace = data[0].workspace_id;
        console.log(`✓ Workspace found: ${workspace}`);
        break;
      }
    }
    
    retries++;
    console.log(`⏳ Waiting for workspace creation (attempt ${retries}/${maxRetries})...`);
    sleep(1);
  }

  // 4. Fallback: Create workspace manually if trigger failed
  if (!workspace) {
    console.log('⚠️ Creating workspace manually (trigger failed)...');
    
    // Create workspace
    const createWorkspaceResponse = http.post(
      `${supabaseUrl}/rest/v1/workspaces`,
      JSON.stringify({
        owner_id: userId,
        name: 'Load Test Workspace',
        description: 'Auto-created for load testing',
        is_enterprise: true
      }),
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
      }
    );
    
    const workspaceCreated = check(createWorkspaceResponse, {
      'workspace created': (r) => r.status === 201,
    });

    if (!workspaceCreated) {
      console.error(`Workspace creation failed: ${createWorkspaceResponse.status} - ${createWorkspaceResponse.body}`);
      exec.test.abort('Workspace creation failed');
      return;
    }
    
    const workspaceData = JSON.parse(createWorkspaceResponse.body);
    workspace = workspaceData[0].id;
    console.log(`✓ Workspace created manually: ${workspace}`);
    
    // Add member
    const addMemberResponse = http.post(
      `${supabaseUrl}/rest/v1/workspace_members`,
      JSON.stringify({
        workspace_id: workspace,
        user_id: userId,
        role: 'owner'
      }),
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
      }
    );
    
    const memberAdded = check(addMemberResponse, {
      'member added': (r) => r.status === 201 || r.status === 204,
    });

    if (!memberAdded) {
      console.error(`Member addition failed: ${addMemberResponse.status} - ${addMemberResponse.body}`);
      exec.test.abort('Member addition failed');
      return;
    }

    console.log('✓ Workspace member added');
  }
  
  console.log('Creating test projects...');
  
  const projectsPayload = JSON.stringify([
    {
      user_id: userId,
      name: 'Load Test Campaign 1',
    },
    {
      user_id: userId,
      name: 'Load Test Campaign 2',
    },
    {
      user_id: userId,
      name: 'Load Test Campaign 3',
    },
  ]);
  
  const projectsResponse = http.post(
    `${supabaseUrl}/rest/v1/projects`,
    projectsPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal',
      },
    }
  );
  
  check(projectsResponse, {
    'projects created': (r) => r.status === 201,
  });
  
  console.log(`✓ Test projects created`);
  
  // 5. Generate config file content
  const config = {
    testUser: {
      email: testEmail,
      password: testPassword,
      userId: userId,
      accessToken: accessToken,
    },
    testWorkspaceId: workspaceId,
    supabaseUrl: supabaseUrl,
    anonKey: anonKey,
    loadLevels: {
      light: {
        stages: [
          { duration: '30s', target: 10 },
          { duration: '1m', target: 50 },
          { duration: '30s', target: 0 },
        ],
        description: 'Light load - 10-50 concurrent users',
      },
      medium: {
        stages: [
          { duration: '1m', target: 50 },
          { duration: '2m', target: 100 },
          { duration: '1m', target: 200 },
          { duration: '1m', target: 0 },
        ],
        description: 'Medium load - 50-200 concurrent users',
      },
      heavy: {
        stages: [
          { duration: '1m', target: 100 },
          { duration: '2m', target: 500 },
          { duration: '2m', target: 1000 },
          { duration: '1m', target: 0 },
        ],
        description: 'Heavy load - 100-1000 concurrent users',
      },
    },
    createdAt: new Date().toISOString(),
  };
  
  console.log('\n=== Setup Complete ===\n');
  console.log('Save the following content to tests/load/config.json:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('\n=== Configuration ===');
  console.log(`Test User: ${testEmail}`);
  console.log(`User ID: ${userId}`);
  console.log(`Workspace ID: ${workspaceId || 'Will be created automatically'}`);
  console.log(`Access Token: ${accessToken.substring(0, 20)}...`);
  console.log('\nYou can now run load tests using this configuration.');
  console.log('Set environment variables:');
  console.log(`export K6_TEST_USER_EMAIL='${testEmail}'`);
  console.log(`export K6_TEST_USER_PASSWORD='${testPassword}'`);
  console.log(`export K6_TEST_ACCESS_TOKEN='${accessToken}'`);
  console.log(`export K6_TEST_WORKSPACE_ID='${workspaceId}'`);
}