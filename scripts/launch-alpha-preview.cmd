@echo off
setlocal enabledelayedexpansion

REM ----- Configuration -----
set "REPO_DIR=C:\GitRoot\EmilysGame"
set "LLM_URL=http://localhost:8002"
set "LLM_HEALTH_ENDPOINT=http://localhost:8002/health"
set "BITNET_STARTERDIR=C:\AI-Development\BitNet_Standalone\"
set "BITNET_STARTERSCRIPT=Start-BitNet-CPU.ps1"
set "BITNET_STARTER=C:\AI-Development\BitNet_Standalone\Start-BitNet-CPU.ps1"
set "BROWSER_URL=http://localhost:4173/"

cd /d "%REPO_DIR%"
echo.
echo ============================================================
echo  Emily's Game - Alpha ^(preview^) launcher, please wait...
echo ============================================================
echo.

REM ----- Check Node.js -----
echo Checking Node.js availability...
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found in PATH. Install Node 16+ and try again.
  pause
  exit /b 1
)

REM ----- Check LLM Health -----
echo.
echo Checking LLM health at %LLM_HEALTH_ENDPOINT%...
call powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%LLM_HEALTH_ENDPOINT%' -TimeoutSec 10 -Method GET -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo [FAIL] LLM unavailable
  echo.
  echo WARNING: LLM not responding at %LLM_URL%.
  echo Attempting to start BitNet via PowerShell script...
  echo %BITNET_STARTER%
  echo.
  
  if not exist "%BITNET_STARTER%" (
    echo ERROR: BitNet starter script not found at:
    echo        %BITNET_STARTER%
    echo.
    echo Please start the LLM manually or verify the path above.
    pause
    exit /b 1
  )
  
  REM Start BitNet in a new window
  echo Starting local LLM, please wait...
  start "BitNet LocalLLM" /min pwsh.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%BITNET_STARTER%"
  
  
@REM   echo Waiting 15 seconds for BitNet to start...
@REM   timeout /t 15 /nobreak
REM Here we need a loop that checks the LLM health every 5 seconds and waits until it's up, rather than a fixed timeout
:wait_for_llm
  echo Waiting for LLM to be ready, please wait...
  call powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%LLM_HEALTH_ENDPOINT%' -TimeoutSec 10 -Method GET -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto wait_for_llm
  )

@REM   REM Check again
@REM   echo.
@REM   echo Checking LLM health again...
@REM   call powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%LLM_HEALTH_ENDPOINT%' -TimeoutSec 10 -Method GET -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
@REM   if errorlevel 1 (
@REM     echo ERROR: LLM still not responding after BitNet startup attempt.
@REM     echo Please check the BitNet window for errors and try again.
@REM     pause
@REM     exit /b 1
@REM   )
  echo [OK] LLM is now reachable, continuing with game launch...
) else (
  echo [OK] LLM is reachable.
)

echo [OK] LLM is ready.
echo.

REM ----- Check Dependencies -----
echo Checking dependencies ^(node_modules^)...
if not exist node_modules (
  echo node_modules not found - running npm ci ^(may take a few minutes^)...
  call npm ci
  if errorlevel 1 (
    echo npm ci failed. Fix npm errors and re-run this script.
    pause
    exit /b 1
  )
)

REM ----- Build -----
echo.
echo Setting LLM endpoint to %LLM_URL%...
set "VITE_LLM_ENDPOINT=%LLM_URL%"

echo Building production assets (includes WebAssembly build)...
call npm run build
if errorlevel 1 (
  echo Build failed. See errors above.
  pause
  exit /b 1
)

REM ----- Start Preview -----
echo.
echo Starting preview server...
start "Emily's Game Preview" cmd /k "cd /d %REPO_DIR% && set VITE_LLM_ENDPOINT=%VITE_LLM_ENDPOINT% && npm run preview"

echo Waiting 3 seconds before opening browser...
timeout /t 3 /nobreak

echo Opening browser at %BROWSER_URL%...
start "Emily's Game ALPHA" "%BROWSER_URL%"

echo.
echo ============================================================
echo  Launch complete!
echo ============================================================
echo  - Preview server should open in your browser shortly
echo  - If the browser doesn't open, navigate to %BROWSER_URL% manually
echo.
echo  - Please keep the BitNet window open in the background.
echo  - LLM endpoint for debugging: %LLM_URL%
echo.
echo  Have fun playing the alpha preview!
echo ============================================================
echo.

endlocal
REM exit /b 0