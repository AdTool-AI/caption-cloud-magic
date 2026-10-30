@echo off
setlocal enabledelayedexpansion

echo ========================================
echo 2000 VU Load Test Runner
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

echo [4/4] Running 2000 VU test...
echo.
echo ========================================
echo Test: planner-list-2000.js
echo Target: 2000 Virtual Users
echo Duration: ~10 minutes
echo ========================================
echo.

REM Create results directory
if not exist "tests\load\results" mkdir tests\load\results

REM Run the test
k6 run ^
  -e K6_TEST_ACCESS_TOKEN=!K6_TEST_ACCESS_TOKEN! ^
  -e K6_TEST_WORKSPACE_ID=!K6_TEST_WORKSPACE_ID! ^
  -e SUPABASE_URL=!SUPABASE_URL! ^
  -e SUPABASE_ANON_KEY=!SUPABASE_ANON_KEY! ^
  tests/load/planner-list-2000.js

if !ERRORLEVEL! EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS: 2000 VU test completed!
    echo ========================================
    echo.
    echo Next step: Run 3000 VU test
    echo   .\tests\load\run-3000vu-test.bat
    echo.
) else (
    echo.
    echo ========================================
    echo FAILED: 2000 VU test encountered errors
    echo ========================================
    echo.
    echo Check the output above for details
    echo Review results in: tests\load\results\
    echo.
    exit /b 1
)

endlocal
