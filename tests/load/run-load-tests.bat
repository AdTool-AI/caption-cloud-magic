@echo off
setlocal enabledelayedexpansion

REM Check if config.json exists
if not exist tests\load\config.json (
    echo ERROR: config.json not found
    echo Please create tests\load\config.json from your setup.js output
    echo.
    echo Example format:
    echo {
    echo   "testUser": {
    echo     "email": "loadtest-xxxxx@example.com",
    echo     "accessToken": "eyJhbGci...",
    echo     "workspaceId": "00000000-0000-0000-0000-000000000000"
    echo   }
    echo }
    exit /b 1
)

:parse_config
REM Parse config.json and set environment variables
REM Temporarily disable delayed expansion for password parsing
setlocal disabledelayedexpansion

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "accessToken"') do (
    set ACCESS_TOKEN=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "testWorkspaceId"') do (
    set WORKSPACE_ID=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"email\""') do (
    set USER_EMAIL=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"password\""') do (
    set USER_PASSWORD=%%~a
)

REM Re-enable delayed expansion for the rest of the script
endlocal & (
    set "ACCESS_TOKEN=%ACCESS_TOKEN%"
    set "WORKSPACE_ID=%WORKSPACE_ID%"
    set "USER_EMAIL=%USER_EMAIL%"
    set "USER_PASSWORD=%USER_PASSWORD%"
)
setlocal enabledelayedexpansion

REM Trim quotes and spaces
set ACCESS_TOKEN=%ACCESS_TOKEN:"=%
set ACCESS_TOKEN=%ACCESS_TOKEN: =%
set WORKSPACE_ID=%WORKSPACE_ID:"=%
set WORKSPACE_ID=%WORKSPACE_ID: =%
set USER_EMAIL=%USER_EMAIL:"=%
set USER_EMAIL=%USER_EMAIL: =%
set USER_PASSWORD=%USER_PASSWORD:"=%
set USER_PASSWORD=%USER_PASSWORD: =%

REM Set load level (default: light) - respects existing K6_LOAD_LEVEL if set
if not defined K6_LOAD_LEVEL (
    set K6_LOAD_LEVEL=light
)
echo Load Level: %K6_LOAD_LEVEL%

REM Show expected VUs based on load level
if "%K6_LOAD_LEVEL%"=="light" (
    echo Expected VUs: 2-10 for light profile
)
if "%K6_LOAD_LEVEL%"=="medium" (
    echo Expected VUs: 20-100 for medium profile
)
if "%K6_LOAD_LEVEL%"=="heavy" (
    echo Expected VUs: 50-500 for heavy profile
)
echo.

REM Set Supabase credentials
set SUPABASE_URL=https://lbunafpxuskwmsrraqxl.supabase.co
set SUPABASE_ANON_KEY=REDACTED_TOKEN_CONFIGURE_ON_TARGET
set SUPABASE_SERVICE_ROLE_KEY=REDACTED_TOKEN_CONFIGURE_ON_TARGET

REM Validate required values
if "!ACCESS_TOKEN!"=="" (
    echo ERROR: Could not read accessToken from config.json
    exit /b 1
)
if "!WORKSPACE_ID!"=="" (
    echo ERROR: Could not read workspaceId from config.json
    exit /b 1
)
if "!USER_EMAIL!"=="" (
    echo ERROR: Could not read email from config.json
    exit /b 1
)
if "!USER_PASSWORD!"=="" (
    echo ERROR: Could not read password from config.json
    exit /b 1
)

set K6_TEST_ACCESS_TOKEN=%ACCESS_TOKEN%
set K6_TEST_WORKSPACE_ID=%WORKSPACE_ID%
set K6_TEST_USER_EMAIL=%USER_EMAIL%
set K6_TEST_USER_PASSWORD=%USER_PASSWORD%
set K6_TEST_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY%

REM Check if access token is valid (not placeholder)
if "%ACCESS_TOKEN%"=="will-be-generated-on-first-login" (
    echo.
    echo === Generating Access Token ===
    echo Running setup script to generate access token...
    node tests\load\setup-token.js
    if errorlevel 1 (
        echo.
        echo Failed to generate access token!
        pause
        exit /b 1
    )
    echo.
    echo Re-reading config.json...
    goto :parse_config
)

echo.
echo === K6 Environment Variables ===
echo User Email: %K6_TEST_USER_EMAIL%
echo Password Length: [HIDDEN]
echo Workspace ID: %K6_TEST_WORKSPACE_ID%
echo Access Token: %K6_TEST_ACCESS_TOKEN:~0,20%...
echo.
echo === Running Load Tests (Load Level: %K6_LOAD_LEVEL%) ===

REM Create results directory
if not exist tests\load\results mkdir tests\load\results

REM Initialize failed tests tracking
set FAILED_TESTS=

REM Run tests
echo [1/4] Running auth-token test...
k6 run -e K6_TEST_ACCESS_TOKEN="%K6_TEST_ACCESS_TOKEN%" -e K6_TEST_WORKSPACE_ID="%K6_TEST_WORKSPACE_ID%" -e K6_TEST_USER_EMAIL="%K6_TEST_USER_EMAIL%" -e K6_TEST_USER_PASSWORD="%K6_TEST_USER_PASSWORD%" -e SUPABASE_URL="%SUPABASE_URL%" -e SUPABASE_ANON_KEY="%SUPABASE_ANON_KEY%" -e SUPABASE_SERVICE_ROLE_KEY="%SUPABASE_SERVICE_ROLE_KEY%" -e K6_LOAD_LEVEL="%K6_LOAD_LEVEL%" tests/load/auth-token.js
if errorlevel 1 (
    echo ❌ Test FAILED
    set FAILED_TESTS=!FAILED_TESTS! auth-token
) else (
    echo ✓ Test PASSED
)

echo.
echo [2/4] Running planner-list test...
k6 run -e K6_TEST_ACCESS_TOKEN="%K6_TEST_ACCESS_TOKEN%" -e K6_TEST_WORKSPACE_ID="%K6_TEST_WORKSPACE_ID%" -e K6_TEST_USER_EMAIL="%K6_TEST_USER_EMAIL%" -e K6_TEST_USER_PASSWORD="%K6_TEST_USER_PASSWORD%" -e SUPABASE_URL="%SUPABASE_URL%" -e SUPABASE_ANON_KEY="%SUPABASE_ANON_KEY%" -e SUPABASE_SERVICE_ROLE_KEY="%SUPABASE_SERVICE_ROLE_KEY%" -e K6_LOAD_LEVEL="%K6_LOAD_LEVEL%" tests/load/planner-list.js
if errorlevel 1 (
    echo ❌ Test FAILED
    set FAILED_TESTS=!FAILED_TESTS! planner-list
) else (
    echo ✓ Test PASSED
)

echo.
echo [3/4] Running generate-campaign test...
k6 run -e K6_TEST_ACCESS_TOKEN="%K6_TEST_ACCESS_TOKEN%" -e K6_TEST_WORKSPACE_ID="%K6_TEST_WORKSPACE_ID%" -e K6_TEST_USER_EMAIL="%K6_TEST_USER_EMAIL%" -e K6_TEST_USER_PASSWORD="%K6_TEST_USER_PASSWORD%" -e SUPABASE_URL="%SUPABASE_URL%" -e SUPABASE_ANON_KEY="%SUPABASE_ANON_KEY%" -e SUPABASE_SERVICE_ROLE_KEY="%SUPABASE_SERVICE_ROLE_KEY%" -e K6_LOAD_LEVEL="%K6_LOAD_LEVEL%" tests/load/generate-campaign.js
if errorlevel 1 (
    echo ❌ Test FAILED
    set FAILED_TESTS=!FAILED_TESTS! generate-campaign
) else (
    echo ✓ Test PASSED
)

echo.
echo [4/4] Running ai-queue-worker test...
k6 run -e K6_TEST_ACCESS_TOKEN="%K6_TEST_ACCESS_TOKEN%" -e K6_TEST_WORKSPACE_ID="%K6_TEST_WORKSPACE_ID%" -e K6_TEST_USER_EMAIL="%K6_TEST_USER_EMAIL%" -e K6_TEST_USER_PASSWORD="%K6_TEST_USER_PASSWORD%" -e SUPABASE_URL="%SUPABASE_URL%" -e SUPABASE_ANON_KEY="%SUPABASE_ANON_KEY%" -e SUPABASE_SERVICE_ROLE_KEY="%SUPABASE_SERVICE_ROLE_KEY%" -e K6_LOAD_LEVEL="%K6_LOAD_LEVEL%" tests/load/ai-queue-worker.js
if errorlevel 1 (
    echo ❌ Test FAILED
    set FAILED_TESTS=!FAILED_TESTS! ai-queue-worker
) else (
    echo ✓ Test PASSED
)

echo.
echo === All Tests Complete ===

REM Check if any tests failed
if not "!FAILED_TESTS!"=="" (
    echo.
    echo ❌ FAILED TESTS:!FAILED_TESTS!
    echo.
    echo Check results in tests\load\results\
    exit /b 1
) else (
    echo.
    echo ✓ All tests PASSED
    echo Check results in tests\load\results\
)
