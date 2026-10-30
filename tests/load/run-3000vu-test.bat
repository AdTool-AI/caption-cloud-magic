@echo off
setlocal enabledelayedexpansion

echo ========================================
echo 3000 VU Load Test Runner (ULTRA)
echo ========================================
echo.

REM Check if config.json exists
if not exist "tests\load\config.json" (
    echo ERROR: tests\load\config.json not found!
    echo.
    echo Please run the setup first:
    echo   k6 run tests/load/setup.js
    echo.
    echo Then copy the JSON output to tests\load\config.json
    exit /b 1
)

echo [1/4] Reading configuration...

REM Parse config.json
for /f "delims=" %%i in ('powershell -Command "Get-Content tests\load\config.json | ConvertFrom-Json | Select-Object -ExpandProperty accessToken"') do set ACCESS_TOKEN=%%i
for /f "delims=" %%i in ('powershell -Command "Get-Content tests\load\config.json | ConvertFrom-Json | Select-Object -ExpandProperty workspaceId"') do set WORKSPACE_ID=%%i
for /f "delims=" %%i in ('powershell -Command "Get-Content tests\load\config.json | ConvertFrom-Json | Select-Object -ExpandProperty email"') do set USER_EMAIL=%%i
for /f "delims=" %%i in ('powershell -Command "Get-Content tests\load\config.json | ConvertFrom-Json | Select-Object -ExpandProperty password"') do set USER_PASSWORD=%%i

REM Supabase credentials
set SUPABASE_URL=https://lbunafpxuskwmsrraqxl.supabase.co
set SUPABASE_ANON_KEY=REDACTED_TOKEN_CONFIGURE_ON_TARGET

echo [2/4] Validating configuration...

REM Validate required values
if "!ACCESS_TOKEN!"=="" (
    echo ERROR: accessToken not found in config.json
    exit /b 1
)
if "!WORKSPACE_ID!"=="" (
    echo ERROR: workspaceId not found in config.json
    exit /b 1
)

echo   Access Token: !ACCESS_TOKEN:~0,20!...
echo   Workspace ID: !WORKSPACE_ID!

echo [3/4] Setting environment variables...

REM Export for k6
set K6_TEST_ACCESS_TOKEN=!ACCESS_TOKEN!
set K6_TEST_WORKSPACE_ID=!WORKSPACE_ID!
set K6_TEST_USER_EMAIL=!USER_EMAIL!
set K6_TEST_USER_PASSWORD=!USER_PASSWORD!

echo [4/4] Running 3000 VU test...
echo.
echo ========================================
echo Test: planner-list-3000.js
echo Target: 3000 Virtual Users
echo Duration: ~12 minutes
echo WARNING: This is a stress test!
echo ========================================
echo.

REM Create results directory
if not exist "tests\load\results" mkdir tests\load\results

REM Check if test file exists
if not exist "tests\load\planner-list-3000.js" (
    echo ERROR: tests\load\planner-list-3000.js not found!
    echo.
    echo This test file needs to be created first.
    echo It should be similar to planner-list-2000.js but with:
    echo   - Target: 3000 VUs
    echo   - Threshold: P95 ^< 1500ms
    echo   - Longer ramp-up time
    echo.
    exit /b 1
)

REM Run the test
k6 run ^
  -e K6_TEST_ACCESS_TOKEN=!K6_TEST_ACCESS_TOKEN! ^
  -e K6_TEST_WORKSPACE_ID=!K6_TEST_WORKSPACE_ID! ^
  -e SUPABASE_URL=!SUPABASE_URL! ^
  -e SUPABASE_ANON_KEY=!SUPABASE_ANON_KEY! ^
  tests/load/planner-list-3000.js

if !ERRORLEVEL! EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS: 3000 VU test completed!
    echo ========================================
    echo.
    echo You have validated the system at maximum scale!
    echo Review detailed metrics in: tests\load\results\
    echo.
) else (
    echo.
    echo ========================================
    echo FAILED: 3000 VU test encountered errors
    echo ========================================
    echo.
    echo This is expected if the system hits its limits.
    echo Check the output above for bottlenecks:
    echo   - Database connection pool exhaustion
    echo   - Edge function cold starts
    echo   - Rate limiting
    echo   - Query timeouts
    echo.
    echo Review results in: tests\load\results\
    echo.
    exit /b 1
)

endlocal
