@echo off
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
where git >nul 2>nul || echo [!] Git nahi mila. Chalao: winget install Git.Git
call npm link >nul 2>nul
echo [ok] Ab har baar sirf likho: ccs
node "%~dp0cc.js" %*
exit /b %errorlevel%
:nonode
echo [!] Node.js nahi mila.
echo     Chalao: winget install OpenJS.NodeJS.LTS
echo     Phir VS Code / terminal band karke dobara kholo, aur install.bat chalao.
exit /b 1
