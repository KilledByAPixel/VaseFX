rem Simple build script for Shortray by Frank Force

set NAME=pottery
set BUILD_FOLDER=build
set BUILD_FILENAME=%NAME%.min.js
set BUILD_HTML_FILENAME=%NAME%.min.html

rem remove old files
del %BUILD_FILENAME%
del %BUILD_HTML_FILENAME%

rem add your game's files to include here
type utils.js >> %BUILD_FILENAME%
type scene.js >> %BUILD_FILENAME%
type shader.js >> %BUILD_FILENAME%
type webgl.js >> %BUILD_FILENAME%
type input.js >> %BUILD_FILENAME%
type game.js >> %BUILD_FILENAME%
echo. >> %BUILD_FILENAME%

rem minify code with closure
move %BUILD_FILENAME% %BUILD_FILENAME%.temp
call npx google-closure-compiler --js=%BUILD_FILENAME%.temp --js_output_file=%BUILD_FILENAME% --compilation_level=ADVANCED --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
del %BUILD_FILENAME%.temp

rem more minification with uglify or terser (they both do about the same)
call npx uglifyjs -o %BUILD_FILENAME% --compress --mangle -- %BUILD_FILENAME%
rem call terser -o %BUILD_FILENAME% --compress --mangle -- %BUILD_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem build the html, you can add html header and footers here
rem type ..\header.html >> index.html
rem echo ^<body^>^<meta charset=utf-8^>^<script^> >> %BUILD_HTML_FILENAME%
type header.html >> %BUILD_HTML_FILENAME%
type %BUILD_FILENAME% >> %BUILD_HTML_FILENAME%
echo ^</script^> >> %BUILD_HTML_FILENAME%
echo ^</body^> >> %BUILD_HTML_FILENAME%

rmdir /s /q %BUILD_FOLDER%
mkdir %BUILD_FOLDER%
move %BUILD_HTML_FILENAME% %BUILD_FOLDER%\index.html
move %BUILD_FILENAME% %BUILD_FOLDER%\%BUILD_FILENAME%
del %BUILD_FOLDER%\%BUILD_FILENAME%

rem pause to see result