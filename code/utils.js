// SHORTRAY - A raymarching engine by Frank Force - Copyright 2022

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Mini Math Library

const PI         = Math.PI;
const abs        = (a)=> a < 0 ? -a : a;
const min        = (a, b)=> a < b ?  a : b;
const max        = (a, b)=> a > b ?  a : b;
const sign       = (a)=> a < 0 ? -1 : 1;
const mod        = (a, b=1)=> ((a % b) + b) % b;
const floor      = (a)=> Math.floor(a);
const clamp      = (v, min=0, max=1)=> v < min ? min : v > max ? max : v;
const percent    = (v, min=0, max=1)=> max-min ? clamp((v-min) / (max-min)) : 0;
const percentNoClamp = (v, min=0, max=1)=> max-min ? ((v-min) / (max-min)) : 0;
const mix        = (min, max, p)=> min + clamp(p) * (max-min);
const smoothstep = (p)=> p*p*(3 - 2 * p);
const hypot      = (x, y, z=0) => (x*x + y*y + z*z)**.5;
const shaderFloat = (f, precision=3) =>
{
    f = f.toFixed(precision);
    return f == (f|0) ? (f|0) +'.' : f;
}
const ASSERT = (...assert)=> console.assert(...assert);

///////////////////////////////////////////////////////////////////////////////
// 3D Vector Class

const vec3 = (x, y, z)=>
{
    return y == undefined && z == undefined ?
        new Vector3(x, x, x) : new Vector3(x, y, z);
}
class Vector3
{
    constructor(x=0, y=0, z=0)
    {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    copy() { return vec3(this.x, this.y, this.z); }
    isZero() { return this.x == 0 && this.y == 0 && this.z == 0; }
    abs() { return vec3(abs(this.x), abs(this.y), abs(this.z)); }
    add(v) { return vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    subtract(v) { return vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    multiply(v) { return vec3(this.x * v.x, this.y * v.y, this.z * v.z); }
    divide(v) { return vec3(this.x / v.x, this.y / v.y, this.z / v.z); }
    scale(s) { return vec3(this.x * s, this.y * s, this.z * s); }
    length() { return this.lengthSquared()**.5; }
    lengthSquared() { return this.x**2 + this.y**2 + this.z**2; }
    distance(v) { return this.distanceSquared(v)**.5; }
    distanceSquared(v) { return this.subtract(v).lengthSquared(); }
    normalize(length=1) { const l = this.length(); return l ? this.scale(length/l) : vec3(length); }
    clampLength(length=1) { const l = this.length(); return l > length ? this.scale(length/l) : this; }
    dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
    angleBetween(v) { return Math.acos(clamp(this.dot(v), -1, 1)); }
    max(v) { return vec3(max(this.x, v.x), max(this.y, v.y), max(this.z, v.z)); }
    min(v) { return vec3(min(this.x, v.x), min(this.y, v.y), min(this.z, v.z)); }
    floor() { return vec3(floor(this.x), floor(this.y), floor(this.z)); }
    mod(a) { return vec3(mod(this.x, a), mod(this.y, a), mod(this.z, a)); }
    modVec3(v) { return vec3(mod(this.x, v.x), mod(this.y, v.y), mod(this.z, v.z)); }
    round() { return vec3(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }
    clamp(a, b) { return vec3(clamp(this.x, a, b), clamp(this.y, a, b), clamp(this.z, a, b)); }
    clampVec3(a, b) { return vec3(clamp(this.x, a.x, b.x), clamp(this.y, a.y, b.y), clamp(this.z, a.z, b.z)); }
    smoothstep(a) { return vec3(smoothstep(this.x), smoothstep(this.y), smoothstep(this.z)); }
    negate() { return vec3(-this.x, -this.y, -this.z); }
    cross(v) { return vec3(
        this.y*v.z - this.z*v.y, 
        this.z*v.x - this.x*v.z, 
        this.x*v.y - this.y*v.x); }
    reflect(v) { return this.subtract(v.scale(2*this.dot(v))); }
    pow(p) { return new Vector3(this.x**p, this.y**p, this.z**p); }
    mix(v, p) { return this.add(v.subtract(this).scale(clamp(p))); }
    swizzle(s) { return vec3(this[s[0]], this[s[1]], this[s[2]]) }
    rotateXYZ(r) { return this.rotateX(r.x).rotateY(r.y).rotateZ(r.z); }
    inverseRotateXYZ(r) { return this.rotateZ(-r.z).rotateY(-r.y).rotateX(-r.x); }
    rotateX(a)
    {
        if (!a) return this;
        const c = Math.cos(a), s = Math.sin(a);
        return vec3(this.x, this.y*c-this.z*s, this.y*s+this.z*c)
    }
    rotateY(a)
    {
        if (!a) return this;
        const c = Math.cos(a), s = Math.sin(a);
        return vec3(this.x*c-this.z*s, this.y, this.x*s+this.z*c)
    }
    rotateZ(a)
    {
        if (!a) return this;
        const c = Math.cos(a), s = Math.sin(a);
        return vec3(this.x*c-this.y*s, this.x*s+this.y*c, this.z);
    }
    getRotation()
    { return vec3(Math.atan2(this.y, hypot(this.x, this.z)), Math.atan2(this.x, -this.z)); }

    getArray() { return [this.x, this.y, this.z]; }
    getJSON() { return JSON.stringify(this); }
    setJSON(json)
    {
        const v = JSON.parse(json); 
        [this.x, this.y, this.z] = [v.x, v.y, v.z];
        return this;
    }

    getShaderCode()
    {
        return this.x == this.y && this.y == this.z ?
             this.x == (this.x|0) ? `vec3(${this.x|0})` : `vec3(${shaderFloat(this.x)})` :
            `vec3(${shaderFloat(this.x)}, ${shaderFloat(this.y)}, ${shaderFloat(this.z)})`; 
    }

    getShaderRotateXYZCode()
    {
        const r = vec3(1,0,0).inverseRotateXYZ(this);
        const u = vec3(0,1,0).inverseRotateXYZ(this);
        const f = vec3(0,0,1).inverseRotateXYZ(this);
        return `mat3(${r.getShaderCode()}, ${u.getShaderCode()}, ${f.getShaderCode()})`; 
    }
    
    getXYZForward() { return vec3(0,0,1).rotateXYZ(this); }
    getXYZRight() { return vec3(0,1,0).cross(this.getXYZForward()).normalize(); }
    getXYZUp()
    { 
        const f = this.getXYZForward();
        const r = vec3(0,1,0).cross(f).normalize();
        return r.cross(f); 
    }
}

///////////////////////////////////////////////////////////////////////////////
// RGB Color Class

const RGB = (r, g, b, a=1)=> new Color(r, g, b, a);
const HSL = (h, s, l, a=1)=> new Color().setHSL(h, s, l, a);
class Color
{
    constructor(r=0, g=0, b=0, a=0)
    { this.r = r; this.g = g; this.b = b; this.a = a; }

    setR(r) { return new Color(r, this.g, this.b, this.a ); }
    setG(g) { return new Color(this.r, g, this.b, this.a ); }
    setB(b) { return new Color(this.r, this.g, b, this.a ); }
    setA(a) { return new Color(this.r, this.g, this.b, a ); }
    setVec3(v) { return new Color(v.x, v.y, v.z, 1 ); }
    copy() { return new Color(this.r, this.g, this.b, this.a ); }
    add(c) { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }
    divide(c) { return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a); }
    scale(s, a=s) { return new Color(this.r*s, this.g*s, this.b*s, this.a*a); }
    pow(p) { return new Color(this.r**p, this.g**p, this.b**p, this.a); }
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }
    mix(c, p) { return this.add(c.subtract(this).scale(clamp(p))); }
    toString() { return `rgb(${this.r*256},${this.g*256},${this.b*256},${this.a})`; }
    getRGB() { return `rgb(${this.r*256},${this.g*256},${this.b*256})`; }
    getArray() { return [this.r, this.g, this.b, this.a]; }
    getLightness() { return (this.r + this.g + this.b) / 3; }
    setHSL(h=0, s=0, l=0, a=1)
    {
        h = mod(h);
        s = clamp(s);
        l = clamp(l);
        const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q,
            f = (p, q, t)=>
                (t = (t%1+1)%1) < 1/6 ? p+(q-p)*6*t :
                t < 1/2 ? q :
                t < 2/3 ? p+(q-p)*(2/3-t)*6 : p;
                
        this.r = f(p, q, h + 1/3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1/3);
        this.a = a;
        return this;
    }
    getHSL()
    {
        let r = this.r, g = this.g, b = this.b;
        let maxColor = max(r, max(g, b));
        let minColor = min(r, min(g, b));

        let l = (maxColor + minColor) / 2.; // lightness
        let s = 0., h = 0.;
        if (maxColor != minColor)
        {
            // saturation
            let delta = maxColor - minColor;
            if (l < .5) s = delta / (maxColor + minColor);
            else s = delta / (2. - maxColor - minColor);
        
            // hue
            if (r == maxColor) h = (g - b) / delta;
            else if (g == maxColor) h = 2. + (b - r) / delta;
            else h = 4. + (r - g) / delta;
            h /= 6.;
            h += h < 0. ? 1. : 0.;
        }
        
        return [h, s, l];
    }

    getJSON() { return JSON.stringify(this); }
    setJSON(json)
    {
        const v = JSON.parse(json); 
        [this.r, this.g, this.b, this.a] = [v.r, v.g, v.b, v.a];
        return this;
    }
    getShaderCode()
    { 
        return this.r == this.g && this.g == this.b ?
             this.r == (this.r|0) ? `vec3(${this.r|0})` : `vec3(${shaderFloat(this.r)})` :
            `vec3(${shaderFloat(this.r)}, ${shaderFloat(this.g)}, ${shaderFloat(this.b)})`; 
    }

    setFXParam(param)
    {
        let rgba = param['obj']['rgba'];
        this.r = rgba['r']/255;
        this.g = rgba['g']/255;
        this.b = rgba['b']/255;
        this.a = rgba['a']/255;
        return this;
    }
    
    /** Set this color from a hex code
     * @param {String} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        const fromHex = (c)=> clamp(parseInt(hex.slice(c,c+2),16)/255);
        this.r = fromHex(1);
        this.g = fromHex(3),
        this.b = fromHex(5);
        this.a = hex.length > 7 ? fromHex(7) : 1;
        return this;
    }
}

function logColors(colors, title = "")
{
    let colorCssList = [];
    let colorString = "";
    for (const color of colors)
    {
        colorString += "%c      ";
        colorCssList.push("border:1px solid #000; background:" + color);
    }
    console.log(title + colorString, ...colorCssList);
}

///////////////////////////////////////////////////////////////////////////////
// Seeded Random Number Generator

class Random
{
    constructor(seed) { this.setSeed(seed); }
    setSeed(seed) { this.startSeed = this.seed = seed|0; }
    resetSeed() { this.seed = this.startSeed; }
    saveSeed() { this.startSeed = this.seed; }
    float(a=1, b=0)
    {
        // xorshift algorithm
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return b + (a - b) * ((this.seed >>> 0) / 2**32);
    }
    floatSign(a, b)   { return this.float(a,b) * this.sign(); }
    int(a=1, b=0)     { return this.float(a, b)|0; }
    bool(chance = .5) { return this.float() < chance; }
    sign()            { return this.bool() ? -1 : 1; }
    angle(p=1)        { return this.float(PI*2*p); }
    circle(radius, bias = .5)
    {
        const r = this.float()**bias*radius;
        const a = this.float(PI*2);
        return vec3(r*Math.cos(a), r*Math.sin(a));
    }
    vec3(a=1, b=0)
    {
        return vec3(this.float(a,b), this.float(a,b), this.float(a,b));
    }
    color(a=1, b=0)
    {
        return new Color(this.float(a,b), this.float(a,b), this.float(a,b));
    }
}

///////////////////////////////////////////////////////////////////////////////
// Save Image

const downloadLink = document.createElement('a');
function saveCanvas(canvas, filename = 'shortray', savePng = 0)
{
    const saveType = savePng ? 'png' : 'jpg';
    const mimeType = savePng ? 'image/png' : 'image/jpeg';
    downloadLink.download = filename + '.' + saveType;
    downloadLink.href = canvas.toDataURL(mimeType)
        .replace(mimeType,'image/octet-stream');
    downloadLink.click();
    console.log('Saved image ' + filename);
}