@echo off
rem A portable command entry has to be a file the host's shell can execute, and
rem that file is what the kernel contains inside the package root. It only
rem forwards to the fixture's Node script, which owns the observable behavior.
node "%~dp0stamp.mjs"
