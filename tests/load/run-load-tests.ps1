# PowerShell Load Test Runner
# Works from anywhere: right-click, command line, or any directory
# Usage: powershell -ExecutionPolicy Bypass -File tests\load\run-load-tests.ps1

# Enable strict error handling
$ErrorActionPreference = "Stop"

# Get the script's actual location
$ScriptDir = $PSScriptRoot
$CurrentDir = Get-Location

Write-Host ""
Write-Host "=== Load Test Runner ===" -ForegroundColor Cyan
Write-Host "Script Location: $ScriptDir" -ForegroundColor Gray
Write-Host "Working Directory: $CurrentDir" -ForegroundColor Gray
Write-Host ""

# Calculate paths based on script location
$ConfigPath = Join-Path $ScriptDir "config.json"
$ResultsPath = Join-Path $ScriptDir "results"
$AuthTestPath = Join-Path $ScriptDir "auth-token.js"
$PlannerTestPath = Join-Path $ScriptDir "planner-list.js"
$CampaignTestPath = Join-Path $ScriptDir "generate-campaign.js"
$QueueTestPath = Join-Path $ScriptDir "ai-queue-worker.js"

# Check if k6 is installed
Write-Host "Checking k6 installation..." -ForegroundColor Yellow
try {
    $k6Version = k6 version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ k6 is installed" -ForegroundColor Green
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: k6 is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install k6 from: https://k6.io/docs/getting-started/installation/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Windows installation:" -ForegroundColor Cyan
    Write-Host "  winget install k6" -ForegroundColor White
    Write-Host "  OR" -ForegroundColor White
    Write-Host "  choco install k6" -ForegroundColor White
    Write-Host ""
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

# Check if config.json exists
Write-Host "Checking config.json..." -ForegroundColor Yellow
if (-not (Test-Path $ConfigPath)) {
    Write-Host ""
    Write-Host "ERROR: config.json not found!" -ForegroundColor Red
    Write-Host "Expected location: $ConfigPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create config.json from your setup.js output" -ForegroundColor White
    Write-Host ""
    Write-Host "Run this first:" -ForegroundColor Cyan
    Write-Host "  k6 run tests/load/setup.js" -ForegroundColor White
    Write-Host ""
    Write-Host "Then save the JSON output to: tests\load\config.json" -ForegroundColor White
    Write-Host ""
    Write-Host "Example format:" -ForegroundColor Cyan
    Write-Host '{
  "testUser": {
    "email": "loadtest-xxxxx@example.com",
    "accessToken": "eyJhbGci...",
    "workspaceId": "00000000-0000-0000-0000-000000000000"
  }
}' -ForegroundColor White
    Write-Host ""
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}
Write-Host "✓ config.json found at: $ConfigPath" -ForegroundColor Green

# Load and parse config.json
Write-Host "Loading configuration..." -ForegroundColor Yellow
try {
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    
    # Validate config structure
    if (-not $config.testUser) {
        throw "config.json missing 'testUser' property"
    }
    if (-not $config.testUser.accessToken) {
        throw "config.json missing 'testUser.accessToken' property"
    }
    if (-not $config.testUser.workspaceId) {
        throw "config.json missing 'testUser.workspaceId' property"
    }
    
    Write-Host "✓ Configuration loaded successfully" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to parse config.json" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Config file location: $ConfigPath" -ForegroundColor Yellow
    Write-Host ""
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

# Set environment variables
$env:K6_TEST_ACCESS_TOKEN = $config.testUser.accessToken
$env:K6_TEST_WORKSPACE_ID = $config.testUser.workspaceId
$env:SUPABASE_URL = "https://lbunafpxuskwmsrraqxl.supabase.co"
$env:SUPABASE_ANON_KEY = "REDACTED_TOKEN_CONFIGURE_ON_TARGET"
$env:SUPABASE_SERVICE_ROLE_KEY = "REDACTED_TOKEN_CONFIGURE_ON_TARGET"

# Set load level (default: light)
if (-not $env:K6_LOAD_LEVEL) {
    $env:K6_LOAD_LEVEL = "light"
}

Write-Host ""
Write-Host "=== Starting Load Tests ===" -ForegroundColor Cyan
Write-Host "Load Level: $($env:K6_LOAD_LEVEL)" -ForegroundColor White
Write-Host "Access Token: $($env:K6_TEST_ACCESS_TOKEN.Substring(0, [Math]::Min(20, $env:K6_TEST_ACCESS_TOKEN.Length)))..." -ForegroundColor White
Write-Host "Workspace ID: $($env:K6_TEST_WORKSPACE_ID)" -ForegroundColor White
Write-Host ""

# Create results directory
if (-not (Test-Path $ResultsPath)) {
    New-Item -ItemType Directory -Path $ResultsPath | Out-Null
    Write-Host "Created results directory: $ResultsPath" -ForegroundColor Gray
}

# Track test results
$testResults = @()

# Function to run a test with error handling
function Run-K6Test {
    param(
        [string]$TestName,
        [string]$TestPath,
        [int]$TestNumber,
        [int]$TotalTests
    )
    
    Write-Host ""
    Write-Host "[$TestNumber/$TotalTests] Running $TestName test..." -ForegroundColor Yellow
    Write-Host "Test file: $TestPath" -ForegroundColor Gray
    
    try {
        k6 run $TestPath
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Host "✓ $TestName test completed successfully" -ForegroundColor Green
            return @{
                Name = $TestName
                Success = $true
                ExitCode = $exitCode
            }
        } else {
            Write-Host "✗ $TestName test failed with exit code: $exitCode" -ForegroundColor Red
            return @{
                Name = $TestName
                Success = $false
                ExitCode = $exitCode
            }
        }
    } catch {
        Write-Host "✗ $TestName test encountered an error:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return @{
            Name = $TestName
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

# Run all tests
$testResults += Run-K6Test -TestName "auth-token" -TestPath $AuthTestPath -TestNumber 1 -TotalTests 4
$testResults += Run-K6Test -TestName "planner-list" -TestPath $PlannerTestPath -TestNumber 2 -TotalTests 4
$testResults += Run-K6Test -TestName "generate-campaign" -TestPath $CampaignTestPath -TestNumber 3 -TotalTests 4
$testResults += Run-K6Test -TestName "ai-queue-worker" -TestPath $QueueTestPath -TestNumber 4 -TotalTests 4

# Display summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host ""

$successCount = ($testResults | Where-Object { $_.Success -eq $true }).Count
$failCount = ($testResults | Where-Object { $_.Success -eq $false }).Count

foreach ($result in $testResults) {
    if ($result.Success) {
        Write-Host "✓ $($result.Name)" -ForegroundColor Green
    } else {
        Write-Host "✗ $($result.Name)" -ForegroundColor Red
        if ($result.Error) {
            Write-Host "  Error: $($result.Error)" -ForegroundColor Red
        } elseif ($result.ExitCode) {
            Write-Host "  Exit Code: $($result.ExitCode)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Total: $($testResults.Count) tests | Success: $successCount | Failed: $failCount" -ForegroundColor White
Write-Host ""

if ($failCount -eq 0) {
    Write-Host "=== All Tests Passed! ===" -ForegroundColor Green
} else {
    Write-Host "=== Some Tests Failed ===" -ForegroundColor Red
}

Write-Host ""
Write-Host "Results saved in: $ResultsPath" -ForegroundColor Gray
Write-Host ""

# Keep window open
Read-Host -Prompt "Press Enter to exit"
