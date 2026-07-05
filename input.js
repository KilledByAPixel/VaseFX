'use strict';

let inputDataPressed = [];
let inputDataDown = [];
let mousePressed = [];
let mouseWasReleased = [];
let mouseIsDown = [];
let mouseWheel = 0;
let altKeyDown;
let mousePos = vec3();
let mouseMove = vec3();
const isTouchDevice = window.ontouchstart !== undefined;

function updateInputPost()
{
    mouseWheel = 0;
    mouseMove = vec3();
    inputDataPressed = [];
    mouseWasReleased = [];
    mousePressed = [];
    
}

const keyIsDown = (key)=> inputDataDown[key] === 1;
const keyWasPressed = (key)=> inputDataPressed[key] === 1;

window.addEventListener('keydown', function(e)
{
    if (e.altKey)
        altKeyDown = 1;

    //if (!e.repeat)
    {
        let key = e.key+'';
        if (key.length == 1)
            key = key.toLowerCase();
        inputDataPressed[key] = 1;
        inputDataDown[key] = 1;
        //console.log(key);
    }
    if (e.key != 'F12' && e.key != 'F11' && e.key != 'F5')
    {
        e.preventDefault();
        e.stopPropagation();
    }
}, { passive: false });

window.addEventListener('keyup', function(e)
{
    if (!e.altKey)
        altKeyDown = 0;

    let key = e.key+'';
    if (key.length == 1)
        key = key.toLowerCase();
    inputDataDown[key] = 0;
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

onblur = (e)=>
{
    inputDataPressed = [];
    inputDataDown = [];
    mousePressed = [];
    mouseIsDown = [];
    mouseWasReleased = [];
    altKeyDown = 0;
}


function initInput()
{

//onwheel = e=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
window.addEventListener('wheel', (e)=>{
    // Let the side panel scroll naturally — don't intercept wheel events
    // that originate inside it.
    if (e.target && e.target.closest && e.target.closest('#vasePanel'))
        return;
    e.ctrlKey || (mouseWheel = sign(e.deltaY));
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

const engineMouseUp = (e)=>{
    mouseIsDown[e.button] = 0;
    mouseWasReleased[e.button] = 1;
    e.preventDefault();
    e.stopPropagation();
}

window.addEventListener('mouseup', engineMouseUp, { passive: false });

const engineMouseDown = (e)=>{
    if (debugParams && e.target != glCanvas)
        return;
    if (!window['mainCanvas'])
        return;

    mousePressed[e.button] = 1;
    mouseIsDown[e.button] = 1;

    if (e.button == 0 && freeLook)
    {
        mainCanvas.requestPointerLock = 
            mainCanvas.requestPointerLock || mainCanvas.mozRequestPointerLock;
        mainCanvas.requestPointerLock();
    }
    if (e.button)
    {
        e.preventDefault();
        e.stopPropagation();
    }
}

window.addEventListener('mousedown', engineMouseDown, { passive: false });

onmousemove = e => 
{
    if (!window['mainCanvas'])
        return;
    let canvas = mainCanvas;
    let width = canvas.width, height = canvas.height;
    let rect = canvas.getBoundingClientRect();
    let mouseX = (e.x - rect.left) / rect.width;
    let mouseY = (e.y - rect.top) / rect.height;

    //if (mouseX >=0 && mouseX <= 1 && mouseY >= 0 && mouseY <=1)
    {
        mouseX *= width;
        mouseY *= height;
        mouseX = clamp(mouseX/width);
        mouseY = clamp(mouseY/height);
        mousePos = vec3(mouseX, mouseY);
    }

    if (document.pointerLockElement)
    {
        mouseMove.x += e.movementX;
        mouseMove.y += e.movementY;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Touch input


// try to enable touch mouse
if (isTouchDevice)
{
    // override mouse events
    let wasTouching, mouseDown = engineMouseDown, mouseUp = engineMouseUp;
    onmousedown = onmouseup = ()=> 0;

    // setup touch input
    ontouchstart = (e)=>
    {
        // fix mobile audio, force it to play a sound on first touch
        //zzfx(0);

        // handle all touch events the same way
        ontouchstart = ontouchmove = ontouchend = (e)=>
        {
            e.button = 0; // all touches are left click

            // check if touching and pass to mouse events
            const touching = e.touches.length;
            if (touching)
            {
                // set event pos and pass it along
                e.x = e.touches[0].clientX;
                e.y = e.touches[0].clientY;
                if (!wasTouching)
                    mouseDown(e);

                onmousemove(e);
            }
            else if (wasTouching)
                mouseUp(e);

            // set was touching
            wasTouching = touching;

            // prevent default handling like copy and magnifier lens
            if (document.hasFocus()) // allow document to get focus
                e.preventDefault();

            // must return true so the document will get focus
            return true;
        }

        return ontouchstart(e);
    }
}
}