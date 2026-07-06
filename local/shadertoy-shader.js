'use strict';

// ShaderToy-compliant VaseFX demo shader.
// The contents of this template string are exactly what gets pasted into
// the ShaderToy "Image" tab — no buffers, no textures, no external inputs.
// Preview locally with local/shadertoy.html.

const shadertoyShaderCode = `// VaseFX - Infinite Pottery
// Copyright Frank Force 2026
// www.frankforce.com
//
// Every few seconds a brand new procedurally generated vase appears -
// shape, glaze, handles, lighting, and scene are all randomized, then
// raymarched in a single pass. Drag horizontally to flip through more
// vases.
//
// This is a demo of VaseFX, my interactive pottery sculpting tool.

// how long each vase is on screen and the fade between them
#define SHOT_TIME   6.
#define FADE_TIME   .4
// how many extra vases a full mouse drag scrubs through
#define MOUSE_VASES 30.

// always 0, but the compiler can't prove it - putting this in loop bounds
// stops drivers from unrolling the big marching loops, which cuts shader
// compile time drastically (especially on Windows where WebGL uses Direct3D)
#define ZERO (min(iFrame,0))

// vase constants (match the VaseFX app)
#define vaseMaxHeight 7.
#define vaseMinHeight 3.
#define vaseMaxRadius 3.
#define vaseMinRadius .05

#define vaseThickness (vaseInfo.x)
#define vaseTopHeight (vaseInfo.y)
#define vaseAngle (vaseInfo.z)
#define materialSeed (materialEffects.z)

///////////////////////////////////////////////////////////////////////////////
// parameters normally passed in as uniforms by the VaseFX app,
// generated procedurally per shot by initScene()

vec4 vaseColor1, vaseColor2, backgroundColor1, backgroundColor2;
vec4 sceneInfo, sceneColor, materialEffects, materialEffects2;
vec4 handleInfo, handleInfo2, sceneEffects;
vec4 vaseInfo, vaseInfo2, vaseInfo3, vaseInfo4;
vec4 lightAmbient, lightDirection1, lightColor1, lightDirection2, lightColor2;
vec4 cameraPosition, cameraRotation;

///////////////////////////////////////////////////////////////////////////////
// tiny seeded rng (stands in for the app's xorshift Random class)

float g_rand;
float hash11(float p) { p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float rnd() { return hash11(g_rand += 1.); }
float rnd(float a, float b) { return mix(a, b, rnd()); }
float rndSign() { return rnd() < .5 ? -1. : 1.; }
bool rndBool(float chance) { return rnd() < chance; }
vec3 rndColor() { return vec3(rnd(), rnd(), rnd()); }

///////////////////////////////////////////////////////////////////////////////
// procedural vase profile (port of Vase.setRandomShape from the app,
// replaces the radius data texture the app feeds in through iChannel0)

float vr0, vr1, vr2, vf1, vf2, vo1, vo2, vsc1, vsc2, vslope1, vslope2;

float vaseShapeSin(float a, float curve)
{
    float s = sin(a);
    return sign(s)*pow(abs(s), curve);
}

float getVaseRadius(float z) // z = 0 at the base, 1 at vaseMaxHeight
{
    float i = z*256.; // the app builds a 256 sample profile
    float r = vr0;
    r += vr1*(.5+.5*vaseShapeSin(i/vf1+vo1, vsc1));
    r += vr2*(.5+.5*vaseShapeSin(i/vf2+vo2, vsc2));
    r *= mix(vslope1, vslope2, z);
    return clamp(r, vaseMinRadius, vaseMaxRadius);
}

// VaseFX Raymarching Engine
// Copyright Frank Force 2023
// www.frankforce.com

// global settings - lower the iteration counts if your GPU struggles
const int maxRaycastIterations = 300;
const int maxAmbientShadowIterations = 150;
const int maxShadowIterations = 150;
const float raycastMinRange = 0.1;
const float raycastAccuracy = 0.01;
const float PI = 3.141592653589793;
const float raycastScale = .3;
const float maxRange = 100.;
const float gamma = 2.2;

// forward declarations
vec3 getColor(vec3 startPosition, vec3 direction);
vec2 sceneDistance(vec3 position, bool isRaycast, vec3 direction);
vec3 hash(vec3 p);
vec3 noise3(vec3 p);
vec3 fractalNoise3(vec3 p, int octaves);

float getPercent(float v, float a, float b) { return clamp((v-a)/(b-a),0.,1.); }

vec3 hsl2rgb( vec3 c)
{
    vec3 rgb = clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1., 0., 1.);
    return c.z + c.y * (rgb-.5)*(1.-abs(2.*c.z-1.));
}

vec3 rgb2hsl(vec3 rgb)
{
    float r = rgb.r, g = rgb.g, b = rgb.b;
    float maxColor = max(r, max(g, b));
    float minColor = min(r, min(g, b));

    float l = (maxColor + minColor) / 2.;
    float s = 0., h = 0.;
    if (maxColor != minColor)
    {
        float delta = maxColor - minColor;
        if (l < .5) s = delta / (maxColor + minColor);
        else s = delta / (2. - maxColor - minColor);

        if (r == maxColor) h = (g - b) / delta;
        else if (g == maxColor) h = 2. + (b - r) / delta;
        else h = 4. + (r - g) / delta;
        h /= 6.;
        h += h < 0. ? 1. : 0.;
    }

    return vec3(h, s, l);
}

vec2 rotate(vec2 v, float angle)
{ return v*cos(angle) + vec2(-v.y,v)*sin(angle); }
vec3 rotateXYZ(vec3 v, vec3 angles)
{
	v.yz = rotate(v.yz, angles.x);
	v.xz = rotate(v.xz, angles.y);
	v.xy = rotate(v.xy, angles.z);
	return v;
}

mat3 getRotationMatrix(vec3 rotation)
{
    return mat3(
        rotateXYZ(vec3(1,0,0), rotation),
        rotateXYZ(vec3(0,1,0), rotation),
        rotateXYZ(vec3(0,0,1), rotation)
    );
}

vec3 toneMapAces(vec3 v)
{
    // Narkowicz 2016, "ACES Filmic Tone Mapping Curve"
    // http://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((v * (a * v + b)) / (v * (c * v + d) + e), 0., 1.);
}

// main rendering function
void renderScene(out vec4 fragColor, vec2 fragCoord)
{
    // get uv
    vec2 uv = (2.*fragCoord - iResolution.xy) / iResolution.y;

    // cast ray
    mat3 cameraTransform = getRotationMatrix(cameraRotation.xyz);
    float cameraZoom = cameraPosition.w;
    vec3 direction = cameraTransform * normalize(vec3(uv, cameraZoom));
    vec3 cameraPos = cameraPosition.xyz;
    vec3 color = getColor(cameraPos, direction);

    // tone mapping
    color = toneMapAces(color);

    // gamma
    color = pow(color, vec3(1./gamma));

    fragColor = vec4(color, 1);
}

// fast build noise, prevent inlining calls to hash
vec3 noise3(vec3 p)
{
    vec3 i = floor(p) + 99.;
    vec3 f = fract(p);
    f = f*f*(3.-2.*f);

    vec3 hashResult[8];
    for(int j=ZERO; j<8; ++j)
        hashResult[j] = hash(i+vec3(j&1,(j&2)>>1,(j&4)>>2));

    return mix(
        mix
        (
            mix(hashResult[0], hashResult[1], f.x),
            mix(hashResult[2], hashResult[3], f.x),
            f.y
        ),
        mix
        (
            mix(hashResult[4], hashResult[5], f.x),
            mix(hashResult[6], hashResult[7], f.x),
            f.y
        ),
        f.z
    );
}

vec3 fractalNoise3(vec3 p, int octaves)
{
    // simpler than tracking per-octave ta + f: bake frequency into p,
    // and use a fixed normalization constant (~1/1.75, matching 3-octave
    // amplitude sum, which is the most common octave count here).
    vec3 t = vec3(0);
    float a = 1.;
    for (int i = octaves + ZERO; --i >= 0;)
    {
        t += a * noise3(p);
        a *= .5;
        p *= 2.;
    }
    return t * .57;
}

vec2 raycast(vec3 position, vec3 direction)
{
    // cast the ray
    const float range = maxRange;
    const float minRange = raycastMinRange;
    const float accuracy = raycastAccuracy;
    float total = minRange;
    float nearestDistance = 1e9;
    vec2 nearestResult = vec2(1e4);
    for (int i = maxRaycastIterations + ZERO; --i > 0;)
    {
        vec2 distanceResult = sceneDistance(position + total * direction, true, direction);
        total += distanceResult.x*raycastScale;
        float tp = total * total * total;
        if (distanceResult.x < tp * nearestDistance)
        {
            // fix flickering pixel around edges
            nearestDistance = distanceResult.x / tp;
            nearestResult = vec2(total, distanceResult.y);
        }
        if (distanceResult.x < accuracy)
            return nearestResult;
        if (total > range)
            return vec2(range, -1);
    }

    return nearestResult;
}

float getShadow(vec3 position, vec3 direction, float softness, float range, bool ambient, bool occlusion)
{
    // cast the shadow
    const float minRange = raycastMinRange;
    float accuracy = raycastAccuracy;
    float distanceLast = 1e9;
    float shadow = 1.;
    float total = minRange;
    int iterations = (occlusion ? 10 : ambient ? maxAmbientShadowIterations : maxShadowIterations) + ZERO;

    float minMove = 1e9;
    if (occlusion)
    {
        softness = 1.;
        accuracy = -1e9;
        minMove = .05;
    }

    float totalOcclusion = 0.;
    for (int i = 0; accuracy < shadow && ++i < iterations;)
    {
        // estimated shadow distance
        float distance = sceneDistance(position + total * direction, false, direction).x;
        float moveDistance = min(raycastScale*distance, minMove);
        total += moveDistance;
        if (total > range)
            return occlusion ? 0. : smoothstep(0., 1., shadow);

        totalOcclusion += max(1. - distance/total, 0.);
        shadow = min(shadow, distance / total / softness);
        distanceLast = distance;
    }
    return occlusion ? totalOcclusion : 0.;
}

vec3 getLight(vec3 lightDirection, vec3 lightColor, float lightSoftness, vec3 position, vec3 direction, vec3 normal, vec3 diffuseColor, vec3 specularColor, float specularPower, float ambientReflect, bool ambient, bool occlusion)
{
    // check if full shadow
    float diffuseDot = dot(lightDirection, normal);
    if (!occlusion && diffuseDot < 0.)
        return vec3(0);

    // apply shadow and shading
    float shadowAmount = getShadow(position, lightDirection, lightSoftness, 1e3, ambient, occlusion);
    if (ambient) // ambient reflections
        return (ambientReflect * shadowAmount) * lightColor * specularColor;
    if (occlusion)
    {
        const float occlusonScale = .1;
        return lightColor * diffuseColor * max(1. - occlusonScale * shadowAmount, 0.) * (.7+.3*lightDirection.y);
    }

    vec3 diffuse = (diffuseDot * shadowAmount) * lightColor * diffuseColor;
    if (specularPower == 0.)
        return diffuse;

    // apply specular
    vec3 reflectDirection = reflect(lightDirection, normal);
    float specularDot = pow(max(dot(direction, reflectDirection), 0.), 1. + specularPower);
    vec3 specular = (specularDot * shadowAmount) * lightColor * specularColor;
    return diffuse + specular;
}

///////////////////////////////////////////////////////////////////////////////
// distance shapes
float opOnion(float sdf, float thick) { return abs(sdf)-thick; }
vec2 opRevolution(vec3 p, float w) { return vec2( length(p.xz) - w, p.y ); }
float distanceBox(vec3 p, vec3 s, float e)
{
    vec3 d = abs(p) - s + e;
    return min(max(d.x, max(d.y, d.z)), 0.) + length(max(d, 0.)) - e;
}
float distanceCylinder(vec3 p, vec2 s, float e)
{
    vec2 d = abs(vec2(length(p.xz), p.y)) - s + e;
    return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - e;
}
float distanceTorus(vec3 p, vec2 s) { return length(vec2(length(p.xy) - s.x, p.z)) - s.y; }

float distanceSphere(vec3 p, float r) { return length(p) - r; }

// combine operators
vec2 combineUnion(vec2 d1, vec2 d2)     { return d1.x  < d2.x ? d1 : d2; }
float combineSubtractFloat(float d1, float d2)  { return -d1 > d2 ? -d1 : d2; }
float combineUnionSmooth(float d1, float d2, float k)
{
    float p = clamp(.5 + .5 * (d2 - d1) / k, 0., 1.);
    return mix(d2, d1, p) - k * p * (1. - p);
}
float combineSubtractSmooth(float d1, float d2, float k)
{
    float p = clamp(.5 - .5 * (d2 + d1) / k, 0., 1.);
    return mix(d2, -d1, p) + k * p * (1. - p);
}
vec3 getNormal(vec3 p, vec3 direction)
{
    vec3 t = vec3(0);
    for(int j=ZERO;j<4;++j)
    {
        vec3 e = raycastAccuracy*(j==3?vec3(1):vec3(j==0?1:-1,j==1?1:-1,j==2?1:-1));
        t += e*sceneDistance(p+e, true, direction).x;
    }
    return normalize(t);
}

///////////////////////////////////////////////////////////////////////////////
// SCENE CODE STARTS HERE

#define MAT_CLAY  0
#define MAT_WHEEL 1
#define MAT_TABLE 2

float distanceHandle(vec3 p, vec3 o, vec2 s)
{ return combineSubtractFloat(p.x, distanceTorus(p-o, s)); }

float distanceVase(vec3 p, out vec3 vaseWarpPosition, bool isRaycast)
{
    vec3 realOriginalPos = p, originalPos = p;
    float vaseOff =-.2; // extra room at top
    vec3 vasePos = vec3(0,vaseMaxHeight/2.,0);
    p -= vasePos;

    if (isRaycast)
    {
        float boundingSphere = distanceSphere(p, 8.);
        if (boundingSphere > 4.) // make it faster
           return boundingSphere;
    }

    // get radius at this y position (procedural, the app uses a data texture)
    float z = clamp(p.y/(vaseMaxHeight+vaseThickness*2.)+.5, 0., 1.);
    float radius = getVaseRadius(z);

    {
        // lumpy clay
        float vaseWarpPercent = vaseInfo2.x;
        float vaseWarpScale = mix(.5,3.,vaseInfo4.w);
        float s = 1.; // random vases are always fully smoothed
        float seed = vaseInfo.w;
        vec3 np = (originalPos + vec3(0,vaseThickness,0))*mix(1.,1./vaseWarpScale,vaseWarpPercent) + seed;
        float animateNoise = vaseInfo3.w;
        np.y += animateNoise;

        vec3 n = noise3(np);
        float amp = mix(.5,0.,s);
        vec3 vaseWarp= (n-.5)*mix(amp, .5*min(2.,vaseWarpScale),vaseWarpPercent);
        p += vaseWarp;
        originalPos += vaseWarp;
    }

    vaseWarpPosition = p+vasePos;
    vaseWarpPosition.xz = rotate(vaseWarpPosition.xz,-vaseAngle);

    float vaseSym = vaseInfo3.x;
    float vaseSymScale = .4*vaseInfo3.y;
    float symS = (.5-.5*cos(vaseSym*atan(p.x,p.z)));

    symS = mix(symS, 1.,vaseSym/ 35.);// reduce if vase is too symmetrical
    if (vaseSym > 1.5)
        radius *= mix(1.,symS, vaseSymScale);

    vec2 p2 = opRevolution(p,0.0);
    vec2 d = abs(vec2(p2.x,p2.y)) - vec2(radius,1e3);
    float vase = min(max(d.x,d.y),0.0) + length(max(d,0.0));

    // handles
    bool vaseTop = vaseInfo2.y > .5;
    float handleCount = handleInfo2.x;
    float handleAngle = handleInfo2.y;
    float handle;
    if (handleCount > .5)
    {
        vec3 handleOffset = vec3(handleInfo.xy,0);
        vec2 handleSize = handleInfo.zw;
        vec3 handlePos = originalPos;

        if (handleCount < 1.5)
        {
            handlePos.xz = rotate(handlePos.xz, handleAngle);
            handle = distanceHandle(handlePos, handleOffset, handleSize);
        }
        else if (handleCount < 2.5)
        {
            handlePos.xz = rotate(handlePos.xz, handleAngle);
            handlePos.x = abs(handlePos.x);
            handle = distanceHandle(handlePos, handleOffset, handleSize);
        }
        else
        {
            float b = 2.*PI/handleCount;
            handlePos.xz = rotate(handlePos.xz, handleAngle);
            vec3 handlePos2 = handlePos;
            vec3 handlePos3 = handlePos;
            float a = atan(handlePos.x,handlePos.z)-PI/2.;
            float r = b*floor(a/b);
            handlePos.xz = rotate(handlePos.xz, r);
            handle = distanceHandle(handlePos, handleOffset, handleSize);
            handlePos2.xz = rotate(handlePos2.xz, r-b);
            float handle2 = distanceHandle(handlePos2, handleOffset, handleSize);
            handlePos3.xz = rotate(handlePos3.xz, r+b);
            float handle3 = distanceHandle(handlePos3, handleOffset, handleSize);
            handle = combineUnionSmooth(handle, handle2, .1);
            handle = combineUnionSmooth(handle, handle3, .1);
        }

        // flat bottom
        handle = combineSubtractFloat(realOriginalPos.y+.05,handle);

        // remove inner vase
        if (!vaseTop)
            handle = combineSubtractFloat(vase,handle);
    }

    // flat bottom
    vase = combineSubtractFloat(realOriginalPos.y-vaseThickness+.05,vase);

    // thickness of vase
    if (vaseTop)
        vase -= vaseThickness;
    else
        vase = opOnion(vase, vaseThickness);
    if (handleCount > .5)
        vase = combineUnionSmooth(vase, handle, .1);
    vase = combineSubtractSmooth(realOriginalPos.y,vase,.1);

    // top opening of vase
    float topRoundness = .01 + vaseInfo2.z+(vaseThickness-.1); // more round when thicker
    float d2 = vaseTopHeight+vaseOff-originalPos.y;
    vase = combineSubtractSmooth(d2, vase, topRoundness);

    return vase;
}

vec2 sceneDistance(vec3 position, bool isRaycast, vec3 direction)
{
    // vase
    vec3 posVase = position;
    posVase.xz = rotate(posVase.xz,vaseAngle);
    vec3 vaseWarpPosition;
    vec2 distance = vec2(distanceVase(posVase,vaseWarpPosition,isRaycast), MAT_CLAY);

    float sceneTweak = sceneEffects.y;
    float offset = .03;
    float sceneRoundness = .01+sceneEffects.z;
    int sceneTypeID = int(sceneEffects.x);
    switch (sceneTypeID)
    {
        case 1:
        {
            // spinning wheel, top at 0
            float h = .2;
            distance = combineUnion(vec2(distanceCylinder(posVase+vec3(0,h+offset,0), vec2(3,h), 0.05), MAT_WHEEL), distance);
            offset = 2.*(h+offset);
            // fall through
        }

        // table surface below wheel
        case 2:
        {
            // table
            float h = 9.;
            float s = mix(3.5,5.,sceneTweak);
            distance = combineUnion(vec2(distanceBox(position+vec3(0,h+offset,0), vec3(9,h,s), sceneRoundness), MAT_TABLE), distance);
            break;
        }
        case 3:
        {
            // block
            float h = 9.;
            float s = mix(2.,3.,sceneTweak);
            distance = combineUnion(vec2(distanceBox(position+vec3(0,h+offset,0), vec3(s,h,s), sceneRoundness), MAT_TABLE), distance);
            break;
        }
        case 4:
        {
            // pillar
            float h = 9.;
            float s = mix(2.,4.,sceneTweak);
            distance = combineUnion(vec2(distanceCylinder(position+vec3(0,h+offset,0), vec2(s,h), sceneRoundness), MAT_TABLE), distance);
            break;
        }
        case 5:
        {
            // floor
            float distance1 = -(position.y+offset)/direction.y;
            if (direction.y >= 0.)
                distance1 = 1e9;
            distance = combineUnion(vec2(distance1, MAT_TABLE), distance);
            break;
        }
    }
    return distance;
}

vec3 getFogColor(vec3 direction)
{
    float sceneSeed = sceneInfo.w;
    float animateNoise = vaseInfo3.w;
    float noiseScale = mix(2.,6.,sceneInfo.y);
    noiseScale *= noiseScale;
    int backgroundType = int(sceneInfo.x);

    vec3 d = (direction+99.)*noiseScale;
    if (backgroundType == 6 || backgroundType == 7) // pixel
    {
        d = d.yyx*5.;
        d = floor(d);
    }
    vec3 d1 = direction;
    if (backgroundType == 4) // horizontal lines
        d1 = vec3(direction.y,length(direction.xz)*2.-1.,0);
    else if (backgroundType == 5)
    {
        float a = atan(direction.x,direction.z); // vertical lines
        d1 = vec3(0.,sin(a),cos(a));
    }
    vec3 n = fractalNoise3(d+sceneSeed+vec3(0,animateNoise,0),4);
    if (!(backgroundType == 6 || backgroundType == 7))
        n = fractalNoise3(n+(d1+99.)*noiseScale+sceneSeed,4);

    float f, ff = direction.y;
    float fp = mix(.5,1.,sceneInfo.y);
    ff = .5 - ff * fp;

    switch(backgroundType)
    {
        case 0: // fade
            f = ff;
            break;
        case 1: // radial
            f = length(direction.xy+vec2(0,.2*sceneInfo.y-.1));
            f = 1.-pow(1.-f,2.+5.*sceneInfo.z);
            break;
        case 6: // pixel
        case 4:
        case 5:
        case 2: // noise
            f = n.x;
            break;
        case 7: // pixel fade
        case 3: // high clouds
            f = ff - .5*n.x+.25;
            break;
    }

    f = clamp(f,0.,1.);
    vec3 fogColor;

    vec3 color1 = backgroundColor1.xyz;
    vec3 color2 = backgroundColor2.xyz;
    if (backgroundType == 8)
    {
        float bias = pow(2.,sceneInfo.z*2.-1.);
        n = pow(n, vec3(bias));
        fogColor = mix(color1, color2, n); // component
    }
    else
    {
        // blend
        f = clamp(f+sceneInfo.z*.5-.25, 0., 1.);
        fogColor = mix(color1, color2, f);
    }

    fogColor *= clamp(1.+normalize(direction).y,0.,1.); // dark bottom
    return fogColor;
}

vec3 getColor(vec3 startPosition, vec3 direction)
{
    vec2 raycastResult = raycast(startPosition, direction);
    float hitDistance = raycastResult.x;
    int hitMaterialIndex = int(raycastResult.y);
    vec3 fogColor = getFogColor(direction);

    // stop if nothing was hit
    if (hitMaterialIndex < 0)
        return fogColor;

    // material info
    float animateNoise = vaseInfo3.w;
    float sceneSeed = sceneInfo.w;
    vec3 position = startPosition + hitDistance * direction;
    vec3 normal = getNormal(position, direction);
    vec3 diffuse = vec3(1);
    vec3 specular = vec3(.5);
    vec3 emissive = vec3(0);
    float specularPower = 16.;
    float roughness = .2;
    float roughnessScale = 60.;
    float ambientReflect = 0.;

    vec3 texturePosition = position;
    if (hitMaterialIndex <= MAT_WHEEL)
        texturePosition.xz = rotate(texturePosition.xz,vaseAngle);
    vec3 roughTexturePosition = texturePosition + 99.;

    // custom materials
    vec3 seedNoise = noise3(vec3(sceneSeed+1.));
    vec3 color1 = vaseColor1.xyz;
    vec3 color2 = vaseColor2.xyz;

    switch(hitMaterialIndex)
    {
        case MAT_CLAY:
        {
            // specular
            vec3 noiseSpecular = fractalNoise3(texturePosition*2. + 3.*materialSeed, 3);
            specular = vec3(1);
            float shine = materialEffects2.x;
            ambientReflect = shine;
            if (shine < .25)
            {
                shine = getPercent(shine, 0.,.25);
                specular *= mix(.1, .5*noiseSpecular.x, shine);
                specularPower = 5.+noiseSpecular.y*5.;
            }
            else if (shine < .5)
            {
                shine = getPercent(shine, .25,.5);
                specular *= mix(.5*noiseSpecular.x, .5, shine);
                specularPower = mix(5.+noiseSpecular.y*5.,20.,shine);
            }
            else if (shine < .75)
            {
                shine = getPercent(shine, .5,.75);
                specular *= mix(.5, 1., shine);
                specularPower = mix(20.,40.,shine);
            }
            else
            {
                shine = getPercent(shine, .75,1.);
                specularPower = mix(40.,80.,shine);
            }

            float roughPercent = materialEffects2.y;
            float ridgesPercent = clamp(1.-roughPercent*2.,0.,1.);
            roughPercent = clamp(roughPercent*2.-1.,0.,1.);

            // roughness
            vec3 nl = fractalNoise3((texturePosition+19.)*vec3(1,50,1),3); // ridges
            normal = normalize(normal+1.*(nl-.5)*ridgesPercent);
            specular = mix(specular,specular*(.5*(nl.x+nl.y+nl.z)),ridgesPercent);
            roughness = roughPercent;
            roughnessScale = 40.;

            // material
            float materialNoiseAmp = materialEffects.y;
            float materialNoiseFreq = materialEffects2.w;

            // put in good range
            int matID = int(materialEffects.x);
            if (matID == 1 || matID == 2)
                materialNoiseAmp *= 2.;
            materialNoiseFreq = mix(.1,10.,materialNoiseFreq);
            if (matID == 8) // grid
                materialNoiseFreq /= 2.;
            if (matID == 9) // dots
                materialNoiseFreq /= 4.;

            bool animNoiseEarlyType = matID < 3 || matID == 8 || matID == 10 || matID == 14;
            if (animNoiseEarlyType)
                texturePosition.y += .2*animateNoise;

            // apply noise
            vec3 textureNoise = materialNoiseAmp*fractalNoise3(texturePosition*materialNoiseFreq + 2.*materialSeed, 4);
            texturePosition += materialNoiseAmp-2.*textureNoise;
            texturePosition.y += vaseThickness; // fixup offset when thickness changes

            if (!animNoiseEarlyType)
                texturePosition.y += .2*animateNoise;

            // put noise position in correct space for effect
            float materialEffectScalePercent = materialEffects.w;
            float materialEffectScale = mix(.2,10.,materialEffectScalePercent);
            vec3 effectPosition = texturePosition*materialEffectScale + materialSeed;

            switch (matID)
            {
                case 3:// horizontal lines
                    effectPosition = vec3(texturePosition.y*materialEffectScale*2.,length(texturePosition.xz),9) + materialSeed;
                    break;

                case 4:// vertical lines
                {
                    float a = atan(texturePosition.x,texturePosition.z);
                    effectPosition = vec3(sin(a),.1*animateNoise,1.+cos(a))*2.*materialEffectScale + materialSeed;
                    break;
                }

                case 7: // pixelate
                    effectPosition = floor(effectPosition);
                    break;
            }

            vec3 noise = fractalNoise3(effectPosition, 4);
            float materialBias = vaseInfo3.z;
            vec3 colorFade = vec3(0);
            vec3 randomParamNoise = noise3(vec3(materialSeed));
            bool hslBlend = vaseInfo4.y > .5;

            switch (matID)
            {
                case 0: // marble
                    colorFade = vec3(noise.x);
                    break;

                case 1: // vertical
                    colorFade = vec3(1.-position.y/vaseTopHeight);
                    colorFade += materialNoiseAmp*(noise-.5);
                    colorFade += materialEffectScalePercent - .5;
                    break;

                case 2: // radial fade
                    colorFade = vec3(length(position.xz)/vaseInfo4.x);
                    colorFade += materialNoiseAmp*(noise-.5);
                    colorFade += materialEffectScalePercent - .5;
                    break;

                case 3: // horizontal lines
                case 4: // vertical lines
                    colorFade = vec3(noise.x);
                    break;

                case 5: // inside out
                    colorFade = .2+vec3(dot(normal,normalize(vec3(position.x,0,position.z))));
                    colorFade += materialNoiseAmp*(noise-.5);
                    colorFade += materialEffectScalePercent - .5;
                    break;

                case 6: // normal
                    colorFade = abs(normal.yyy);
                    colorFade += materialNoiseAmp*(noise-.5);
                    colorFade += materialEffectScalePercent - .5;
                    break;

                case 7: // pixelate
                    colorFade = vec3(noise.x);
                    break;

                case 8: // grid
                    effectPosition *= 4.;
                    colorFade = vec3(max(sin(effectPosition.x),sin(effectPosition.z)));
                    if (randomParamNoise.x < .5)
                        colorFade = vec3(max(colorFade,sin(effectPosition.y)));
                    break;

                case 9: // dots
                    colorFade = vec3(length(.5-mod(effectPosition,1.))*2.);
                    break;

                case 10: // fresnel;
                    colorFade = vec3(pow(clamp(dot(direction, normal)*.5+.5+materialEffectScalePercent,0.,1.), 1.));
                    colorFade += materialNoiseAmp*vec3(noise.x-.5);
                    break;

                case 11: // iridescent
                    specular = (rotateXYZ(reflect(direction, normal),(noise-.5)*2.*PI)*.5+.5);
                    specular = clamp(specular, 0., 1.);
                    specularPower *= .2;
                    colorFade = vec3(noise.x+noise.y+noise.z)/3.;
                    break;

                case 12: // spiral
                {
                    float a = atan(texturePosition.x,texturePosition.z);
                    float b = sin(effectPosition.y*2.+materialSeed - a*sign(randomParamNoise.x-.5));
                    colorFade = vec3(b*.5 + .5);
                    break;
                }

                case 13: // component
                    colorFade = vec3(mix(textureNoise, noise, materialEffectScalePercent));
                    break;

                case 14: // sine
                    colorFade = materialNoiseAmp*vec3(sin((4.+26.*materialEffectScalePercent)*textureNoise.x*PI)*.5+.5);
                    break;

                case 15: // emissive
                    colorFade = vec3(noise.x);
                    break;
            }

            float materialContrast = materialEffects2.z;
            if (matID != 15)
            {
                materialBias = pow(2.,materialBias*2.);
                colorFade = pow(colorFade, vec3(materialBias));
            }
            colorFade = (colorFade - .5)/(1.1-materialContrast)+.5;
            colorFade = clamp(colorFade,0.,1.);

            if (matID == 15)
            {
                materialBias = pow(2.,(1.+materialBias)*3.);
                emissive = mix(vec3(0), color2, pow(colorFade,vec3(materialBias)));
            }

            if (hslBlend && matID != 13)
            {
                color1 = rgb2hsl(color1);
                color2 = rgb2hsl(color2);

                if (color1.y == 0.) // use main hue
                    color1.x = color2.x;
                else if (color2.y == 0.)
                    color2.x = color1.x;
                else
                    color1.x += vaseColor1.w;

                if (color1.z == 0. || color1.z == 1.)
                    color1.y = color2.y;
                else if (color2.z == 0. || color2.z == 1.)
                    color2.y = color1.y;

                diffuse = mix(color1, color2, colorFade.x);
                diffuse = hsl2rgb(diffuse);
            }
            else
                diffuse = mix(color1, color2, colorFade);

            {
                // materialValueNoise / glazeburn
                diffuse += vaseInfo4.z*2.*(noise.y-.5);
                diffuse = clamp(diffuse, 0., 1.);
            }

            break;
        }
        case MAT_WHEEL:
        {
            texturePosition.xz = vec2(length(texturePosition.xz)); // rings
            texturePosition += sceneSeed;

            // ridges
            vec3 nn = fractalNoise3(texturePosition*9.+2.*sceneSeed+animateNoise, 2);
            diffuse = nn.yyy*.4+.05;
            normal = normalize(normal + nn*.5);

            vec3 n = fractalNoise3(roughTexturePosition*5.+3.*sceneSeed+animateNoise, 3);
            specular = n.xxx;
            diffuse += n.yyy*.2;
            specularPower = 5.+n.z*20.;
            ambientReflect = n.z*.1;
            roughness = .1;
            break;
        }
        case MAT_TABLE:
        {
            // random effects
            roughness = .5*mod(seedNoise.x, .5);
            specular = vec3(.5*seedNoise.z);
            specularPower = mix(16.,32.,seedNoise.y);
            ambientReflect = seedNoise.z * .2;
            diffuse = sceneColor.xyz;
            break;
        }
    }

    {
        // roughness
        vec3 roughNoise = vec3(0);
        float f = 1., o=0.;
        for(int i = ZERO; i < 3; ++i)
        {
            roughNoise += fractalNoise3(o + f*roughTexturePosition * roughnessScale, 3);
            f -= .137;
            o += 99.;
        }
        roughNoise /= 3.;
        normal += (roughNoise*2.-1.) * roughness;
        normal = normalize(normal);
    }

    // lighting
    vec3 color = emissive;
    vec3 lightReflect = reflect(direction, normal);
    vec3 lightReflectColor = getFogColor(lightReflect);
    for(int i = ZERO; i < 4; ++i)
    {
        vec3 lightColor = vec3(0);
        vec3 lightDirection = vec3(0);
        float lightSoftness = .5;
        bool isAmbient = false;
        bool isOcclude = false;
        if (i==0)
        {
            lightColor = lightColor1.xyz;
            lightDirection = lightDirection1.xyz;
            lightSoftness = lightDirection1.w;
        }
        else if (i==1)
        {
            lightColor = lightColor2.xyz;
            lightDirection = lightDirection2.xyz;
            lightSoftness = lightDirection2.w;
        }
        else if (i==2) // ambient reflect
        {
            const float ambientReflectScale = .15;
            lightDirection = lightReflect;
            lightColor = ambientReflectScale*lightReflectColor;
            isAmbient = true;
        }
        else if (i==3) // ambient occlusion
        {
            lightColor = lightAmbient.xyz;
            lightDirection = normal;
            isOcclude = true;
        }
        color += getLight(lightDirection, lightColor, lightSoftness, position, direction, normal, diffuse, specular, specularPower, ambientReflect, isAmbient, isOcclude);
    }

    // blend fog
    const float fogStart = maxRange/2.;
    float fogPercent = getPercent(hitDistance, fogStart, maxRange);

    return mix(color, fogColor, fogPercent);
}

// Cheap vec3 hash (Dave Hoskins, "hash33"). No sin() — avoids the banding
// that fract(sin(...)) gets at low input values, and stays fast to compile.
vec3 hash(vec3 p)
{
    p = fract(p * vec3(.1031, .1030, .0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

///////////////////////////////////////////////////////////////////////////////
// per-shot parameter generation
// (ports the app's Randomize button: computeRandom + glRender uniform setup)

// js-style rotations used by the app for cameras and lights
vec3 rotAroundX(vec3 v, float a) { float c=cos(a), s=sin(a); return vec3(v.x, v.y*c-v.z*s, v.y*s+v.z*c); }
vec3 rotAroundY(vec3 v, float a) { float c=cos(a), s=sin(a); return vec3(v.x*c-v.z*s, v.y, v.x*s+v.z*c); }

void initScene(float shot)
{
    g_rand = 1e3*hash11(shot*.7654 + .1237);

    // vase shape (port of Vase.setRandomShape)
    float vaseTopH = rnd(vaseMinHeight, vaseMaxHeight);
    if (rndBool(.5))
        vaseTopH = vaseMaxHeight;
    float vaseThick = .1;
    vr0 = rnd();
    vf1 = rnd(1.,30.);  vo1 = rnd(0.,2.*PI);  vr1 = rnd(vaseMinRadius,vaseMaxRadius)/vf1/9.;
    vf2 = rnd(8.,40.);  vo2 = rnd(0.,2.*PI);  vr2 = rnd(vaseMinRadius,vaseMaxRadius)/2.;
    vsc1 = rnd(.1,3.);  vsc2 = rnd(.1,3.);
    vslope1 = rnd(.1,1.);  vslope2 = rnd(1.,1.5);
    if (rndBool(.3))
    {
        float t = vslope1;
        vslope1 = vslope2;
        vslope2 = t;
    }

    // widest point of the vase (used for framing and radial fade)
    float vaseWidth = 0.;
    for (int i = ZERO; i < 32; ++i)
        vaseWidth = max(vaseWidth, getVaseRadius((float(i)+.5)/32.*vaseTopH/vaseMaxHeight));

    // spin the vase like the app does
    float vaseAngleNow = rnd(0.,2.*PI) + rndSign()*rnd(.3,.8)*iTime;
    vaseInfo  = vec4(vaseThick, vaseTopH, vaseAngleNow, rnd(0.,99.));
    vaseInfo2 = vec4(rnd(), rndBool(.5)?1.:0., mix(.01,.3,rnd()), 0); // warp, solid interior, lip shape
    vaseInfo3 = vec4(floor(rnd(1.,31.)), rnd(), rnd(-1.,1.), rndBool(.25) ? .6*iTime : 0.); // symmetry count/scale, glaze bias, animate noise
    vaseInfo4 = vec4(vaseWidth, rndBool(.5)?1.:0., rnd(), rnd()); // width, hsl blend, glaze burn, warp scale

    // colors (the app picks full random rgb, then applies display gamma)
    vec3 vaseCol1 = pow(rndColor(), vec3(gamma)), vaseCol2 = pow(rndColor(), vec3(gamma));
    vec3 bgCol1 = pow(rndColor(), vec3(gamma)), bgCol2 = pow(rndColor(), vec3(gamma));
    vec3 sceneCol = pow(rndColor(), vec3(gamma));

    // hue wrap fixup for hsl blending
    float hueDelta = rgb2hsl(vaseCol1).x - rgb2hsl(vaseCol2).x;
    vaseColor1 = vec4(vaseCol1, hueDelta > .5 ? -1. : hueDelta < -.5 ? 1. : 0.);
    vaseColor2 = vec4(vaseCol2, 0);
    backgroundColor1 = vec4(bgCol1, 0);
    backgroundColor2 = vec4(bgCol2, 0);
    sceneColor = vec4(sceneCol, 0);

    // scene + background
    float sceneSeed = floor(rnd(0.,1000.)); // only shifts the light saturation range
    sceneInfo = vec4(floor(rnd()*9.), rnd(), rnd(), rnd(0.,99.)); // background type, scale, blend, fog seed
    float sceneTypeID = 1. + floor(rnd()*5.); // wheel, long/square/round table, floor
    sceneEffects = vec4(sceneTypeID, rnd(), rnd(.05,.3), 0);

    // glaze material
    materialEffects  = vec4(floor(rnd()*16.), rnd(), rnd(100.,200.), rnd()); // style, noise amp, seed, effect scale
    materialEffects2 = vec4(rnd(), rnd(), rnd(), rnd()); // shine, surface, contrast, noise frequency

    // handles - keep size and placement in a sensible range most of the
    // time, with a small chance of full-range randomness like the app
    float handleCount = floor(rnd()*11.);
    bool wildHandles = rndBool(.1);
    float handleR1 = mix(0.,2., wildHandles ? rnd() : rnd(.2,.7));   // size
    float handleR2 = mix(.05,1., wildHandles ? rnd() : rnd(.1,.5));  // thickness
    float handleSize = handleR1 + handleR2;
    float handlePosY = mix(-handleR2, vaseTopH+handleR2, wildHandles ? rnd() : rnd(.3,.8)); // height
    float handleOffset = getVaseRadius(clamp(handlePosY, 0., vaseTopH)/vaseMaxHeight);
    float handleMin = max(0., handleOffset - handleSize/2.);
    float handleMax = handleOffset + handleSize;
    float handleEnd = min(handleMax + handleSize, 4.5);
    handleMax = max(handleMin, handleEnd - handleSize);
    handleOffset = mix(handleMin, handleMax, rnd());
    handleInfo  = vec4(handleOffset, handlePosY, handleR1, handleR2);
    handleInfo2 = vec4(handleCount, rnd(0.,2.*PI), 0, 0);

    // lights
    float seedP = sceneSeed/1000.;
    float minSat = mix(0.,.4,seedP), maxSat = mix(.2,.8,seedP);
    lightAmbient = vec4(mix(bgCol1, bgCol2, rnd())*rnd(.2,.5) + .04, 0);

    float lightAngle = rndSign()*rnd(0.,1.1);
    vec3 lightDir = rotAroundY(rotAroundX(vec3(0,0,-1), rnd(.4,1.1)), lightAngle);
    lightDirection1 = vec4(normalize(lightDir), rnd(.02,.2));
    lightColor1 = vec4(hsl2rgb(vec3(rnd(), rnd(minSat,maxSat), rnd(.5,.9))), 0);

    lightAngle += rndSign()*rnd(.7,PI);
    lightDir = rotAroundY(rotAroundX(vec3(0,0,-1), rnd(.5,1.)), lightAngle);
    lightDirection2 = vec4(normalize(lightDir), rnd(.02,.2));
    lightColor2 = vec4(hsl2rgb(vec3(rnd(), rnd(minSat,maxSat), rnd(.3,.7))), 0);

    // camera
    float pitch = rnd(-.1,.6);
    cameraRotation = vec4(pitch, 0, 0, 0);
    vec3 camPos = vec3(0, 3.25, 0);
    camPos += rotAroundX(vec3(0,0,-25), pitch);
    if (sceneTypeID > 4.) // keep above the floor scene
        camPos.y = max(.5, camPos.y);
    cameraPosition = vec4(camPos, 5.); // w = zoom
}

void mainImage(out vec4 fragColor, vec2 fragCoord)
{
    // each shot is a new random vase; drag horizontally to flip through more
    float shot = floor(iTime/SHOT_TIME);
    shot += floor(MOUSE_VASES*iMouse.x/iResolution.x);
    initScene(shot);

    renderScene(fragColor, fragCoord);

    // fade between shots
    float t = mod(iTime, SHOT_TIME);
    float fade = smoothstep(0., FADE_TIME, t) * (1.-smoothstep(SHOT_TIME-FADE_TIME, SHOT_TIME, t));
    fragColor.rgb *= fade;
    fragColor.a = 1.;
}
`;
