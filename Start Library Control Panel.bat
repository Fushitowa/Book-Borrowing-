@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -c "import tkinter" >nul 2>nul
  if errorlevel 1 goto missing_python
  py -3 control_panel\main.py
) else (
  where python >nul 2>nul
  if errorlevel 1 goto missing_python
  python -c "import tkinter" >nul 2>nul
  if errorlevel 1 goto missing_python
  python control_panel\main.py
)
if errorlevel 1 pause
goto end

:missing_python
echo Python 3.10 or newer with Tkinter is required to run this control panel.
echo Install Python with Tcl/Tk enabled, then run this file again.
pause

:end
