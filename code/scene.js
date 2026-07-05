'use strict';

///////////////////////////////////////////////////////////////////////////////

let cameraZoom;
let cameraPosition = vec3();
let cameraRotation = vec3();

///////////////////////////////////////////////////////////////////////

let vase;
const objectDataCount = 256;
const objectDataScale = 256 / objectDataCount;
const vaseMaxRadius = 3.;
const vaseMinRadius = .05;
const vaseMaxHeight = 7;
const vaseMinHeight = 3;
const vaseMinThickness = .1;
const vaseMaxRadiusDelta = .08 * objectDataScale; 
const vaseDataLength = 3 * (4 + objectDataCount * 2);

class Vase
{
    constructor()
    {
        this.setDefautShape();
        this.angle = 0;
        this.angleVelocity = 0;
        if (!debug)
            this.angleVelocity = !debugParams && isStandalone ? 0.01 : .05;
    } 

    setRandomShape()
    { 
        const random = new Random(Math.random()*1e7); // use real random
        this.angle = PI*2;
        this.radiusData = [];
        this.smoothData = [];
        this.topHeight = random.float(vaseMinHeight,vaseMaxHeight);
        if (random.bool())
            this.topHeight = vaseMaxHeight;
        this.thickness = vaseMinThickness;

        let r0 = random.float(1);
        let f1 = random.float(1,30);
        let o1 = random.angle();
        let r1 = random.float(vaseMinRadius,vaseMaxRadius)/f1/9;

        let f2 = random.float(8,40);
        let o2 = random.angle();
        let r2 = random.float(vaseMinRadius,vaseMaxRadius)/2;

        let shapeCurves = [random.float(.1,3), random.float(.1,3)];

        const S = (a,sc)=>
        {   
            let s = Math.sin(a);
            s = sign(s)*(Math.abs(s)**shapeCurves[sc]) ;
            return s;
        }

        let slope1 = random.float(.1,1);
        let slope2 = random.float(1,1.5);
        if (random.bool(.3))
            [slope1, slope2] = [slope2, slope1];

        for(let i = 0; i < objectDataCount; ++i)
        {
            let r = r0;
            r += r1*(.5+.5*S(i/f1+o1,0));
            r += r2*(.5+.5*S(i/f2+o2,1));
            
            let p = i/objectDataCount;
            r *= mix(slope1,slope2,p);

            this.radiusData[i] = r;
            this.smoothData[i] = 1;
        }

        this.applyLimits();
    }

    setDefautShape()
    {   
        this.deltaLeftover = 0;
        this.radiusData = [];
        this.smoothData = [];
        this.topHeight = testPole ? vaseMaxHeight : vaseMaxHeight/2;
        this.thickness = testPole ? .1 : .7;

        for(let i = 0; i < objectDataCount; ++i)
        {
            this.radiusData[i] = testPole ? vaseMaxRadius : (.7-i/objectDataCount)*2;
            this.smoothData[i] = testPole ? 1 : 0;
        }

        this.applyLimits();
    }

    getRegularity()
    {
        let total = 0;
        let end = objectDataCount*this.topHeight/vaseMaxHeight|0;
        for(let i = 0; i < end; ++i)
            total += this.smoothData[i];
        return end? total/end : 0;
    }

    getMaxRadius()
    {   
        let maxRadius = 0;
        let end = objectDataCount*this.topHeight/vaseMaxHeight|0;
        for(let i = 0; i < end; ++i)
            maxRadius = max(maxRadius, this.radiusData[i]);
        return maxRadius;
    }

    getRadiusAt(py)
    {
        // shape the vase
        let i = py * objectDataCount;
        i = i|0;
        i = clamp(i, 0, objectDataCount-1);
        return this.radiusData[i];
    }

    update()
    {   
        let hadSpeed = this.angleVelocity;
        if (abs(this.angleVelocity)<.005)
            this.angleVelocity *= .99;
        this.angleVelocity = clamp(this.angleVelocity, -.2, .2);
        this.angle += this.angleVelocity;
        if (hadSpeed && abs(this.angleVelocity) < .001)
        {
            this.angleVelocity = 0;
            needsEmit = 1;
        }
    }

    applyLimits(i=0)
    {
        // apply limits to vase data
        let radius;
        
        radius = this.radiusData[i|0];
        for(let j = i|0; j < objectDataCount; ++j)
        {
            let radiusTarget = this.radiusData[j];
            radiusTarget = clamp(radiusTarget, vaseMinRadius, vaseMaxRadius);
            
            let delta = radiusTarget - radius;
            delta = clamp(delta, -vaseMaxRadiusDelta, vaseMaxRadiusDelta);
            this.radiusData[j] = radius += delta;
        }

        radius = this.radiusData[i|0];
        for(let j = i|0; j >= 0; --j)
        {
            let radiusTarget = this.radiusData[j];
            radiusTarget = clamp(radiusTarget, vaseMinRadius, vaseMaxRadius);
            
            let delta = radiusTarget - radius;
            delta = clamp(delta, -vaseMaxRadiusDelta, vaseMaxRadiusDelta);
            this.radiusData[j] = radius += delta;
        }
    }

    getPackedData()
    {
        function floatToBytes(value) 
        {
            let scaled = Math.round(value * 16777215);
            let byte1 = scaled & 255;
            let byte2 = (scaled >> 8) & 255;
            let byte3 = scaled >> 16;
            return [byte1, byte2, byte3];
        }

        let k = 0;
        let packed = new Uint8Array(vaseDataLength);
        function packData(v, min=0, max=1)
        {
            const p = percent(v, min, max);
            const b = floatToBytes(p);
            packed[k++] = b[0];
            packed[k++] = b[1];
            packed[k++] = b[2];
        }

        for(let i = 0; i < objectDataCount; ++i)
            packData(this.radiusData[i], 0, vaseMaxRadius);
        for(let i = 0; i < objectDataCount; ++i)
            packData(this.smoothData[i]);
        packData(this.topHeight, vaseMinHeight, vaseMaxHeight);
        packData(this.thickness);
        packData(mod(this.angle,2*PI),0,2*PI);
        packData(cameraRotation.x,normalMinPitch,normalMaxPitch);

        return packed;
    }

    loadPackedData(data)
    {
        if (data.length != vaseDataLength)
            return false;

        function bytesToFloat(byte1, byte2, byte3)
        {
            let combined = (byte3 << 16) + (byte2 << 8) + byte1;
            let float = combined / 16777215;
            return float;
        }

        let k = 0;
        function unpackData(min=0, max=1)
        {
             const p = bytesToFloat(data[k++], data[k++], data[k++]);
             return mix(min, max, p);
        }

        for(let i = 0; i < objectDataCount; ++i)
            this.radiusData[i] = unpackData(0, vaseMaxRadius);
        for(let i = 0; i < objectDataCount; ++i)
            this.smoothData[i] = unpackData();
        this.topHeight = unpackData(vaseMinHeight, vaseMaxHeight);
        this.thickness = unpackData();
        this.angle = unpackData(0,2*PI);
        cameraRotation.x = unpackData(normalMinPitch,normalMaxPitch);

        this.applyLimits();

        return true;
    }

    pushUp(py, deltaArray)
    {
        let topPercent = this.topHeight / vaseMaxHeight;

        // only move in integer amounts
        const deltaArrayOriginal = deltaArray + this.deltaLeftover;
        if (py < topPercent - .1)
            deltaArray = Math.round(deltaArrayOriginal);
        this.deltaLeftover = deltaArrayOriginal - deltaArray;
        let delta = deltaArray  / (objectDataCount / vaseMaxHeight);
        this.topHeight += delta;
        this.topHeight = clamp(this.topHeight, vaseMinHeight, vaseMaxHeight);

        if (deltaArray == 0)
            return;

        if (this.topHeight >= vaseMaxHeight && deltaArray > 0 || this.topHeight <= vaseMinHeight && deltaArray < 0)
            return;

        let newRadiusData = [];
        let newSmoothData = [];
        let pushStart = py*objectDataCount;
        for(let j = 0; j < objectDataCount; ++j)
        {
            // resample
            let j2 = j - deltaArray;
            let j2a = clamp(j2|0,0,objectDataCount-1);
            let j2b = clamp(j2+1|0,0,objectDataCount-1);
            let v2a = this.radiusData[j2a];
            let s2a = this.smoothData[j2a];
            let v2b = this.radiusData[j2b];
            let s2b = this.smoothData[j2b];
            let v2 = mix(v2a, v2b, j2%1);
            let s2 = mix(s2a, s2b, j2%1);
            
            const fadeSize = 4;
            let fade = clamp((j-pushStart)/fadeSize);
            if (j < pushStart)
                fade = 0;

            let v = this.radiusData[j];
            let s = this.smoothData[j];
            newRadiusData[j] = mix(v,v2,fade);
            newSmoothData[j] = mix(s,s2,fade);

        }

        this.radiusData = newRadiusData;
        this.smoothData = newSmoothData;
    }

    sculpt(px, py, delta)
    {
        const soft = keyIsDown('Shift');  
        const precise = mouseIsDown[1] || altKeyDown; 

        // shape the vase
        //let rotateP = percent(cameraRotation.x,normalMinPitch, normalMaxPitch);
        //let a = mix(-.03,-.09,rotateP);
        //let b = mix(1.02,.99,rotateP);
        //py = percent(py,a,b);
        //py *= .97; // fix up error

        let i = py * objectDataCount;
        i = clamp(i, 0, objectDataCount-1);
        px = clamp(px);
        const x = px * vaseMaxRadius;
        //console.log(px)

        this.topHeight  = clamp(this.topHeight,vaseMinHeight,vaseMaxHeight);
        const percentHeight = this.topHeight/vaseMaxHeight;
        //console.log(delta.y*99.)
        if (py > percentHeight)
        {
            if (py > percentHeight+.2)
                return;
                
            let s = clamp((py -percentHeight)/.4);
            delta.y = mix(delta.y,-.1,s)
        }

        const oldThickness = this.thickness;
        this.thickness -= .002;
        this.thickness = max(vaseMinThickness,this.thickness);
        const deltaThickness = this.thickness - oldThickness;

        const jTop = objectDataCount * percentHeight;
        let moveAmount = precise ? .03 :.04;
        let controlTightness = precise ? 5 : 25;
        let controlTightnessSculptSize = precise ? 5 : 15;
        if (soft)
            moveAmount /= 4;

        controlTightness /= objectDataScale; 
        controlTightnessSculptSize /= objectDataScale; 

        sculptSize = vaseMaxHeight*controlTightnessSculptSize/objectDataCount;
        sculptPos = vec3(this.radiusData[i|0]+this.thickness,vaseMaxHeight*py);
        //sculptPos = sculptPos.rotateY(-.5);

        let deltaTotal = 0;
        for(let j = 0; j < objectDataCount; ++j)
        {
            // area to move
            let v = this.radiusData[j];
            let d = abs(j - i)/controlTightness;
            d = percent(d, 1, 0);
            //d = d**6;
            d = smoothstep(d);

            // apply movement
            const oldV = v;
            v = mix(v, x, d*moveAmount);

            v -= deltaThickness; // add thickess back in
            this.radiusData[j] = v;

            if (j < jTop)
                deltaTotal += (v-oldV);

            let d2 = 19+abs(j - i)**2
            d2 = 2./d2;
            let worse = .0005;
            if (soft)
                worse = 0;
            d2 -= worse; // get worse when touching
            d2 = clamp(d2, -.002, .005);
            const smoothData = this.smoothData[j];
            this.smoothData[j] = clamp(smoothData+d2);
        }
        
        let deltaY = -49*delta.y;
        deltaY = clamp(deltaY, -8,8);
        //deltaY -= deltaTotal/4;
        deltaY -= 90*deltaThickness;
        if (!soft)
            this.pushUp(py, deltaY);
            //else
            //console.log('test')

        this.applyLimits(i);
    }
}

function smoothVaseData(array)
{
    let windowSize = 1;
    let newArray = [];
    for(let i = 0; i < array.length; ++i)
    {
        let total = 0, count = 0;
        for(let j = -windowSize; j <= windowSize; ++j)
        {
            let k = i + j;
            if (k<0 || k>=array.length)
                continue;

            total += array[k];
            ++count;
        }
        newArray[i] = total / count;
    }

    return newArray;
}

function test()
{
    let packed = vase.getPackedData();
    let angle = vase.angle;
    vase = new Vase;
    vase.loadPackedData(packed);
    vase.angle = angle;
    //vase.smooth()
    console.log(packed);
    console.log(packed.length);
}

/*
function testShaderVase()
{
    let o = '(';

    for(let i = 0;i < objectDataCount; ++i)
    {
        o += `vec2(${shaderFloat(vase.radiusData[i])},${shaderFloat(vase.smoothData[i])})`
        if (i < objectDataCount-1)
            o += ',';
    }

    o += ');';
    return o;
}*/

///////////////////////////////////////////////////////////////////////////////
// save states

const maxSaveStates = 256;

let stateUndo = [], stateRedo  = []; 


function redoState()
{
    if (!stateRedo.length)
        return;

    const topState = stateRedo.pop();
    stateUndo.push(topState);
    loadState(topState);
}

function undoState()
{
    if (stateUndo.length <= 1)
        return;

    stateRedo.push(stateUndo.pop());
    const topState = stateUndo[stateUndo.length-1];
    loadState(topState);
}

function saveState()
{
    let radiusData = [...vase.radiusData];
    let smoothData = [...vase.smoothData];
    let topHeight = vase.topHeight;
    let thickness = vase.thickness;
    let angle = vase.angle;
    let pitch = cameraRotation.x;
    const saveState = {radiusData, smoothData, topHeight, thickness, angle, pitch};
    stateUndo.push(saveState);
    if (stateUndo.length > maxSaveStates)
        stateUndo.shift();
    stateRedo = [];

    if (saveLoad)
        localStorage.saveState = JSON.stringify(saveState);
}

function loadState(saveState, startup = 0)
{
    if (!saveState.radiusData || !saveState.smoothData)
        return;

    vase.radiusData = [...saveState.radiusData];
    vase.smoothData = [...saveState.smoothData];
    vase.topHeight = saveState.topHeight;
    vase.thickness = saveState.thickness;
    if (startup)
    {
        vase.angle = saveState.angle;
        cameraRotation.x = saveState.pitch;
    }

    if (saveLoad)
        localStorage.saveState = JSON.stringify(saveState);
}
