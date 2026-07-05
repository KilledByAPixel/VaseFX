/*

VaseFX by Frank Force


video


Standalone Controls

Mouse or touch to control view
1 - Save Image
2 - Toggle Free Cam
3 - Toggle Frame
4 - Toggle Edit Mode
5 - Toggle Animate


Minting Controls

Mouse click - Sculpt
Drag bottom - Rotate
Wheel - Tilt camera
X/Z - Undo/Redo
Control - Tight sculpt
Shift - Soft sculpt
WASD - Control View
Space - Stop Spin
R - Reset
G - Generate Random

Tips for best results...

Keep the vase warp slider low until you finish sculpting
Rotate and tilt your vase to be in the final display position
Use the undo/redo buttons to help sculpt
There is an auto sculpt button 'G' to generate a random shape
Zoom will attempt to zoom in or out to get the best view
Click refresh before minting to ensure all params are up to date


tags
vase, pottery, sculpt, webgl, 3d, interactive, raymarching


Sculpt, glaze, and fire.

improve border color
write description of each param
twist?


try always emit


*/


'use strict';

///////////////////////////////////////////////////////////////////////

let mainContext;
const debug = 0
const debugParams = 1
const debugNoDefaults = 0
const saveLoad = 1;
const panelWidth = 320;
const showInfo = 0;
const testPole = 0;
const testMountains = 0;
const showProjectedPoints = 0
const alwaysAutoZoom = 0;
const version = '2.21';

let freeLook = 0;
let canvasAspect = 1;
let animateNoise = 0;
let animateNoiseTime = 0;
let time = 0;
let lastFrameMS, fps;

let random;
let showBorder = 1;
let editMode;
const normalMinPitch = testMountains ? -1 : -.1;
const normalMaxPitch = testMountains ? 1 : .6;
let globalSeed;
let testDisplay;
let testDisplayTimer; 
let sculptPos = vec3();
let sculptSize = 0;

let canvasSize = 800;

let isSculpting;
let needsEmit;

// set when the user manually sculpts or tweaks a param; cleared after a
// randomize/reset/load. Gates the "discard your vase?" confirm dialog so we
// only nag when there's real hand-work to lose.
let isDirty = 0;

// standalone-only build (no external host)
const isStandalone = 1;
editMode = debugParams ? 1 : 0;

const materialEffectNames =
[
    'Marble',
    'Vertical Fade',
    'Radial Fade',
    'Horizontal Lines',
    'Vertical Lines',
    'Inside Out',
    'Curvature',
    'Pixel',
    'Grid',
    'Dots',
    'Fresnel',
    'Iridescent',
    'Spiral',
    'Component',
    'Sine Noise',
    'Emissive',
];

const sceneTypeNames =
[
    'Empty',
    'Wheel',
    'Long Table',
    'Square Table',
    'Round Table',
    'Floor',
    'Checkerboard',
    'Grid',
 //   'Window',
 //   'Wall',
];

const postEffectTypeNames =
[
    'None',
    'Grain',
    'Heavy Grain',
    'Invert',
    'Inverted Border',
    'Color Grain',
    'Vignette',
    'Grayscale'
];

const backgroundTypeNames =
[
    'Fade',
    'Radial Fade',
    'Clouds',
    'Fade Clouds',
    'Horizontal Clouds',
    'Vertical Clouds',
    'Pixel',
    'Fade Pixel',
    'Component',
];

const aspectModeNames = ['Full', 'Square', 'Vertical'];
let currentAspectMode = 'Full';
const programInfo = 
`VaseFX by Frank Force

- TOP SECRET DEMO -
PLEASE DO NOT SHARE!

- Controls -
Mouse click - Sculpt
Mouse drag bottom - Rotate
Mouse Wheel - Tilt camera
X/Z - Undo/Redo
Shift - Soft sculpt
Alt or Middle click - Detail sculpt
WASD - Control View
Space - Stop Spin
R - Reset

1 - Save HD Image
2 - Toggle Edit Mode
3 - Toggle Free Cam
4 - Toggle Frame
5 - Randomize Shape
6 - Animate

For best results...
Chrome browser
Good graphics card
Nothing else running

v${version}
`;

function initURL()
{
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    
    if (searchParams.has('full'))
        showBorder = !parseInt(searchParams.get('full'));
    if (searchParams.has('size'))
        canvasSize = parseInt(searchParams.get('size'));

}

const paramsList = [];
function initParams()
{
    initURL();

    if (debugParams)
    {
        // inject panel CSS once
        const panelStyle = document.createElement('style');
        panelStyle.textContent = `
            #vasePanel {
                position: fixed; top: 0; right: 0; bottom: 0;
                width: ${panelWidth}px;
                box-sizing: border-box;
                padding: 16px 18px;
                background: rgba(15,15,18,.92);
                color: #ddd;
                font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace;
                overflow-y: auto;
                z-index: 100;
                border-left: 1px solid #2a2a30;
            }
            #vasePanel h2 {
                font: 600 11px/1 ui-monospace, monospace;
                letter-spacing: .12em;
                text-transform: uppercase;
                color: #888;
                margin: 18px 0 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid #2a2a30;
            }
            #vasePanel h2:first-child { margin-top: 0; }
            #vasePanel .row {
                display: flex; align-items: center; gap: 8px;
                margin: 4px 0;
            }
            #vasePanel .row label {
                flex: 1; color: #aaa; font-size: 12px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #vasePanel input[type=range] {
                flex: 0 0 140px; height: 4px; -webkit-appearance: none;
                background: #2a2a30; border-radius: 2px; outline: none;
            }
            #vasePanel input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none; width: 12px; height: 12px;
                border-radius: 50%; background: #d8d8dc; cursor: pointer;
            }
            #vasePanel input[type=range]::-moz-range-thumb {
                width: 12px; height: 12px; border: 0;
                border-radius: 50%; background: #d8d8dc; cursor: pointer;
            }
            #vasePanel input[type=color] {
                flex: 0 0 32px; width: 32px; height: 22px; padding: 0;
                border: 1px solid #2a2a30; background: transparent; cursor: pointer;
            }
            #vasePanel input[type=checkbox] {
                flex: 0 0 auto; cursor: pointer;
            }
            #vasePanel select {
                flex: 0 0 140px;
                background: #1a1a1f; color: #ddd;
                border: 1px solid #2a2a30; padding: 3px 6px;
                font: inherit; cursor: pointer;
            }
            #vasePanel .actions {
                display: grid; grid-template-columns: 1fr 1fr 1fr;
                gap: 6px; margin-bottom: 14px;
            }
            #vasePanel .actions button {
                background: #1f1f25; color: #ddd;
                border: 1px solid #3a3a45;
                padding: 8px 6px; font: inherit; cursor: pointer;
                border-radius: 3px;
                transition: background .12s, border-color .12s;
            }
            #vasePanel .actions button:hover {
                background: #2a2a32; border-color: #555;
            }
            #vasePanel .actions button:active {
                background: #15151a;
            }
            #vasePanel .actions button:disabled {
                opacity: .45; cursor: default;
                background: #1f1f25; border-color: #3a3a45;
            }
            #vasePanel .title {
                font: 600 14px/1 ui-monospace, monospace;
                letter-spacing: .1em;
                color: #fff;
                margin-bottom: 12px;
            }
            #vasePanel .seed-input {
                flex: 0 0 140px;
                background: #1a1a1f; color: #ddd;
                border: 1px solid #2a2a30; padding: 3px 6px;
                font: inherit;
            }
            #vasePanel .reset-one {
                flex: 0 0 auto;
                width: 20px; height: 20px;
                padding: 0; margin-left: 4px;
                background: transparent; color: #666;
                border: 1px solid transparent;
                border-radius: 3px;
                font-size: 13px; line-height: 1;
                cursor: pointer;
                opacity: .35;
                transition: opacity .12s, color .12s, border-color .12s;
            }
            #vasePanel .row:hover .reset-one { opacity: 1; }
            #vasePanel .reset-one:hover { color: #fff; border-color: #555; }
        `;
        document.head.appendChild(panelStyle);

        debugSpan = document.createElement('div');
        debugSpan.id = 'vasePanel';
        document.body.appendChild(debugSpan);

        // panel header + action buttons
        const titleEl = document.createElement('div');
        titleEl.className = 'title';
        titleEl.textContent = 'VaseFX';
        debugSpan.appendChild(titleEl);

        const actions = document.createElement('div');
        actions.className = 'actions';
        debugSpan.appendChild(actions);

        const mkBtn = (label, onClick) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.onclick = onClick;
            actions.appendChild(b);
            return b;
        };
        mkBtn('Reset', () => {
            if (!vase) return;
            if (!confirmDestructive('Reset your vase to the default shape?')) return;
            resetAllParams();
            vase.setDefautShape();
            saveState();
            isDirty = 0;
            needsEmit = 1;
        });
        mkBtn('Randomize', () => {
            if (!vase) return;
            if (!confirmDestructive('Replace your current vase with a random one?')) return;
            randomizeAllParams();
            vase.setRandomShape();
            saveState();
            isDirty = 0;
            needsEmit = 1;
        });
        mkBtn('Save Image', () => {
            if (glShaderProgram)
                saveImageMaxRes();
        });
        mkBtn('Save Vase', () => saveVaseToFile());
        mkBtn('Load Vase', () => loadVaseFromFile());
        mkBtn('Share', () => shareVase());

        // Seed row (manual — not driven by paramsList, since the seed is its
        // own concept and we want a number-input instead of a slider).
        const seedHeader = document.createElement('h2');
        seedHeader.textContent = 'Seed';
        debugSpan.appendChild(seedHeader);

        const seedRow = document.createElement('div');
        seedRow.className = 'row';
        const seedLabel = document.createElement('label');
        seedLabel.textContent = 'Seed';
        seedRow.appendChild(seedLabel);

        seedInput = document.createElement('input');
        seedInput.type = 'number';
        seedInput.min = 0;
        seedInput.max = 1e7;
        seedInput.step = 1;
        seedInput.className = 'seed-input';
        seedInput.oninput = () =>
        {
            const v = parseInt(seedInput.value);
            if (Number.isFinite(v)) setSeed(v);
        };
        seedRow.appendChild(seedInput);

        const seedRandomBtn = document.createElement('button');
        seedRandomBtn.className = 'reset-one';
        seedRandomBtn.type = 'button';
        seedRandomBtn.title = 'Randomize seed';
        seedRandomBtn.textContent = '🎲';
        seedRandomBtn.onclick = () => setSeed(Math.random()*1e7|0);
        seedRow.appendChild(seedRandomBtn);

        debugSpan.appendChild(seedRow);

        // sync initial value (init() has already chosen globalSeed by now)
        seedInput.value = globalSeed;

        if (showInfo)
        {
            let infoSpan;
            infoSpan = document.createElement('span');
            document.body.appendChild(infoSpan);
            infoSpan.style.color='#fff'
            infoSpan.style.position = 'absolute';
            infoSpan.style.right = 0;
            infoSpan.style.top = 0;
            infoSpan.style.zIndex = 100;
            infoSpan.style.background='rgba(0,0,0,.5)';
            infoSpan.style.padding=20;
            infoSpan.style.fontSize='18px';
            infoSpan.style.textAlign='right';

            let infoSpan2 = document.createElement('span');
            let element = document.createElement('input');
            infoSpan.appendChild(element);
            element.type = 'checkbox';
            element.oninput  = e => infoSpan2.style.display = element.checked ? 'none' : '';
            infoSpan.appendChild(document.createElement('br'));

            infoSpan.appendChild(infoSpan2);
            infoSpan2.style.whiteSpace = 'pre-line';
            infoSpan2.appendChild(document.createTextNode(programInfo));
        }
    }

    const addParam=(id, name, type, options, def, update='sync')=>
    {
        if (debugNoDefaults && id != 'postEffect')
            def = undefined;
        let o = {'id':id, 'name':name, 'type':type, 'options':options, 'default':def};
        if (update)
            o['update'] = update;
        paramsList.push(o);
    }
    const addParamNumber=(id, name, min, max, step, def)=>
    {
        addParam(id, name, 'number', {'min':min, 'max':max, 'step':step}, def);
    }
    const addParamSelect=(id, name, options, def)=>
    {
        addParam(id, name, 'select', {'options':options}, def);
    }
    const addParamBool=(id, name, def, update)=>
    {
        addParam(id, name, 'boolean', undefined, def, update);
    }
    const addParamColor=(id, name, def)=>
    {
        addParam(id, name, 'color', undefined, def);
    }
    const addParamCode=(id, name,def = '')=>
    {
        addParam(id, name, 'bytes', {'length':vaseDataLength}, def, 'code-driven');
    }

    // glaze
    addParamSelect('materialType','Glaze Style', materialEffectNames, materialEffectNames[0]);
    addParamColor('vaseColor1', 'Glaze Color 1', 'ffffffff');
    addParamColor('vaseColor2','Glaze Color 2', '000000ff');
    addParamNumber('materialBlendNoise','Glaze Burn', 0, 1, .001, .5);
    addParamNumber('materialEffectScale','Glaze Scale', 0, 1, .001, .5);
    addParamNumber('materialNoise','Glaze Noise Amplitude',0, 1,.001, .5);
    addParamNumber('materialScale','Glaze Noise Frequency', 0, 1, .001, .5);
    addParamNumber('materialEffectContrast','Glaze Contrast', 0, 1, .001, .5);
    addParamNumber('materialBias','Glaze Bias', -1, 1, .001, 0);
    addParamNumber('materialShine','Glaze Shine', 0, 1, .001, .5);
    addParamNumber('materialRoughness','Glaze Surface', 0, 1, .001, 0);
    addParamNumber('materialSeed','Glaze Seed', 0, 1e3, 1, 0);
    addParamBool('hslBlend','Glaze HSL Blend', true);

    // vase
    addParamBool('vaseTop','Solid Interior', false);
    addParamNumber('vaseSymmetry','Symmetry Count', 1, 30, 1, 1);
    addParamNumber('vaseSymmetryScale','Symmetry Scale', 0, 1, .001, .5);
    addParamNumber('vaseTopRoundness','Vase Lip Shape', 0, 1, .001, .5);
    addParamNumber('vaseWarp','Vase Warp', 0, 1, .001, 0);

    // handles
    addParamNumber('handleCount','Handle Count', 0, 10, 1, 0);
    addParamNumber('handlePosY','Handle Height', 0, 1, .001, .5);
    addParamNumber('handlePosX','Handle Offset', 0, 1, .001, .5);
    addParamNumber('handlePosRadius1','Handle Size', 0, 2., .001, .5);
    addParamNumber('handlePosRadius2','Handle Thickness', .05, 1, .001, .2);
    addParamNumber('handleAngle','Handle Angle', 0, 1, .001, 0);

    // scene
    addParamSelect('sceneType', 'Scene', sceneTypeNames, sceneTypeNames[1]);
    addParamSelect('backgroundType', 'Background', backgroundTypeNames, backgroundTypeNames[0]);
    addParamColor('sceneColor', 'Scene Color');
    addParamColor('backgroundColor1', 'Background Color 1', 'ffffffff');
    addParamColor('backgroundColor2', 'Background Color 2');
    addParamNumber('sceneSeed','Scene Seed', 0, 1e3, 1, 0);

    // border
    addParamNumber('borderSeed','Border Seed', 0, 1e4, 1,0);
    addParamSelect('postEffect', 'Post Effect', postEffectTypeNames, postEffectTypeNames[0]);
    addParamBool('zoom','Auto Zoom', false);
    addParamSelect('aspect', 'Aspect', aspectModeNames, 'Full');

    // data
    addParamCode('vaseData','Vase Data');

    if (debug)
        console.log(paramsList);

    // restore previously-saved values so user's last session reappears.
    // setupParams skips any id that's already in paramValues.
    if (saveLoad && localStorage.paramValues)
    {
        try
        {
            const saved = JSON.parse(localStorage.paramValues);
            for (const k in saved)
                paramValues[k] = saved[k];
        }
        catch (e) { console.warn('failed to parse saved params', e); }
    }

    // drop any saved select values that no longer match an option (e.g. an
    // option got removed from sceneTypeNames). setupParams will fill the
    // missing slot with the default.
    for (const p of paramsList)
    {
        if (p['type'] == 'select' && paramValues[p['id']] !== undefined
            && p['options'].options.indexOf(paramValues[p['id']]) < 0)
        {
            delete paramValues[p['id']];
        }
    }

    // resolve param values FIRST (random color defaults etc.) so the debug UI
    // we build below can reflect the actual starting values.
    setupParams(paramsList);

    // persist initial values so a never-touched session still gets restored
    // (otherwise the random color defaults would change every reload)
    if (saveLoad)
    {
        try { localStorage.paramValues = JSON.stringify(paramValues); } catch (e) {}
    }

    // build debug UI from resolved values
    for (const p of paramsList)
        addDebugParam(p['id'], p['name'], p['type'], p['options'], p['default'], p['update']);
}

// local param store
const paramValues = {};
function setupParams(params)
{
    for (const p of params)
    {
        if (paramValues[p['id']] !== undefined)
            continue; // preserve any values already set (e.g. by debug UI)

        const def = p['default'];
        const type = p['type'];
        if (type == 'color')
        {
            // Match the shape Color.setFXParam expects: {obj:{rgba:{r,g,b,a}}}
            // with 0-255 components.
            let r, g, b, a;
            if (def)
            {
                const h = def.padEnd(8, 'f');
                r = parseInt(h.slice(0,2), 16);
                g = parseInt(h.slice(2,4), 16);
                b = parseInt(h.slice(4,6), 16);
                a = parseInt(h.slice(6,8), 16);
            }
            else
            {
                // No explicit default: pick a seeded random color so each
                // globalSeed gets distinct starting palette.
                r = (random.float()*256)|0;
                g = (random.float()*256)|0;
                b = (random.float()*256)|0;
                a = 255;
            }
            paramValues[p['id']] = {'obj':{'rgba':{'r':r,'g':g,'b':b,'a':a}}};
        }
        else if (type == 'bytes')
        {
            paramValues[p['id']] = def != undefined ? def : '';
        }
        else
        {
            paramValues[p['id']] = def;
        }
    }
}

function setupCanvas()
{
    currentAspectMode = getFXParam('aspect') || 'Full';

    // available area = window minus the right-side panel
    const panelOffset = debugParams ? panelWidth : 0;
    const availW = max(1, innerWidth - panelOffset);
    const availH = innerHeight;

    // canvasAspect = h/w
    let margin;
    if (currentAspectMode == 'Square')      { canvasAspect = 1;   margin = 24; }
    else if (currentAspectMode == 'Vertical'){ canvasAspect = 1.3; margin = 24; }
    else                                     { canvasAspect = availH / availW; margin = 0; }

    // Fit the canvas inside the available area (minus margin), preserving aspect.
    const maxW = availW - margin*2;
    const maxH = availH - margin*2;
    let cssH = maxH;
    let cssW = cssH / canvasAspect;
    if (cssW > maxW)
    {
        cssW = maxW;
        cssH = cssW * canvasAspect;
    }

    // Intrinsic resolution: fixed canvasSize so render quality is consistent.
    const w = (canvasSize / canvasAspect) | 0;
    const h = canvasSize | 0;
    glCanvas.width = mainCanvas.width = w;
    glCanvas.height = mainCanvas.height = h;
    glCanvas.style.width  = mainCanvas.style.width  = cssW + 'px';
    glCanvas.style.height = mainCanvas.style.height = cssH + 'px';

    // Center within available area.
    const left = (availW - cssW) / 2;
    const top  = (availH - cssH) / 2;
    glCanvas.style.left = mainCanvas.style.left = left + 'px';
    glCanvas.style.top  = mainCanvas.style.top  = top  + 'px';
}
onresize =()=> setupCanvas();

function init()
{
    const savedSeed = saveLoad && localStorage.globalSeed ? parseInt(localStorage.globalSeed) : NaN;
    globalSeed = Number.isFinite(savedSeed) ? savedSeed : (Math.random()*1e7|0);
    random = new Random(globalSeed);
    initParams();

    // setup html
    const styleBody = 'margin:0;overflow:hidden;background:#1a1a1d' + // dark gray canvas backdrop
        `;cursor:${editMode?'pointer':'grab'};` + 
        ';touch-action:none' + // prevent mobile pinch to resize
        ';user-select:none' +  // prevent mobile hold to select
        ';-webkit-user-select:none' + // compatibility for ios
        ';-webkit-touch-callout:none'; // compatibility for ios
    document.body.style = styleBody;
    //document.body.appendChild(glCanvas = document.createElement('canvas'));
    //document.body.appendChild(mainCanvas = document.createElement('canvas'));

    initInput();
    
    const styleCanvas = 'position:absolute;top:0;left:0';
    mainContext = mainCanvas.getContext('2d');
    mainCanvas.style = styleCanvas;
    glCanvas.style = styleCanvas;

    // drop shadow under the canvas so it stands out from the gray backdrop
    glCanvas.style.boxShadow = '0 12px 40px rgba(0,0,0,.7)';
    mainCanvas.style.boxShadow = '0 12px 40px rgba(0,0,0,.7)';

    // prevent clicking on 2d context
    mainCanvas.style.pointerEvents  = 'none';

    setupCanvas();
    drawLoading();

    // Defer the actual WebGL setup so the browser has a chance to paint the
    // loading screen first. Without this yield, Firefox can stay solid black
    // for the entire compile because the main thread never gets a paint cycle
    // between drawLoading() and the (potentially synchronous) compile work.
    setTimeout(initStage2, 30);
}

function initStage2()
{
    glInit();

    cameraPosition = testMountains ? vec3(): vec3(0,10,-10);
    cameraRotation.x = 0;

    vase = new Vase;
    let vaseData = getFXParam('vaseData');
    if (saveLoad && localStorage.saveState)
    {
        loadState(JSON.parse(localStorage.saveState), 1);
        stateUndo = [];
        console.log('loaded save state!');
        editMode = 1;
        isDirty = 1;   // a restored in-progress session is worth protecting
    }
    else
    {
        vase.loadPackedData(vaseData);
    }

    // If the page was loaded with ?v=<crushed-json>, that takes precedence
    // over localStorage and the param defaults.
    tryLoadFromURL();

    if (debug)
        oncontextmenu = e=> false;

    console.log(`VaseFX v${version} by Frank Force`);
    console.log('www.frankforce.com');

    let featureList = {};
    const addFeature=(name, value)=>
    {
        //featureList.push({'name':name, 'value':value});
        featureList[name] = value;
    }
    {
        // features
        const r = vase.getMaxRadius();
        const h = vase.topHeight;
        const n = clamp(vase.getRegularity() - getFXParamNumber('vaseWarp'));
        const materialType = getFXParam('materialType');
        const sceneType = getFXParam('sceneType');
        let backgroundType = getFXParam('backgroundType');
        const handleCount = getFXParam('handleCount');
        const postEffect = getFXParam('postEffect');
        const vaseTop = getFXParamNumber('vaseTop');
        const borderSeed = getFXParamNumber('borderSeed');
        const zoom = getFXParamNumber('zoom');

        if (sceneType == 'Wall')
            backgroundType = 'Fade';

        addFeature('Height', (h).toFixed(2));
        addFeature('Diameter', (2*r).toFixed(2));
        addFeature('Regularity', (n).toFixed(2));
        addFeature('Handles', handleCount);
        addFeature('Glaze', materialType);
        addFeature('Scene', sceneType);
        addFeature('Background', backgroundType);
        addFeature('Post Effect', postEffect);
        addFeature('Solid Top', !!vaseTop);
        addFeature('Border', borderSeed > 0);
        addFeature('Zoom', !!zoom);
    }
    if (debug)
        console.table(featureList);

    updateCamera();
    saveState();
    update();
}

let loadingFrame = 0;
function drawLoading()
{
    ++loadingFrame;
    mainCanvas.width |=0 ;
    mainContext.fillStyle='#000'
    mainContext.fillRect(0,0,mainCanvas.width,mainCanvas.height);
    mainContext.font='50px monospace'
    mainContext.textAlign = 'center';
    mainContext.globalCompositeOperation='screen';

    // Always draw the text — no time/frame gate. On Firefox the entire
    // shader compile can happen synchronously inside glInit() between the
    // first drawLoading() call and the next JS yield, so we only get one
    // paint cycle to show the loading screen. Skipping the draw on the first
    // call would leave the user staring at a black canvas the whole compile.
    for(let i = 3; i--;)
    {
        mainContext.fillStyle = HSL(i/3,1,.5);
        let X = mainCanvas.width/2+3*Math.sin(loadingFrame/9+i/3*2*PI);
        let Y = mainCanvas.height/2-60+3*Math.sin(loadingFrame/31+i/3*2*PI+1e3);
        mainContext.fillText('VaseFX',X,Y);
        mainContext.fillText('Loading',X,Y+=60);
    }
}

function getBorderSize()
{
    const minBorderSize = .005;
    const maxBorderSize = .05;
    const borderSeed = getFXParamNumber('borderSeed');
    return borderSeed ? mix(minBorderSize, maxBorderSize, borderSeed / 1e4) : 0;
}

function getFXParam(p) { return paramValues[p]; }
function getFXParamNumber(p) { return Number(getFXParam(p)); }
function getFXParamColor(p, applyGamma=1)
{
    const gamma = 2.2;
    let color = (new Color).setFXParam(getFXParam(p)); 
    if (applyGamma)
        color = color.pow(gamma);
    return color;
}
function getFXParamType(p, typeNames) { return max(typeNames.indexOf(getFXParam(p)), 0); }

// frame time tracking
let frameTimeLastMS = 0, frameTimeBufferMS;

function failMessage()
{
    if (!window['mainCanvas'])
        return;

    mainCanvas.width |= 0;
    mainContext.fillStyle='#000'
    mainContext.fillRect(0,0,mainCanvas.width,mainCanvas.height);
    mainContext.fillStyle='#f00'
    mainContext.font='50px monospace'
    mainContext.textAlign = 'center';
    mainContext.fillText('Fail!',mainCanvas.width/2,mainCanvas.height/2);
}

let lastMousePos = vec3();
let wasBuilt = 0;
const frameRate = 60;
function update(frameTimeMS=0)
{
    if (!glShaderProgram || !glPixelShader || !glShaderProgram)
    {
        failMessage();
        return false;
    }

    // wait until shader loaded
    if (!isShaderReady(glContext))
    {
        // shader building. Use setTimeout (not RAF) here: Firefox can throttle
        // RAF heavily while the GPU is compiling, which leaves polling stuck.
        drawLoading();
        setTimeout(update, 16);
        return;
    }

    if (!wasBuilt)
    {
        mainCanvas.width |= 0;
        wasBuilt = 1;
        const errors = getShaderErrors();
        if (errors)
        {
            console.log(errors);
            failMessage();
            return;
        }
    }

    let thisFrameMS = Date.now();
    let newFPS = 1e3/(thisFrameMS - lastFrameMS);
    fps = newFPS?fps*.95 + newFPS*.05:0;
    lastFrameMS = thisFrameMS;

    mainCanvas.width |= 0;
    if (getFXParam('aspect') != currentAspectMode)
        setupCanvas();

    if ((freeLook || debug) && mousePressed[2] || keyWasPressed('1'))
        saveImageMaxRes();

    updateUI();
    updateCamera();

    // update time keeping
    let frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
    frameTimeLastMS = frameTimeMS;
    frameTimeBufferMS += frameTimeDeltaMS;
    frameTimeBufferMS = min(frameTimeBufferMS, 50); // clamp incase of slow framerate

    // apply time delta smoothing, improves smoothness of framerate in some browsers
    let deltaSmooth = 0;
    if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
    {
        // force an update each frame if time is close enough (not just a fast refresh rate)
        deltaSmooth = frameTimeBufferMS;
        frameTimeBufferMS = 0;
    }
    // update multiple frames if necessary in case of slow framerate
    for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
    {
        time += 1/frameRate;
        vase.update();
    }

    // add the time smoothing back in
    frameTimeBufferMS += deltaSmooth;

    glRender();

    // standalone-only: nothing to emit to a host. Just clear the flag.
    if (needsEmit)
        needsEmit = 0;

    updateInputPost();
    
    requestAnimationFrame(update);
}

function saveImageMaxRes()
{
    // save at max res
    let w = glCanvas.width;
    let h = glCanvas.height;
    if (showBorder)
    {
        glCanvas.width = 4096/ canvasAspect;
        glCanvas.height = 4096;
    }
    glRender();
    saveCanvas(glCanvas, 'vase');
    glCanvas.width = w;
    glCanvas.height = h;
    displayMessage('Saved vase.jpg');
}

function displayMessage(message, time=3)
{
    testDisplay = message;
    testDisplayTimer = time;
}

function saveImage()
{
    glRender();
    saveCanvas(glCanvas, 'vase');
}

function updateUI()
{
    // size message text relative to the canvas so it never runs off the edge
    const msgSize = max(14, mainCanvas.width/26 | 0);
    mainContext.font = msgSize + 'px monospace';
    mainContext.textAlign = 'left';

    if (testDisplayTimer>0)
    {
        testDisplayTimer -= 1/60;
        const mx = msgSize*.4, my = msgSize*1.2, off = max(1, msgSize*.06|0);
        mainContext.fillStyle = HSL(0,0,0);
        mainContext.fillText(testDisplay, mx, my);
        mainContext.fillStyle = HSL(0,1,1);
        mainContext.fillText(testDisplay, mx-off, my-off);
    }
    
    if (debug)
    {
        mainContext.font='50px monospace'
        mainContext.textAlign = 'center';
        mainContext.textAlign = 'right';
        
        let debugX = mainCanvas.width - 20;
        let debugY = 50;
        /*for(let i = objectDataCount; i--;)
        {
            let r = vase.radiusData[i];
            let s = vase.smoothData[i];
            let z = 1;
            mainContext.fillStyle = HSL(0,0,r/2.);
            mainContext.fillRect(debugX-10,debugY+350-z*i,20,z);
            mainContext.fillStyle = HSL(0,0,s);
            mainContext.fillRect(debugX-50,debugY+350-z*i,20,z);
        }
        */
        mainContext.fillStyle='#000'
        mainContext.fillText(fps|0,debugX,debugY+35);
        mainContext.fillText(((mousePos.x*100)|0) + ' ' + ((mousePos.y*100)|0),debugX,debugY+75);

        //mainContext.drawImage(canvas_sceneData, 0, 0);

    }

    const standaloneControls = isStandalone || debug || debugParams;
    if (keyWasPressed('2') && standaloneControls)
    {
        freeLook = !freeLook;
        displayMessage(`Free Look: ${freeLook}`);
        cameraRotation.y = 0;
        if (freeLook)
        {
            mainCanvas.requestPointerLock = 
                mainCanvas.requestPointerLock || mainCanvas.mozRequestPointerLock;
            mainCanvas.requestPointerLock();
        }
        else if (document.exitPointerLock)
            document.exitPointerLock();
    }
    if (keyWasPressed('3') && standaloneControls)
    {
        showBorder = !showBorder;
        displayMessage(`Show Border: ${showBorder}`);
        setupCanvas();
    }
    if (keyWasPressed('4') && standaloneControls)
    {
        editMode = !editMode;
        displayMessage(`Edit Mode: ${editMode}`);
    }
    if (keyWasPressed('5') && standaloneControls)
    {
        animateNoise = !animateNoise;
        displayMessage(`Animate: ${animateNoise}`);
    }
    if (animateNoise && (standaloneControls||debugNoDefaults))
        animateNoiseTime += .01;
    if (keyWasPressed('y') && debugNoDefaults)
    {
        //cameraRotation.x = random.float(normalMinPitch, normalMaxPitch);
        vase.setRandomShape();
        setupParams(paramsList);
        saveState();
    }

    if (keyWasPressed('x'))
    {
        redoState();
        needsEmit = 1;
    }
    if (keyWasPressed('z'))
    {
        undoState();
        needsEmit = 1;
    }
    if (keyWasPressed('r') && editMode
        && confirmDestructive('Reset your vase to the default shape?'))
    {
        vase.setDefautShape();
        saveState();
        isDirty = 0;
        needsEmit = 1;
    }
    if (keyWasPressed('g') && editMode
        && confirmDestructive('Replace your current vase with a random one?'))
    {
        vase.setRandomShape();
        displayMessage(`Generated!`);
        saveState();
        isDirty = 0;
        needsEmit = 1;
    }

    // fit mouse to border
    let mousePosFix = mousePos.copy();
    if (showBorder)
    {
        const borderSize = getBorderSize();
        mousePosFix.x = percentNoClamp(mousePosFix.x, borderSize, 1-borderSize);
        let b = borderSize / canvasAspect;
        mousePosFix.y = percentNoClamp(mousePosFix.y, b, 1-b);
    }
    let mouseDelta = mousePosFix.subtract(lastMousePos);
    lastMousePos = mousePosFix;

    if (isTouchDevice && mousePressed[0])
        mouseDelta = vec3();

    let vaseTop, vaseBottom;
    let vaseTopX, vaseBottomX;
    {
        // calculate vase position on screen
        function projectPoint(pos)
        {
            let direction = cameraPosition.subtract(pos);
            direction = direction.inverseRotateXYZ(cameraRotation).normalize();
            direction = direction.scale(cameraZoom);
            return direction.scale(-.5).add(vec3(.5));
        }

        let top = projectPoint(vec3(0,vaseMaxHeight,0));
        let topRight = projectPoint(vec3(vaseMaxRadius+.2,vaseMaxHeight,0));
        let bottom = projectPoint(vec3(0,0,0));
        let bottomRight = projectPoint(vec3(vaseMaxRadius+.2,0,0));

        vaseTop = 1-top.y;
        vaseBottom = 1-bottom.y;
        vaseTopX = abs(topRight.x-.5)
        vaseBottomX = abs(bottomRight.x-.5)

        //let borderSize = getBorderSize();
        //vaseTop = borderSize + (vaseTop) * (1-borderSize*2);
        //vaseBottom = borderSize + (vaseBottom) * (1-borderSize*2);
        
        if (showProjectedPoints)
        {
            mainContext.fillStyle='#f00';
            mainContext.fillRect(mainCanvas.width/2,vaseTop*mainCanvas.height,9,9);
            mainContext.fillRect(mainCanvas.width/2,vaseBottom*mainCanvas.height,9,9);
            mainContext.fillRect(topRight.x*mainCanvas.width,(1-topRight.y)*mainCanvas.height,9,9);
            mainContext.fillRect(bottomRight.x*mainCanvas.width,(1-bottomRight.y)*mainCanvas.height,9,9);
        }
    }
    
    sculptPos = vec3();
    sculptSize = 0;
    
    const wasSculpting = isSculpting;
    isSculpting = 0;
    const turnSpeed = .043;
    let moveSpeed = keyIsDown('Shift') ? 1 : .1 ;
    if (testMountains)
        moveSpeed *= 50;
    const zoomSpeed = .2;
    const x = mouseMove.x*turnSpeed;
    const y = mouseMove.y*turnSpeed;
    let z = keyIsDown('w') - keyIsDown('s');
    let r = keyIsDown('d') - keyIsDown('a');
    let u = keyIsDown('e') - keyIsDown('q');
    if (!r)
        r = keyIsDown('ArrowRight') - keyIsDown('ArrowLeft');
    if (!z)
        z = keyIsDown('ArrowUp') - keyIsDown('ArrowDown');
    const zoom = zoomSpeed*mouseWheel;

    let mouseSpin = 0;
    let mouseIsAtBottom = mousePosFix.y > min(.95,vaseBottom+.1)
    const sceneId = getFXParamType('sceneType', sceneTypeNames);
    const windowScene = sceneId == 10;
    const lowScene = sceneId <= 4;
    const emptyScene = sceneId == 0;    
    if (!freeLook)
    {
        let minCameraPitch = editMode ? normalMinPitch : emptyScene ? -PI/2 : windowScene||lowScene ? -.4 : normalMinPitch;
        let maxCameraPitch = editMode ? normalMaxPitch : windowScene? PI/2-.6 :PI/2;
        {
            // rotate camera
            let deltaPitch = z/59 - mouseWheel/15;
            if (deltaPitch)
            {
                cameraRotation.x += deltaPitch;
                needsEmit = 1;
            }
            cameraRotation.x = clamp(cameraRotation.x, minCameraPitch, maxCameraPitch);
            //cameraRotation.y += r/29;
            //cameraZoom = cameraZoom-zoom*cameraZoom;
            //cameraZoom = clamp(cameraZoom,2,5);
            if (keyIsDown(' '))
                vase.angleVelocity *= .9;
            if (r)
            {
                vase.angleVelocity -= r*.002;
                vase.angleVelocity = clamp(vase.angleVelocity, -.2,.2);
            }
        }
        if ((mouseIsDown[0]||mouseIsDown[1]) && mousePos.x > 0 && mousePos.x < 1 && mousePos.y > 0 && mousePos.y < 1)
        {
            if (mouseIsAtBottom || !editMode)
            {
                // mouse control spin
                let v = -mouseDelta.x * .1;
                vase.angleVelocity += v;
                vase.angleVelocity *= .95;
                vase.angleVelocity = clamp(vase.angleVelocity, -.2,.2);
                mouseSpin = 1;

                if (!editMode)
                {
                    // mouse control pitch
                    cameraRotation.x += mouseDelta.y;
                    cameraRotation.x = clamp(cameraRotation.x, minCameraPitch, maxCameraPitch);
                }
            }
            else
            {
                let py = percentNoClamp(mousePosFix.y,vaseBottom,vaseTop);
                let px = mousePosFix.x - .5;
                px = abs(px);

                let a = mix(vaseBottomX, vaseTopX,py);
                px = percentNoClamp(px,.01,a)/canvasAspect;

                vase.sculpt(px, py, mouseDelta);
                isSculpting = 1;
                isDirty = 1;
                needsEmit = 1;
            }
        }
    }
    else if (x || y || z || r || u || zoom)
    {
        // free look
        const forward = cameraRotation.getXYZForward();
        const right = cameraRotation.getXYZRight();
        cameraPosition = cameraPosition.add(forward.scale(z*moveSpeed));
        cameraPosition = cameraPosition.add(right.scale(r*moveSpeed));
        cameraPosition.y += u*moveSpeed;

        cameraZoom = cameraZoom-zoom*cameraZoom;
        cameraZoom = clamp(cameraZoom,1,20);
        cameraRotation = cameraRotation.copy();
        if (document.pointerLockElement)
        {
            cameraRotation.x += y*turnSpeed;
            cameraRotation.y -= x*turnSpeed;
            cameraRotation.x = clamp(cameraRotation.x, -PI/2, PI/2);
        }
    }

    if (!isSculpting)
        document.body.style.cursor = mouseSpin ? 'grabbing' : !editMode ||mouseIsAtBottom ? 'grab' :  'pointer';

    if (wasSculpting && !isSculpting)
        saveState();
}

function updateCamera()
{
    if (freeLook)
        return;


    const sceneId = getFXParamType('sceneType', sceneTypeNames);
    const emptyScene = sceneId == 0;
    const windowScene = sceneId == 10;
    let cameraHeight = windowScene ? 3.5 : 3.25;

    let d = vec3(0,0,testMountains?0:-25).rotateXYZ(cameraRotation);
    const radius = vase.getMaxRadius();

    cameraZoom = 5;

    const autoZoom = getFXParamNumber('zoom');
    if (autoZoom || alwaysAutoZoom)
    {
        const zoom = percent(vase.topHeight, vaseMaxHeight, vaseMinHeight);
        cameraHeight = mix(3.75, vase.topHeight*2/3, zoom);
        const rp = radius/vaseMaxRadius;
        cameraZoom = mix(4.7,7 - 1.5*rp,zoom);
    }

    let o = vec3(0,cameraHeight,0);

    const lowScene = sceneId <= 4;

    //o.y -= percent(cameraRotation.x,0.,.3)*.4; // lower when tilted
    if (emptyScene)
        o.y = vase.topHeight/2; // center when empty scene
    o = o.add(d);
    if (!(lowScene || windowScene))
        o.y = max(.5,o.y); // prevent going below ground
    cameraPosition = o;
}

///////////////////////////////////////////////////////////////////////////////

let debugSpan;
let seedInput;
const paramInputs = {};  // id -> input element, for refreshing UI on reset/randomize

function setSeed(newSeed)
{
    newSeed = (newSeed | 0);
    if (newSeed < 0) newSeed = 0;
    if (newSeed > 1e7) newSeed = 1e7;
    globalSeed = newSeed;
    if (random) random.setSeed(globalSeed);
    if (seedInput) seedInput.value = globalSeed;
    if (saveLoad)
        try { localStorage.globalSeed = String(globalSeed); } catch(e){}
}

function computeDefault(p)
{
    if (p['type'] == 'color')
    {
        let r, g, b;
        if (p['id'] == 'vaseColor1')
        {
            // Glaze Color 1 resets to a random bright color (full sat,
            // lightness >= .5) rather than plain white.
            const hue   = Math.random();
            const light = .5 + Math.random() * .5;
            const c = HSL(hue, 1, light);
            r = c.r * 255 | 0;
            g = c.g * 255 | 0;
            b = c.b * 255 | 0;
        }
        else if (p['default'])
        {
            const h = p['default'].padEnd(8, 'f');
            r = parseInt(h.slice(0,2), 16);
            g = parseInt(h.slice(2,4), 16);
            b = parseInt(h.slice(4,6), 16);
        }
        else
        {
            r = (random.float()*256)|0;
            g = (random.float()*256)|0;
            b = (random.float()*256)|0;
        }
        return {'obj':{'rgba':{'r':r,'g':g,'b':b,'a':255}}};
    }
    if (p['type'] == 'bytes')
        return p['default'] != undefined ? p['default'] : '';
    return p['default'];
}

function computeRandom(p)
{
    if (p['type'] == 'number')
    {
        const o = p['options'];
        const lo = o && o.min != undefined ? o.min : 0;
        const hi = o && o.max != undefined ? o.max : 1;
        const step = o && o.step ? o.step : .001;
        let v = lo + (hi - lo) * Math.random();
        v = Math.round(v / step) * step;
        return Math.min(Math.max(v, lo), hi);
    }
    if (p['type'] == 'color')
    {
        return {'obj':{'rgba':{
            'r': Math.random()*256|0,
            'g': Math.random()*256|0,
            'b': Math.random()*256|0,
            'a': 255,
        }}};
    }
    if (p['type'] == 'select')
    {
        const opts = p['options'].options;
        return opts[Math.random()*opts.length|0];
    }
    if (p['type'] == 'boolean')
        return Math.random() < .5;
    return p['default'];
}

function setParamValue(p, value)
{
    paramValues[p['id']] = value;
    const el = paramInputs[p['id']];
    if (!el) return;
    if (p['type'] == 'color')
    {
        const rgba = value['obj']['rgba'];
        const toHex = c => c.toString(16).padStart(2, '0');
        el.value = '#' + toHex(rgba['r']) + toHex(rgba['g']) + toHex(rgba['b']);
    }
    else if (p['type'] == 'select')
    {
        el.selectedIndex = max(p['options'].options.indexOf(value), 0);
    }
    else if (p['type'] == 'boolean')
    {
        el.checked = !!value;
    }
    else if (p['type'] == 'number')
    {
        el.value = value;
    }
}

function resetAllParams()
{
    for (const p of paramsList)
    {
        if (p['id'] == 'vaseData') continue;
        setParamValue(p, computeDefault(p));
    }
    if (saveLoad)
        try { localStorage.paramValues = JSON.stringify(paramValues); } catch(e){}
}

function randomizeAllParams()
{
    for (const p of paramsList)
    {
        if (p['id'] == 'vaseData') continue;
        // Frame params (border seed, post effect, auto zoom, aspect) are the
        // user's framing choices — randomize leaves them alone.
        if (sectionForId[p['id']] == 'Frame') continue;
        setParamValue(p, computeRandom(p));
    }
    if (saveLoad)
        try { localStorage.paramValues = JSON.stringify(paramValues); } catch(e){}
}

function currentVaseSnapshot()
{
    return {
        version: 1,
        seed: globalSeed,
        vase: {
            radiusData: [...vase.radiusData],
            smoothData: [...vase.smoothData],
            topHeight: vase.topHeight,
            thickness: vase.thickness,
            angle: vase.angle,
            pitch: cameraRotation.x,
        },
        params: paramValues,
    };
}

function saveVaseToFile()
{
    if (!vase) return;
    const data = currentVaseSnapshot();
    data.savedAt = new Date().toISOString();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vase-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    displayMessage('Saved vase JSON');
}

function loadVaseFromFile()
{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) =>
    {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) =>
        {
            try
            {
                applyLoadedVase(JSON.parse(ev.target.result));
                displayMessage('Loaded ' + file.name);
            }
            catch (err)
            {
                console.error('Failed to load vase JSON', err);
                displayMessage('Load failed');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function applyLoadedVase(data)
{
    if (!vase || !data) return;

    // restore seed (also writes it to localStorage and updates the input)
    if (Number.isFinite(data.seed))
        setSeed(data.seed);

    // apply vase shape (uses startup=1 so angle + camera pitch get restored)
    if (data.vase)
        loadState(data.vase, 1);

    // apply param values, going through setParamValue so the UI inputs update too
    if (data.params)
    {
        for (const id in data.params)
        {
            const p = paramsList.find(pp => pp['id'] === id);
            if (p)
                setParamValue(p, data.params[id]);
            else
                paramValues[id] = data.params[id]; // unknown id (e.g. vaseData) — store raw
        }
    }

    // persist to localStorage so reload restores the just-loaded vase
    saveState();
    if (saveLoad)
        try { localStorage.paramValues = JSON.stringify(paramValues); } catch(e){}
    isDirty = 0;   // a just-loaded vase is a known, recoverable baseline
    needsEmit = 1;
}

function shareVase()
{
    if (!vase) return;
    if (!window.JSONCrush)
    {
        displayMessage('JSONCrush not loaded yet');
        return;
    }
    const json = JSON.stringify(currentVaseSnapshot());
    const crushed = window.JSONCrush.crush(json);
    const url = location.origin + location.pathname + '?v=' + encodeURIComponent(crushed);
    if (navigator.clipboard && navigator.clipboard.writeText)
    {
        navigator.clipboard.writeText(url).then(
            () => displayMessage('Share URL copied!'),
            () => { prompt('Copy this URL:', url); }
        );
    }
    else
    {
        prompt('Copy this URL:', url);
    }
}

// Try to load a vase from a ?v=<crushed-json> URL parameter. Called from
// initStage2, by which time the JSONCrush module has finished loading.
function tryLoadFromURL()
{
    const params = new URLSearchParams(location.search);
    const v = params.get('v');
    if (!v) return false;
    if (!window.JSONCrush)
    {
        console.warn('JSONCrush not available, skipping URL load');
        return false;
    }
    try
    {
        // URLSearchParams already decoded percent-encoding from the query
        // string, so v is the raw crushed payload — pass it straight in.
        const json = window.JSONCrush.uncrush(v);
        applyLoadedVase(JSON.parse(json));
        // Strip the query string so reloads/bookmarks don't keep re-applying
        // the shared payload (it's already in localStorage from applyLoadedVase).
        history.replaceState(null, '', location.pathname);
        return true;
    }
    catch (e)
    {
        console.error('Failed to load vase from URL', e);
        return false;
    }
}

const sectionForId = {
    materialType:'Glaze', vaseColor1:'Glaze', vaseColor2:'Glaze',
    materialBlendNoise:'Glaze', materialEffectScale:'Glaze',
    materialNoise:'Glaze', materialScale:'Glaze',
    materialEffectContrast:'Glaze', materialBias:'Glaze',
    materialShine:'Glaze', materialRoughness:'Glaze',
    materialSeed:'Glaze', hslBlend:'Glaze',
    vaseTop:'Vase', vaseSymmetry:'Vase', vaseSymmetryScale:'Vase',
    vaseTopRoundness:'Vase', vaseWarp:'Vase',
    handleCount:'Handles', handlePosY:'Handles', handlePosX:'Handles',
    handlePosRadius1:'Handles', handlePosRadius2:'Handles', handleAngle:'Handles',
    sceneType:'Scene', backgroundType:'Scene', sceneColor:'Scene',
    backgroundColor1:'Scene', backgroundColor2:'Scene', sceneSeed:'Scene',
    borderSeed:'Frame', postEffect:'Frame', zoom:'Frame', aspect:'Frame',
};
let lastSection;
function persistParam(id)
{
    isDirty = 1;   // any live param-control edit counts as hand-work
    if (!saveLoad) return;
    try { localStorage.paramValues = JSON.stringify(paramValues); } catch(e){}
}

// Confirm before an action that would discard the current vase. Returns true
// immediately when there's nothing to lose (isDirty is clear); otherwise shows
// a native confirm() and returns the user's choice.
function confirmDestructive(message)
{
    if (!isDirty) return true;
    return confirm(message);
}
function addDebugParam(id, name, type, options, def, update)
{
    if (!debugParams || update != 'sync')
        return;

    if (type!='number' && type!='color' && type!='select' && type!='boolean')
        return;

    // section header
    const section = sectionForId[id];
    if (section && section != lastSection)
    {
        const h = document.createElement('h2');
        h.textContent = section;
        debugSpan.appendChild(h);
        lastSection = section;
    }

    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = name;
    row.appendChild(label);

    const current = paramValues[id];
    let element;
    if (type=='number')
    {
        element = document.createElement('input');
        element.type = 'range';
        element.min  = options && options.min != undefined? options.min : 0;
        element.max  = options && options.max != undefined? options.max : 100;
        element.step = options && options.step != undefined? options.step : .1;
        element.value = current != undefined ? current : (def != undefined ? def : 0);
        element.oninput  = e => { paramValues[id] = element.value; persistParam(id); };
    }
    else if (type=='color')
    {
        element = document.createElement('input');
        element.type = 'color';
        const rgba = current && current['obj'] && current['obj']['rgba'];
        const toHex = c => c.toString(16).padStart(2, '0');
        element.value = rgba
            ? '#' + toHex(rgba['r']) + toHex(rgba['g']) + toHex(rgba['b'])
            : (def ? '#' + def.slice(0, 6) : '#ffffff');
        element.oninput  = e =>
        {
            let c = new Color;
            c.setHex(element.value);
            paramValues[id]['obj']['rgba']['r'] = c.r * 255 | 0;
            paramValues[id]['obj']['rgba']['g'] = c.g * 255 | 0;
            paramValues[id]['obj']['rgba']['b'] = c.b * 255 | 0;
            paramValues[id]['obj']['rgba']['a'] = 255;
            persistParam(id);
        };
    }
    else if (type=='select')
    {
        element = document.createElement('select');
        for(let option of options.options)
            element.options.add(new Option(option));
        element.oninput  = e => { paramValues[id] = element.value; persistParam(id); };
        let i = max(options.options.indexOf(current != undefined ? current : def), 0);
        element.selectedIndex = i;
    }
    else if (type=='boolean')
    {
        element = document.createElement('input');
        element.type = 'checkbox';
        element.checked = current != undefined ? !!current : (def != undefined && def);
        element.oninput  = e => { paramValues[id] = element.checked; persistParam(id); };
    }

    row.appendChild(element);

    // per-row reset-to-default button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-one';
    resetBtn.type = 'button';
    resetBtn.title = 'Reset to default';
    resetBtn.textContent = '↺';
    resetBtn.onclick = () =>
    {
        // find the matching param def by id
        const p = paramsList.find(pp => pp['id'] === id);
        if (!p) return;
        setParamValue(p, computeDefault(p));
        isDirty = 1;
        if (saveLoad)
            try { localStorage.paramValues = JSON.stringify(paramValues); } catch(e){}
    };
    row.appendChild(resetBtn);

    debugSpan.appendChild(row);
    paramInputs[id] = element;
}
///////////////////////////////////////////////////////////////////////////////

init();
// update() is kicked off from initStage2 (after the deferred glInit)


function autoTest()
{
    setInterval(() => {
        cameraRotation.x = random.float(normalMinPitch, normalMaxPitch);
        vase.setRandomShape();
        setupParams(paramsList);
        //animateNoise = 1;
    }, 5000 );
}