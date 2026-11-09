@echo off
rem ============================================================================
rem  DSH web profile launcher
rem
rem  Why this differs from the naive "node ... > log" form:
rem   1) APPEND, never truncate. The previous version used ">" which wiped the
rem      log on every start, destroying the FATAL ERROR / crash line from the
rem      run that had just died (2026-11-05 incident: cause unrecoverable).
rem   2) ROTATE at 10 MB so appending cannot grow without bound.
rem   3) CAP THE V8 HEAP. On this 7.8 GB host a runaway heap produced a silent
rem      0xC0000409 fastfail (no log, no Windows error report). An explicit cap
rem      makes V8 refuse first and print a readable "JavaScript heap out of
rem      memory" line instead. Raise the number if you see clean OOM aborts at
rem      a point where the machine clearly still had RAM.
rem ============================================================================
setlocal
cd /d C:\study\deepseek-harness

set "DSH_LOG=%USERPROFILE%\.dsh\dsh-boot.log"
set "DSH_PREV=%USERPROFILE%\.dsh\dsh-boot.prev.log"
set "DSH_LOG_MAX=10485760"
set "DSH_HEAP_MB=2048"

if exist "%DSH_LOG%" (
  for %%F in ("%DSH_LOG%") do if %%~zF GTR %DSH_LOG_MAX% move /Y "%DSH_LOG%" "%DSH_PREV%" >nul 2>&1
)

rem ASCII timestamp on purpose: %DATE% is locale-dependent and would write GBK
rem bytes (e.g. the Chinese weekday) into a UTF-8 log as mojibake.
set "DSH_TS=unknown"
for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH:mm:ssK"') do set "DSH_TS=%%I"

>>"%DSH_LOG%" echo.
>>"%DSH_LOG%" echo ==== dsh boot %DSH_TS% (heap cap %DSH_HEAP_MB% MB) ====

node --max-old-space-size=%DSH_HEAP_MB% --import tsx/esm apps\cli\lib\bin.js --profile web >>"%DSH_LOG%" 2>&1
endlocal