'use strict';

let glContext;
let glVertexShader, glPixelShader, glShaderProgram;
let textureSceneData, canvas_sceneData;
let textureNoise;

// size of the repeating 3d noise texture that replaces procedural noise
const noiseTextureSize = 64;

let shaderReady = false;
function isShaderReady(context)
{
    if (shaderReady)
        return true; // sticky: never re-check once ready
    if (!context)
        return false;

    const asyncShaderCompiler = getWebGLAsync(context);
    let isReady;
    if (asyncShaderCompiler)
    {
        // poll the driver for non-blocking compile status
        isReady = context.getProgramParameter(glShaderProgram, asyncShaderCompiler['COMPLETION_STATUS_KHR']);
    }
    else
    {
        // Without KHR_parallel_shader_compile (older Firefox/Safari/etc.) the
        // driver compiles synchronously on first useProgram/drawArrays. Defer
        // that first use by ~1s of wall time so the loading screen has a
        // chance to paint before the page locks up.
        isReady = shaderBuildTime && (Date.now() - shaderBuildTime > 1000);
    }

    // Safety net: if polling has been false for ages, the async extension may
    // be reported supported but actually broken (seen on some Firefox builds).
    // Force render and let the synchronous draw call kick the compile.
    if (!isReady && shaderBuildTime && Date.now() - shaderBuildTime > 15000)
    {
        console.warn('Shader compile polling timed out, forcing render.');
        isReady = true;
    }

    if (isReady)
    {
        shaderReady = true;
        if (shaderBuildTime)
        {
            const time = (Date.now() - shaderBuildTime)/1e3;
            console.log(`Shader built in ${time.toFixed(2)} seconds.`);
            shaderBuildTime = 0;
        }
    }
    return isReady;
}

const getWebGLAsync = context => context && context.getExtension && context.getExtension('KHR_parallel_shader_compile');

let shaderBuildTime;
let glFrameCount = 0;

let ambientScale = 1, light1Scale = 1, light2Scale = 1;

function glInit()
{
    canvas_sceneData = document.createElement('canvas');
    canvas_sceneData.width = objectDataCount;
    canvas_sceneData.height = 32;

    shaderBuildTime = Date.now();
    glContext = glCanvas.getContext('webgl2', {preserveDrawingBuffer: true});
    const context = glContext;
    if (getWebGLAsync(context))
        console.log('Building shader in background...');

    // create vertex buffer
    const vertexBuffer = context.ARRAY_BUFFER;
    context.bindBuffer(vertexBuffer, context.createBuffer());
    context.bufferData(vertexBuffer, new Int8Array([-3,1,1,-3,1,1]), context.STATIC_DRAW);
    context.enableVertexAttribArray(0);
    context.vertexAttribPointer(0, 2, context.BYTE, 0, 0, 0); // 2D vertex

    // create vertex shader
    glVertexShader = context.createShader(context.VERTEX_SHADER);
    if (!glVertexShader)
    {
        failMessage();
        return;
    }
    context.shaderSource(glVertexShader, '#version 300 es\nin vec4 p;void main(){gl_Position=p;}');
    context.compileShader(glVertexShader);

    /*let shaderCode = `
    void mainImage(out vec4 fragColor, vec2 fragCoord)
    {
        vec4 test = objectData[1];
        fragColor = test;
        //fragColor = vec4(cameraPosition);
    }`*/

    let testCode =
    `void mainImage(out vec4 c, vec2 p)
    {
    for(ivec4 b = ivec4(c -= c); (b.x^b.y&b.z)%99 > b.z-9;)
        b = ivec4((p/5e2-.5)*c.a + iTime/.1, ++c);
    c /= 99.; }  `

    // create pixel shader
    glPixelShader = context.createShader(context.FRAGMENT_SHADER);
    if (!glPixelShader)
    {
        failMessage();
        return;
    }
    context.shaderSource(glPixelShader,
        '#version 300 es\n' +
        'precision highp float;\n' +
        `#define objectDataCount (${objectDataCount})\n` +
        `#define vaseMaxHeight (${shaderFloat(vaseMaxHeight)})\n` +
        `#define vaseMaxRadius (${shaderFloat(vaseMaxRadius)})\n` +
        `#define testMountains (${!!testMountains})\n` +
        `#define noiseTextureSize (${shaderFloat(noiseTextureSize)})\n` +
        //`uniform vec4 objectData[objectDataCount];\n` +
        'uniform vec4 vaseColor1;\n' +
        'uniform vec4 vaseColor2;\n' +
        'uniform vec4 backgroundColor1;\n' +
        'uniform vec4 backgroundColor2;\n' +
        'uniform vec4 sceneInfo;\n' +
        'uniform vec4 sceneColor;\n' +
        'uniform vec4 materialEffects;\n' +
        'uniform vec4 materialEffects2;\n' +
        'uniform vec4 handleInfo;\n' +
        'uniform vec4 handleInfo2;\n' +
        'uniform vec4 sceneEffects;\n' +
        'uniform vec4 sceneEffects2;\n' +
        'uniform vec4 vaseInfo;\n' +
        'uniform vec4 vaseInfo2;\n' +
        'uniform vec4 vaseInfo3;\n' +
        'uniform vec4 vaseInfo4;\n' +
        'uniform vec4 borderInfo;\n' +
        'uniform vec4 borderColor;\n' +
        'uniform vec4 lightAmbient;\n' +
        'uniform vec4 lightDirection1;\n' +
        'uniform vec4 lightColor1;\n' +
        'uniform vec4 lightDirection2;\n' +
        'uniform vec4 lightColor2;\n' +
        'uniform vec4 toolPos;\n' +
        'uniform vec4 cameraPosition;\n' +
        'uniform vec4 cameraRotation;\n' +
        'uniform vec4 iResolution;\n' +
        'uniform float iTime;\n' +
        'uniform int iFrame;\n' +
        'uniform vec4 iMouse;\n' +
        `uniform sampler2D iChannel0;`+
        'uniform highp sampler3D iChannel1;\n' +
        'out vec4 outColor;\n' +
        shaderCode + '\n' +
        'void main(){mainImage(outColor,gl_FragCoord.xy);outColor.a=1.;}'
    );
    context.compileShader(glPixelShader);

    // init shader program
    glShaderProgram = context.createProgram();
    context.attachShader(glShaderProgram, glVertexShader);
    context.attachShader(glShaderProgram, glPixelShader);
    context.linkProgram(glShaderProgram);

    // create textures
    context.activeTexture(context.TEXTURE0);
    textureSceneData = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, textureSceneData);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);

    // 3d noise texture - one hardware trilinear fetch replaces the 8 hashes
    // of procedural value noise. fixed seed keeps vases deterministic.
    const noiseRandom = new Random(1234567);
    const noiseData = new Uint8Array(noiseTextureSize**3 * 4);
    for (let i = 0; i < noiseData.length; ++i)
        noiseData[i] = noiseRandom.float(256);
    context.activeTexture(context.TEXTURE1);
    textureNoise = context.createTexture();
    context.bindTexture(context.TEXTURE_3D, textureNoise);
    context.texImage3D(context.TEXTURE_3D, 0, context.RGBA8,
        noiseTextureSize, noiseTextureSize, noiseTextureSize, 0,
        context.RGBA, context.UNSIGNED_BYTE, noiseData);
    context.texParameteri(context.TEXTURE_3D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_3D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    // wrap mode defaults to REPEAT so the noise tiles seamlessly
}

function glUpdateDataTexture()
{
    const context = glContext;

    // update scene data
    const vaseSmoothSmooth = smoothVaseData(vase.smoothData);
    const vaseRadiusSmooth = smoothVaseData(vase.radiusData);
    //vaseRadiusSmooth[objectDataCount-2]=vaseRadiusSmooth[1]=0
    //vaseRadiusSmooth[objectDataCount-1]=vaseRadiusSmooth[0]=1
    const context_sceneData = canvas_sceneData.getContext('2d');
    canvas_sceneData.width = canvas_sceneData.height = objectDataCount;
    for(let i = 0; i < objectDataCount; ++i)
    {
        // spit up integer and fract part for more accuracy
        const x = vaseSmoothSmooth[i];
        const y = vaseRadiusSmooth[i] / vaseMaxRadius;
        const z = (255*y) % 1;
        context_sceneData.fillStyle = `rgb(${255*x|0},${255*y|0},${255*z|0})`;
        context_sceneData.fillRect(0,i,1e3,1);
    }
    context.activeTexture(context.TEXTURE0);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, canvas_sceneData);
}

function glRender()
{
    const context = glContext;
    context.viewport(0, 0, glCanvas.width, glCanvas.height);
    glUpdateDataTexture();

    // set uniforms
    context.useProgram(glShaderProgram);
    const vaseWarp = getFXParamNumber('vaseWarp');
    const vaseRandomSeed = 1.+1e3*vaseWarp;
    const vaseRandom = new Random(vaseRandomSeed + globalSeed);

    //let uniformConsts = '';
    function setUniform4f(name, ...values)
    {
        context.uniform4f(U(name), ...values);
        //uniformConsts += `vec4 ${name}=vec4(${values});\n`;
    }
    function setUniform1f(name, value)
    {
        context.uniform1f(U(name), value);
        //uniformConsts += `float ${name}=${shaderFloat(value)};\n`;
    }
    function setUniform1i(name, value)
    {
        context.uniform1i(U(name), value);
    }

    // standard
    const U = (name) => context.getUniformLocation(glShaderProgram, name);
    setUniform4f('iResolution', glCanvas.width, glCanvas.height, 1, 1);
    setUniform1f('iTime', time);
    setUniform1i('iFrame', glFrameCount++);
    setUniform4f('iMouse', mousePos.x, mousePos.y, mouseMove.x, mouseMove.y);
    setUniform1i('iChannel0', 0);
    setUniform1i('iChannel1', 1);

    // camera   
    setUniform4f('cameraPosition', ...cameraPosition.getArray(),cameraZoom);
    setUniform4f('cameraRotation', ...cameraRotation.getArray(),0);

    // border
    const borderSeed = getFXParamNumber('borderSeed');
    const borderRandom = new Random(borderSeed + globalSeed);
    let borderSize = getBorderSize();
    let borderNoise = borderRandom.float();
    let borderNoiseScale = borderRandom.float(.01,.4);
    const borderFXSeed = borderRandom.float(9);
    if (borderSeed %5==0)
        borderNoise = borderNoiseScale = 0;

    // pick border color from mixture of colors used
    let borderColor;
    if (!showBorder)
    {
        borderColor = new Color(0,0,0,0);
        borderSize = borderNoise = 0;
    }
    else
    {
        const vaseColor1 = getFXParamColor('vaseColor1',0);
        const vaseColor2 = getFXParamColor('vaseColor2',0);
        const backgroundColor1 = getFXParamColor('backgroundColor1',0);
        const backgroundColor2 = getFXParamColor('backgroundColor2',0);
        const sceneColor = getFXParamColor('sceneColor',0);
        let getColor =()=>
        {
            let r = borderRandom.int(7);
            if (r == 0)
                return vaseColor1;
            else if (r == 1)
                return vaseColor2;
            else if (r == 2)
                return backgroundColor1;
            else if (r == 3)
                return backgroundColor2;
            else if (r == 4)
                return sceneColor;
            else if (r == 5)
                return new Color(1,1,1);
            return new Color();
        }
    
        let c1 = getColor();
        let c2 = getColor();
        borderColor = c1.mix(c2, borderRandom.float());
        if (borderRandom.bool(.04))
            borderColor = new Color(1,1,1);
        else if (borderRandom.bool(.04))
            borderColor = new Color();
        else if (borderRandom.bool(.04))
            borderColor = c1;
    }

    setUniform4f('borderInfo', borderSize*glCanvas.height, borderNoise, borderNoiseScale, borderFXSeed);
    setUniform4f('borderColor', ...borderColor.getArray());

    const vaseColor1 = getFXParamColor('vaseColor1');
    const vaseColor2 = getFXParamColor('vaseColor2');
    const backgroundColor1 = getFXParamColor('backgroundColor1');
    const backgroundColor2 = getFXParamColor('backgroundColor2');
    const sceneColor = getFXParamColor('sceneColor');
    
    // vase
    const vaseSeed = vaseRandom.float(99);
    setUniform4f('vaseInfo', vase.thickness, vase.topHeight, testMountains?0:vase.angle, vaseSeed);
    const vaseTop = getFXParamNumber('vaseTop') ? 1 : 0;
    const vaseTopRoundness = mix(.01,.3,getFXParamNumber('vaseTopRoundness'));
    setUniform4f('vaseInfo2', vaseWarp, vaseTop,vaseTopRoundness,0);
    const vaseSymmetry = getFXParamNumber('vaseSymmetry');
    const vaseSymmetryScale = getFXParamNumber('vaseSymmetryScale');
    const materialBias = getFXParamNumber('materialBias');
    const vaseWidth = vase.getMaxRadius();
    const hslBlend = getFXParamNumber('hslBlend') ? 1 : 0;
    const materialBlendNoise = getFXParamNumber('materialBlendNoise');
    const vaseWarpScale = vaseRandom.float();
    {
        // fixup vase hsl lerp
        const c1 = vaseColor1.getHSL();
        const c2 = vaseColor2.getHSL();
        const d = c1[0] - c2[0];
        vaseColor1.a = 0;
        if (d > .5)
            vaseColor1.a = -1;
        else if (d < -.5)
            vaseColor1.a = 1;
    }

    setUniform4f('vaseColor1', ...vaseColor1.getArray());
    setUniform4f('vaseColor2', ...vaseColor2.getArray());
    setUniform4f('vaseInfo3', vaseSymmetry, vaseSymmetryScale,materialBias,animateNoiseTime);
    setUniform4f('vaseInfo4', vaseWidth,hslBlend,materialBlendNoise,vaseWarpScale);

    // background
    const sceneSeed = getFXParamNumber('sceneSeed');
    const defaultScene = !sceneSeed;
    const sceneRandom = new Random(sceneSeed + globalSeed);
    //const fogNoiseScale = sceneRandom.float();
    //const fogFadeScale = sceneRandom.bool() ? 0 : sceneRandom.float(.5,1);
    //const fogFadeNoise = sceneRandom.float(.5,1);
    const fogSeed = sceneRandom.float(99);
    const backgroundTypeID = getFXParamType('backgroundType', backgroundTypeNames);
    const sceneBackgroundScale = defaultScene ? .5 : sceneRandom.float();
    const sceneBackgroundRand = defaultScene ? .5 : sceneRandom.float();
    setUniform4f('sceneInfo',backgroundTypeID,sceneBackgroundScale,sceneBackgroundRand,fogSeed);

    setUniform4f('backgroundColor1', ...backgroundColor1.getArray());
    setUniform4f('backgroundColor2', ...backgroundColor2.getArray());
    setUniform4f('sceneColor', ...sceneColor.getArray());
    const sceneTypeID = getFXParamType('sceneType', sceneTypeNames);
    const sceneScale = defaultScene ? 0 : sceneRandom.float();
    const sceneRoundness = sceneRandom.float(.05, .3);
    const postEffectID = getFXParamType('postEffect', postEffectTypeNames);
    setUniform4f('sceneEffects', sceneTypeID,sceneScale,sceneRoundness,postEffectID);

    let filmGrain;
    if (postEffectID==0)      filmGrain = 0;       // None — no grain
    else if (postEffectID==2) filmGrain = .25;     // Extra Grain
    else if (postEffectID==5) filmGrain = .3;      // Color Grain
    else                      filmGrain = .1;      // Grain (default) + Invert/Border/Vignette/Grayscale
    setUniform4f('sceneEffects2', filmGrain,0,0,0);

    // material
    const materialRandom = new Random(getFXParamNumber('materialSeed') + globalSeed);
    const materialSeed = materialRandom.float(100,200);
    const materialTypeID = getFXParamType('materialType', materialEffectNames);
    const materialNoise = getFXParamNumber('materialNoise');
    const materialEffectScale = getFXParamNumber('materialEffectScale');
    setUniform4f('materialEffects', materialTypeID,materialNoise,materialSeed,materialEffectScale);
    const materialShine = getFXParamNumber('materialShine');
    const materialRoughness = getFXParamNumber('materialRoughness');
    const materialScale = getFXParamNumber('materialScale');
    const materialEffectContrast = getFXParamNumber('materialEffectContrast');
    setUniform4f('materialEffects2', materialShine, materialRoughness,materialEffectContrast,materialScale);

    const handlePosRadius1 = getFXParamNumber('handlePosRadius1');
    const handlePosRadius2 = getFXParamNumber('handlePosRadius2');
    const handlePosX = getFXParamNumber('handlePosX');
    let handleSize = (handlePosRadius1+handlePosRadius2);
    const handlePosY = mix(-handlePosRadius2,vase.topHeight+handlePosRadius2,getFXParamNumber('handlePosY'));

    let handleRadiusOffset = vase.getRadiusAt(clamp(handlePosY,0,vase.topHeight)/vaseMaxHeight);
    let handleMin = max(0,handleRadiusOffset - handleSize/2);
    let handleMax = handleRadiusOffset + handleSize;
    let end = min(handleMax + handleSize, 4.5);
    handleMax = max(handleMin, end - handleSize);
    handleRadiusOffset = mix(handleMin,handleMax,handlePosX);
    const handleCount = getFXParamNumber('handleCount');
    const handleAngle = 2*PI*getFXParamNumber('handleAngle');
    setUniform4f('handleInfo', handleRadiusOffset, handlePosY, handlePosRadius1,handlePosRadius2);
    setUniform4f('handleInfo2', handleCount, handleAngle, 0, 0);

    // lights
    const lightRandom = sceneRandom;

    // ambient lights
    let seedP = percent(sceneSeed, 0, 1000);
    let minSat = mix(0,.4,seedP);
    let maxSat = mix(.2,.8,seedP);
    let lightAmbient;
    if (defaultScene)
    {
        lightAmbient = backgroundColor1.mix(backgroundColor2, .5);
        lightAmbient = lightAmbient.scale(.4);
    }
    else
    {
        lightAmbient = backgroundColor1.mix(backgroundColor2, lightRandom.float());
        lightAmbient = lightAmbient.scale(lightRandom.float(.2,.5));
    }
    lightAmbient = lightAmbient.add(HSL(0,0,.04));
    lightAmbient = lightAmbient.scale(ambientScale);
    setUniform4f('lightAmbient', ...lightAmbient.getArray());

    // directional lights
    let lightDirection, lightColor, lightSoftness;
    lightSoftness = lightRandom.float(.02,.2)
    lightDirection = vec3(0,0,-1).rotateX(lightRandom.float(.4,1.1));
    let lightAngle = lightRandom.floatSign(1.1);
    lightDirection = lightDirection.rotateY(lightAngle);

    let lightBrightness = lightRandom.float(.5,.9);
    lightColor = HSL(lightRandom.float(),lightRandom.float(minSat,maxSat),lightBrightness);
    if (defaultScene)
    {
        lightBrightness = .7;
        lightDirection = vec3(-.4,.9,-1);
        lightColor = HSL(.05,.1,lightBrightness);
        lightSoftness=.1;
    }
    if (testMountains)
    {
        lightDirection = vec3(lightRandom.floatSign(2,4),lightRandom.float(.5,1),lightRandom.floatSign(2,4))
        lightColor = lightRandom.color(.3,.6);
        lightSoftness = lightRandom.float(.05,.2)
    }
    lightDirection = lightDirection.normalize();
    lightColor = lightColor.scale(light1Scale);
    setUniform4f('lightDirection1', ...lightDirection.getArray(), lightSoftness);
    setUniform4f('lightColor1', ...lightColor.getArray());

    lightSoftness = lightRandom.float(.02,.2);
    const isWallScene = sceneTypeID == 11;
    if (isWallScene)
    {
        lightDirection = vec3(0,0,-1).rotateX(lightRandom.float(.5,1.1));
        let newLightAngle = lightRandom.floatSign(1.2);
        if (abs(lightAngle-newLightAngle) < .5)
            newLightAngle -= sign(lightAngle-newLightAngle)*.5;
        //lightDirection = vec3(0,0,-1).rotateX(1.1);newLightAngle = -1;
        newLightAngle = clamp(newLightAngle,-1,1);
        lightDirection = lightDirection.rotateY(newLightAngle);
    }
    else
    {
        lightDirection = vec3(0,0,-1).rotateX(lightRandom.float(.5,1));
        lightAngle += lightRandom.floatSign(.7,PI)
        lightDirection = lightDirection.rotateY(lightAngle);
    }
    //lightBrightness = lightRandom.float(.7,1.3) - lightBrightness;
    lightBrightness = lightRandom.float(.3,.7); 
    lightBrightness = max(lightBrightness, 0);
    lightColor = HSL(lightRandom.float(),lightRandom.float(minSat,maxSat),lightBrightness);
    if (defaultScene)
    {
        lightDirection = vec3(-5,3,2);
        lightColor = HSL(.1,.4,.6);
        lightSoftness=.2;
    }
    if (testMountains)
    {
        lightDirection = new Vector3(0,1,0)
        lightColor = lightRandom.color(.2);
        lightSoftness = lightRandom.color(.2,.5);
    }
    lightDirection = lightDirection.normalize();
    lightColor = lightColor.scale(light2Scale);
    setUniform4f('lightDirection2', ...lightDirection.getArray(), lightSoftness);
    setUniform4f('lightColor2', ...lightColor.getArray());
    setUniform4f('toolPos', ...sculptPos.getArray(), sculptSize);

    // draw shader
    context.drawArrays(context.TRIANGLE_FAN, 0, 3);
}

function getShaderErrors()
{
    if (!glContext.getShaderParameter(glVertexShader, glContext.COMPILE_STATUS))
        return 'VERTEX SHADER ERROR!\n' + glContext.getShaderInfoLog(glVertexShader);
    if (!glContext.getShaderParameter(glPixelShader, glContext.COMPILE_STATUS))
        return 'PIXEL SHADER ERROR!\n' + glContext.getShaderInfoLog(glPixelShader);
    if (!glContext.getProgramParameter(glShaderProgram, glContext.LINK_STATUS))
        return 'SHADER LINK ERROR!\n' + glContext.getProgramInfoLog(glShaderProgram);
}