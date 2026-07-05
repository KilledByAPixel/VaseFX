'use strict';




































const shaderCode = 
`
#define vaseThickness (vaseInfo.x)
#define vaseTopHeight (vaseInfo.y)
#define vaseAngle (vaseInfo.z)
#define materialSeed (materialEffects.z)
#define quickTest false

// VaseFX Raymarching Engine
// Copyright Frank Force 2023
// www.frankforce.com

// global settings
const int maxRaycastIterations = 300;
const int maxAmbientShadowIterations = 150;
const int maxShadowIterations = 150;
const float raycastMinRange = 0.1;
const float raycastAccuracy = 0.01;
const float PI = 3.141592653589793;
const float raycastScale = .3;
const float maxRange = testMountains? 5000. : 100.;
const float gamma = 2.2;

// forward declarations for generated codef
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
void mainImage(out vec4 fragColor, vec2 fragCoord)
{
    float borderSize = borderInfo.x;
    float borderNoise = borderInfo.y;
    float borderNoiseScale = borderInfo.z;
    float borderSeed = borderInfo.w;

    // get uv
    vec2 uv = fragCoord;

    // fit to border
    uv -= iResolution.xy * .5;
    uv *= iResolution.y / (iResolution.y-2.*borderSize);
    uv += iResolution.xy * .5;
    uv = (2.*uv - iResolution.xy) / iResolution.y;

    // cast ray
    mat3 cameraTransform = getRotationMatrix(cameraRotation.xyz);
    float cameraZoom = cameraPosition.w;
    vec3 direction = cameraTransform * normalize(vec3(uv, cameraZoom));
    vec3 cameraPos = cameraPosition.xyz;
    vec3 color = getColor(cameraPos, direction);

    // tone mapping
    //if (uv.x < 0.)
        color = toneMapAces(color);
    //color -= vec3(1.);

    // gamma
    color = pow(color, vec3(1./gamma));

    // post effects
    int postEffectID = int(sceneEffects.w);
    
    // grayscale
    if (postEffectID == 7)
        color = vec3(dot(color, vec3(0.299, 0.587, 0.114)));

    // effects
    if (postEffectID == 3) // invert
        color = 1. - color;

    if (postEffectID == 6) // vignette
    {
        // Simple vignette effect by Ippokratis
        // https://www.shadertoy.com/view/lsKSWR
        vec2 uv2 = fragCoord/iResolution.xy;
        uv2 *= 1. - uv2;
        float v = pow(uv2.x*uv2.y*40.,.2);
        color *= clamp(v,0.,1.);
    }

    // border
    vec2 borderPos = fragCoord;
    float animateNoise = vaseInfo3.w;
    vec3 p = vec3(fragCoord*borderNoiseScale/iResolution.y*1e3,borderSeed+.5*animateNoise);
    vec3 n = fractalNoise3(p,2);
    n = fractalNoise3(p+n,3);
    borderPos += borderNoise*borderSize*(n.xy-.5)*2.;
    
    float borderDistance = max(
        abs(borderPos.x - iResolution.x/2.)-(iResolution.x/2.-borderSize),
        abs(borderPos.y - iResolution.y/2.)-(iResolution.y/2.-borderSize));

    float borderPercent = borderDistance / borderSize;
    float borderMix = borderPercent;
    borderPercent = 1.-pow(1.-borderPercent, 3.);
    float bp = clamp(-borderPercent, 0., 1.);
    borderPercent = clamp(borderPercent, 0., 1.);
    vec3 borderColorFinal = borderColor.xyz;
    float borderSoftness = 20.;
    if (postEffectID == 4) // invert border
        borderColorFinal = 1. - color;
    color = mix(color, borderColorFinal, clamp(borderMix*borderSoftness, 0., 1.));

    // grain
    float filmGrain = sceneEffects2.x;
    float sceneSeed = sceneInfo.w;
    //vec2 grainPos = 2048. * fragCoord / iResolution.y;
    vec2 grainPos = fragCoord;
    vec3 grainNoise = (fractalNoise3(vec3(grainPos,sceneSeed+iTime*10.), 3));
    grainNoise = hsl2rgb(grainNoise*vec3(9.,postEffectID==5 ?1.:.5,1.));
    color += filmGrain*(grainNoise-.5);
    fragColor = vec4(color, 1);
    //fragColor = texture(iChannel0, uv);// test data
}

// fast build noise, prevent inlining calls to hash
vec3 noise3(vec3 p)
{
    vec3 i = floor(p) + 99.;
    vec3 f = fract(p);
    f = f*f*(3.-2.*f);

    vec3 hashResult[8];
    for(int j=0; j<8; ++j)
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
    for (int i = octaves; --i >= 0;)
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
    for (int i = maxRaycastIterations; --i > 0;)
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
    int iterations = occlusion ? 10 : ambient ? maxAmbientShadowIterations : maxShadowIterations;

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
float distancePlane(vec3 p, vec3 n) { return dot(p, n); }
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
float distanceCylinderSide(vec3 p, vec2 s, float e)
{
    vec2 d = abs(vec2(length(p.xy), p.z)) - s + e;
    return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - e;
}
float distanceCylinderSide2(vec3 p, vec2 s, float e)
{
    vec2 d = abs(vec2(length(p.zy), p.x)) - s + e;
    return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - e;
}
float distanceTorus(vec3 p, vec2 s) { return length(vec2(length(p.xy) - s.x, p.z)) - s.y; }

float distanceSphere(vec3 p, float r) { return length(p) - r; }

// combine operators
vec2 combineUnion(vec2 d1, vec2 d2)     { return d1.x  < d2.x ? d1 : d2; }
vec2 combineSubtract(vec2 d1, vec2 d2)  { return -d1.x > d2.x ? vec2(-d1.x,d1.y) : d2; }
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
    for(int j=0;j<4;++j)
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
#define MAT_WALL  3
#define MAT_TOOL  4

float distanceHandle(vec3 p, vec3 o, vec2 s) 
{ return combineSubtractFloat(p.x, distanceTorus(p-o, s)); }

float distanceVase(vec3 p, out vec3 vaseWarpPosition, bool isRaycast)
{
    vec3 realOriginalPos = p, originalPos = p;
    float vaseOff =-.2;//vaseThickness*2.;// extra room at top
    vec3 vasePos = vec3(0,vaseMaxHeight/2.,0);
    p -= vasePos;

    if (isRaycast)
    {
        float boundingSphere = distanceSphere(p, 8.);
        if (boundingSphere > 4.) // make it faster
           return boundingSphere;
    }

    // get radius at this y position
    float z = clamp(p.y/(vaseMaxHeight+vaseThickness*2.)+.5, 0., 1.);
    vec4 radiusData = texture(iChannel0, vec2(.5,z));
    float radius = vaseMaxRadius * (radiusData.y *255. + radiusData.z)/255.;

    {
        // lumpy clay
        float vaseWarpPercent = vaseInfo2.x;
        float vaseWarpScale = mix(.5,3.,vaseInfo4.w);
        float s = radiusData.x;
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
        //vec3 handleOffset = vec3(1,2,0);
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
    //return min(boundingSphere, vase);
}

vec2 sceneDistance(vec3 position, bool isRaycast, vec3 direction)
{
    float animateNoise = vaseInfo3.w;

    if (testMountains)
    {
        // mountains
        float seed = vaseInfo.w;
        vec3 p = position;
        vec3 np = position+1e3;
        float d = length(p.xz);
        d = clamp(d/1e3,0.,1.);
        d = smoothstep(0.,1., d);
        //d = -cos(length(p.xz)/500.)*.5+.5;

        np *= .005;
        np+=.005*(fractalNoise3(np*100.+99.+seed,3)-.5);
        np+=.05*(fractalNoise3(np*10.+199.+seed,3)-.5);
        vec3 n = fractalNoise3(np+seed+vec3(0,.1*animateNoise,0),4);

        //position = rotateXYZ(position,vec3(1.1,3.33,7.11));
        //n = n*.5+.5*fractalNoise3(.005*position+seed+vec3(0,.1*animateNoise,0),8);
        p -= 190.*d*(n+.5);
        p += 100.;
        return vec2(distancePlane(p, vec3(0,1,0)), MAT_CLAY);
    }

    // test sphere
    //return vec2(distanceSphere(position-vec3(0,vaseMaxHeight*.5,0), vaseMaxHeight*.5), MAT_TABLE);
    //return vec2(distanceCylinder(position-vec3(0,vaseMaxHeight*.5,0), vec2(vaseMaxRadius,vaseMaxHeight*.5), .01), MAT_TABLE);

    // vase
    vec3 posVase = position;
    posVase.xz = rotate(posVase.xz,vaseAngle);
    vec3 vaseWarpPosition;
    vec2 distance = vec2(distanceVase(posVase,vaseWarpPosition,isRaycast), MAT_CLAY);

    // test cylinder
    //distance = combineUnion(vec2(distanceCylinder(position-vec3(0,vaseMaxHeight*.5,0), vec2(vaseMaxRadius,vaseMaxHeight*.5), .01), MAT_TABLE), distance);

    /*float toolSize = toolPos.w;
    if (toolSize > 0.)
    {
        float h = .5;
        vec3 tool = vec3(abs(vaseWarpPosition.x),vaseWarpPosition.yz)-toolPos.xyz-vec3(toolSize,0,0);
        float toolDistance;
        toolDistance =     distanceCylinderSide2(tool-vec3(h,0,0), vec2(toolSize,h), .1);
        toolDistance = min(toolDistance, distanceSphere(tool, toolSize));
         //toolDistance = distanceSphere(tool, toolSize);
        toolDistance = combineSubtractSmooth(distance.x, toolDistance, .1);
        distance = combineUnion(vec2(toolDistance, MAT_TOOL), distance);
    }*/

    float sceneTweak = sceneEffects.y;
    float vaseWidth = vaseInfo4.x;
    float offset = .03;
    float sceneRoundness = .01+sceneEffects.z;
    int sceneTypeID = int(sceneEffects.x);
    float sceneSeed = sceneInfo.w;
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
        case 6:
        case 7:
        {
            // floor
            float distance1 = -(position.y+offset)/direction.y;
            if (direction.y >= 0.)
                distance1 = 1e9;
            distance = combineUnion(vec2(distance1, MAT_TABLE), distance);
            break;
        }
        case 10: // window
        {
            bool isSquare = sceneSeed < 40.;
            float m = 3.5;
            float w = max(2.,vaseWidth+.2+1.5*sceneTweak);
            w = min(w, m);
            float h = isSquare ? m : m-w*.5;
            vec3 windowSize = vec3(w,h,1.);
            float wall = distanceBox(position, vec3(1e3,1e3,windowSize.z),0.);
            vec3 p2 = position-vec3(0,windowSize.y,0);
            float window = distanceBox(p2, vec3(windowSize.x,windowSize.y,1e3),0.);

            float window2 = distanceCylinderSide(p2-vec3(0,windowSize.y,0), vec2(windowSize.x,1e3), 0.);
            window = (isSquare ? window : min(window,window2)) - .05;

            wall = combineSubtractSmooth(window, wall, .1);
            distance = combineUnion(vec2(wall, MAT_TABLE), distance);
            break;
        }
        case 11: // wall
        {
            float o = mix(vaseWidth+1.,7.,sceneTweak);
            float floor = position.y+offset;
            float wall = -position.z+o;
            float both = combineUnionSmooth(floor, wall,.1);
            distance = combineUnion(vec2(both, floor < wall ? MAT_TABLE : MAT_WALL), distance);
            break;
        }
        /*case 13: // tile
        {
            float sceneScale = mix(.03,.2,sceneTweak);
            vec3 p = (position * sceneScale)*2.*PI;
            float slope = .002, gap = .05;
            p = mod(p+gap/2.+.5, 1.);
            p = clamp(p/gap,0.,1.) * PI*2.+PI;
            float o = slope*(max(cos(p.x),cos(p.z))*.5+.5)/sceneScale;
            distance = combineUnion(vec2(position.y+offset+o, MAT_TABLE), distance);
            break;
        }*/
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
    float sceneTweak = sceneEffects.y;
    float ambientReflect = 0.;

    if (quickTest)
        //return vec3(hitDistance/100.);
        return vec3(clamp(dot(normal, normalize(vec3(1,1,-1))),0.,1.));

    vec3 texturePosition = position;
    if (testMountains)
        texturePosition *= .1;
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
                //if(position.x<0.){vec3 c=color1;color1=color2;color2=c;}

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
                
            //if (vaseInfo4.z > .5) // materialValueNoise / glazeburn
            {
                diffuse += vaseInfo4.z*2.*(noise.y-.5);
                diffuse = clamp(diffuse, 0., 1.);
            }

            break;
        }
        case MAT_WHEEL:
        {
            //texturePosition.xz=vec2(length(texturePosition.xz));//lines
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

            int sceneTypeID = int(sceneEffects.x);
            diffuse = sceneColor.xyz;
            if (sceneTypeID==6) // checkerboard
            {
                float sceneScale = mix(3.,6.,sceneTweak);
                ivec3 ip = ivec3(mod(floor(texturePosition/sceneScale-.5), 2.));
                bool isDark = (ip.x^ip.z) > 0;
                if (seedNoise.x < .5)
                    isDark = !isDark;
                diffuse = isDark ? vec3(.01) : diffuse;
            }
            else if (sceneTypeID==7) // grid
            {
                float sceneScale = mix(.2,2.,sceneTweak);
                vec3 p = (texturePosition * sceneScale+.5)*2.*PI;
                diffuse *= 1.-.95*pow(max(cos(p.x),cos(p.z))*.5+.5,30.);
            }
            else if (sceneTypeID==9) // dunes
            {
                ambientReflect *= .1;
                roughness *= 3.;
                roughnessScale = 30.;
                specular *= .5;
            }
            break;
        }
        case MAT_WALL:
        {
            roughness = .5*mod(seedNoise.x, .5);
            specular = vec3(.5*seedNoise.z);
            specularPower = mix(16.,32.,seedNoise.y);
            ambientReflect = seedNoise.z * .2;

            float z = texturePosition.y/mix(5.,30.,sceneTweak);
            //float stripeWidth = mix(.5,2.,sceneTweak);
            //if (seedNoise.x < .5)
            //    z = mod(floor(sceneSeed+texturePosition.x/stripeWidth),2.) < 1. ? 1. : 0.;
            diffuse = mix(backgroundColor2.xyz,backgroundColor1.xyz,clamp(z,0.,1.));
            break;
        }
        case MAT_TOOL:
        {
            roughness = 0.;
            specular = vec3(0);
            diffuse = vec3(1,0,0);
            break;
        }
    }

    //diffuse = vec3(0.);roughness = 0.;ambientReflect = 1.; // test reflect

    {
        // roughness
        vec3 roughNoise = vec3(0);
        float f = 1., o=0.;
        for(int i = 0; i < 3; ++i)
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
    for(int i = 0; i < 4; ++i)
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
`;