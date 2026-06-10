#version 300 es

precision highp float;

layout(std140, column_major) uniform;

#include "./includes/scene-uniforms.glsl";

uniform highp sampler2DArray u_textures;
uniform highp isampler2D u_textureMaterials;
uniform highp sampler2DArray u_waterTextures;
uniform highp sampler2DArray u_waterMask;
uniform vec2 u_mapPos;
uniform highp int u_sceneBorderSize;
uniform float u_worldEntityOpacity;

#include "./includes/material.glsl";

in vec4 v_color;
in vec2 v_texCoord;
in vec2 v_worldUv;
in vec3 v_worldPos;
flat in uint v_texId;
flat in float v_alphaCutOff;
in float v_fogAmount;
flat in float v_plane;

layout(location = 0) out vec4 fragColor;

const float WATER_NORMAL_1 = 0.0;
const float WATER_NORMAL_2 = 1.0;
const float WATER_FLOW = 2.0;
const float WATER_FOAM = 3.0;
const float WATER_CAUSTICS = 4.0;
const float WATER_UNDERWATER_FLOW = 5.0;

vec3 readWaterMaskTexel(ivec2 texel, int layer, ivec3 maskSize) {
    ivec2 clampedTexel = clamp(texel, ivec2(0), maskSize.xy - ivec2(1));
    return texelFetch(u_waterMask, ivec3(clampedTexel, layer), 0).rgb;
}

vec3 sampleWaterMask(vec2 worldUv, float plane) {
    ivec3 maskSize = textureSize(u_waterMask, 0);
    int layer = clamp(int(floor(plane + 0.5)), 0, maskSize.z - 1);

    vec2 maskPos = worldUv - u_mapPos * 64.0 + vec2(float(u_sceneBorderSize));
    ivec2 texel = ivec2(floor(maskPos));
    vec2 tileFract = fract(maskPos);

    vec3 centerMask = readWaterMaskTexel(texel, layer, maskSize);
    float centerWater = centerMask.r;

    float leftWater = readWaterMaskTexel(texel + ivec2(-1, 0), layer, maskSize).r;
    float rightWater = readWaterMaskTexel(texel + ivec2(1, 0), layer, maskSize).r;
    float downWater = readWaterMaskTexel(texel + ivec2(0, -1), layer, maskSize).r;
    float upWater = readWaterMaskTexel(texel + ivec2(0, 1), layer, maskSize).r;
    float downLeftWater = readWaterMaskTexel(texel + ivec2(-1, -1), layer, maskSize).r;
    float downRightWater = readWaterMaskTexel(texel + ivec2(1, -1), layer, maskSize).r;
    float upLeftWater = readWaterMaskTexel(texel + ivec2(-1, 1), layer, maskSize).r;
    float upRightWater = readWaterMaskTexel(texel + ivec2(1, 1), layer, maskSize).r;

    float shoreFromLand = 0.0;
    shoreFromLand = max(shoreFromLand, (1.0 - leftWater) * (1.0 - tileFract.x));
    shoreFromLand = max(shoreFromLand, (1.0 - rightWater) * tileFract.x);
    shoreFromLand = max(shoreFromLand, (1.0 - downWater) * (1.0 - tileFract.y));
    shoreFromLand = max(shoreFromLand, (1.0 - upWater) * tileFract.y);
    shoreFromLand = max(shoreFromLand, (1.0 - downLeftWater) * (1.0 - tileFract.x) * (1.0 - tileFract.y));
    shoreFromLand = max(shoreFromLand, (1.0 - downRightWater) * tileFract.x * (1.0 - tileFract.y));
    shoreFromLand = max(shoreFromLand, (1.0 - upLeftWater) * (1.0 - tileFract.x) * tileFract.y);
    shoreFromLand = max(shoreFromLand, (1.0 - upRightWater) * tileFract.x * tileFract.y);
    shoreFromLand *= step(0.5, centerWater);

    float adjacentWater = 0.0;
    adjacentWater = max(adjacentWater, leftWater * (1.0 - tileFract.x));
    adjacentWater = max(adjacentWater, rightWater * tileFract.x);
    adjacentWater = max(adjacentWater, downWater * (1.0 - tileFract.y));
    adjacentWater = max(adjacentWater, upWater * tileFract.y);
    adjacentWater *= 1.0 - step(0.5, centerWater);

    float shore = max(shoreFromLand, centerMask.g * 0.18);
    shore = pow(smoothstep(0.04, 0.94, shore), 1.55);
    return vec3(centerWater, shore, max(centerMask.b * 0.22, adjacentWater));
}

vec3 sampleWaterNormal(vec2 uv, float layer, float strength) {
    vec3 packed = texture(u_waterTextures, vec3(uv, layer)).rgb * 2.0 - 1.0;
    return normalize(vec3(packed.xy * strength, max(packed.z, 0.18)));
}

vec3 adjustSaturation(vec3 color, float saturation) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, saturation);
}

float waterCausticBands(vec2 worldUv, vec2 flow, float time) {
    vec2 causticsUv = worldUv / 5.25;
    vec2 underwaterFlow = texture(u_waterTextures, vec3(causticsUv / 3.5 + vec2(time * 0.006), WATER_UNDERWATER_FLOW)).rg * 2.0 - 1.0;
    vec2 flow1 = causticsUv * 0.75 + underwaterFlow * 0.018 + flow * 0.005 + vec2(time * 0.017, -time * 0.034);
    vec2 flow2 = causticsUv * 1.125 - underwaterFlow * 0.014 - flow * 0.004 + vec2(-time * 0.023, time * 0.046);
    vec3 caustics = min(
        texture(u_waterTextures, vec3(flow1, WATER_CAUSTICS)).rgb,
        texture(u_waterTextures, vec3(flow2, WATER_CAUSTICS)).rgb
    );
    float causticMap = dot(caustics, vec3(0.299, 0.587, 0.114));

    vec2 p = worldUv + flow * 1.8;
    float bandA = sin(dot(p, vec2(0.92, 0.36)) * 3.6 + time * 1.45);
    float bandB = sin(dot(p, vec2(-0.34, 1.05)) * 4.2 - time * 1.18);
    float bandC = sin(dot(p, vec2(0.58, -0.76)) * 5.1 + time * 0.92);
    float bands = max(max(bandA, bandB), bandC);
    float crossing = bandA * bandB * 0.35 + bandC * 0.28;
    float procedural = smoothstep(0.74, 0.98, bands + crossing);
    return smoothstep(0.42, 0.92, causticMap * 1.18 + procedural * 0.18);
}

vec3 shadeWater(vec2 worldUv, vec3 worldPos, vec3 vertexShade, vec3 textureTint, Material mat, vec3 waterMask, float time) {
    float light = clamp(dot(vertexShade, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float tintPeak = max(max(textureTint.r, textureTint.g), max(textureTint.b, 0.001));
    vec3 normalizedTint = clamp(textureTint / tintPeak, 0.0, 1.15);
    float tintLuma = clamp(dot(textureTint, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float duration = max(mat.waterDuration, 0.01);
    float animTime = time / duration;
    float normalPower = clamp(mat.waterNormalStrength * 6.2, 0.24, 0.95);
    float shoreMask = clamp(waterMask.g * 0.82, 0.0, 1.0);

    vec2 flowUv = worldUv / 15.0 + vec2(animTime * 0.012, -animTime * 0.009);
    vec2 flow = texture(u_waterTextures, vec3(flowUv, WATER_FLOW)).rg * 2.0 - 1.0;
    vec2 distortion = flow * 0.025;

    vec2 normalUv1 = worldUv.yx / 3.0 + distortion - vec2(animTime * 0.036, animTime * 0.021);
    vec2 normalUv2 = worldUv / 3.0 - distortion + vec2(animTime * 0.031, -animTime * 0.027);
    vec3 n1 = sampleWaterNormal(normalUv1, WATER_NORMAL_1, normalPower);
    vec3 n2 = sampleWaterNormal(normalUv2, WATER_NORMAL_2, normalPower * 0.85);
    vec3 normal = normalize(n1 + n2 + vec3(0.0, 0.0, 1.55));
    vec3 worldNormal = normalize(vec3(normal.x, normal.z, normal.y));

    vec3 cameraWorld = inverse(u_viewMatrix)[3].xyz;
    vec3 viewDir = normalize(cameraWorld - worldPos);
    float viewDotNormals = clamp(dot(viewDir, worldNormal), 0.0, 1.0);
    float fresnel = 1.0 - viewDotNormals;
    float finalFresnel = clamp(mix(mat.waterBaseOpacity, 1.0, fresnel * 1.2), 0.0, 1.0);

    vec3 sunDir = normalize(vec3(-0.30, 0.42, 0.86));
    float sun = pow(max(dot(worldNormal, sunDir), 0.0), mat.waterSpecularGloss * 0.12) *
        mat.waterSpecularStrength * 0.35;
    vec3 sunReflect = reflect(-sunDir, worldNormal);
    float glintGloss = mix(18.0, 72.0, clamp(mat.waterSpecularGloss / 500.0, 0.0, 1.0));
    float glint = pow(max(dot(sunReflect, viewDir), 0.0), glintGloss) *
        mat.waterSpecularStrength * 0.55;
    float broadWave =
        sin(dot(worldUv, vec2(0.135, 0.086)) + animTime * 0.42) * 0.5 +
        sin(dot(worldUv, vec2(-0.072, 0.168)) - animTime * 0.31) * 0.5;
    float longWave =
        sin(dot(worldUv, vec2(0.047, -0.061)) + animTime * 0.20) * 0.5 +
        sin(dot(worldUv, vec2(-0.038, -0.044)) - animTime * 0.17) * 0.5;
    float ripple = clamp((normal.x - normal.y) * 0.25 + broadWave * 0.42, -1.0, 1.0);
    float fineRipple = clamp(n1.x * 0.42 - n2.y * 0.38 + n1.y * 0.18 + n2.x * 0.16, -1.0, 1.0);
    float normalDetail = clamp(
        normal.x * 0.78 - normal.y * 0.62 + fineRipple * 0.34 + broadWave * 0.34 + longWave * 0.18,
        -1.0,
        1.0
    );
    float openWater = 1.0 - shoreMask * 0.42;
    float waveCrest = smoothstep(0.38, 0.92, ripple);
    float shallowAmount = clamp(light * 0.72 + tintLuma * 0.55 + broadWave * 0.12, 0.0, 1.0);
    shallowAmount = max(shallowAmount, shoreMask * 0.58);

    vec3 surface117 = mat.waterSurfaceColor;
    vec3 depth117 = mat.waterDepthColor;
    vec3 tropicalSky = mix(u_skyColor.rgb, vec3(0.32, 0.62, 0.78), 0.28);
    vec3 reflectedSky = mix(surface117, tropicalSky, 0.22);
    vec3 fresnelColor = mix(depth117, reflectedSky, finalFresnel);
    vec3 deep = mix(depth117 * 0.55, surface117 * 0.65, 0.28);
    vec3 mid = mix(depth117, surface117, 0.62);
    vec3 shallow = mix(surface117, vec3(0.43, 0.72, 0.76), 0.14);
    vec3 water = mix(deep, mid, smoothstep(0.10, 0.86, shallowAmount));
    water = mix(water, shallow, smoothstep(0.42, 0.94, shallowAmount) * 0.48);
    water = mix(water, fresnelColor, mat.waterFresnelAmount);
    if (mat.waterFresnelAmount > 0.84) {
        water *= 0.75;
    }
    water *= 1.0 + normalDetail * 0.24 * openWater;
    water += fineRipple * vec3(0.026, 0.044, 0.052) * openWater;
    water = mix(water, water + tropicalSky * 0.18, smoothstep(0.18, 0.84, normalDetail) * openWater);
    water = mix(water, mat.waterSurfaceColor * 0.60, smoothstep(0.48, 1.0, -normalDetail) * 0.20);

    float caustic = waterCausticBands(worldUv, flow, animTime) * smoothstep(0.18, 0.96, shallowAmount);
    caustic *= mix(0.30, 1.02, shoreMask);
    vec3 sandBed = vec3(0.70, 0.66, 0.50) * mix(0.84, 1.16, light);
    sandBed = mix(sandBed, vec3(0.78, 0.73, 0.55) * mix(0.92, 1.18, light), shoreMask * 0.38);
    sandBed = mix(sandBed, normalizedTint * vec3(0.72, 0.80, 0.84), 0.06);
    sandBed += caustic * vec3(0.12, 0.15, 0.12);

    float waterOpacity = max(mat.waterBaseOpacity, max(finalFresnel * 0.68, sun));
    waterOpacity = clamp(waterOpacity + shallowAmount * 0.06, mat.waterBaseOpacity, 0.92);
    waterOpacity = clamp(waterOpacity - shoreMask * 0.08, mat.waterBaseOpacity * 0.86, 0.92);
    vec3 color = mix(sandBed, water, waterOpacity);

    vec2 foamUv = worldUv * 0.65 + flow * 0.08 + vec2(-animTime * 0.026, animTime * 0.018);
    float foamMask = texture(u_waterTextures, vec3(foamUv, WATER_FOAM)).r;
    float maxFoamAmount = min(shoreMask, 0.8);
    float foamDistance = 0.7;
    float foamBase = clamp(1.0 - ((1.0 - maxFoamAmount) / foamDistance), 0.0, 1.0);
    float foamAmount = pow(foamBase, 3.0);
    foamAmount *= smoothstep(0.34, 0.86, foamMask + waveCrest * 0.22 + caustic * 0.16);
    foamAmount *= smoothstep(0.02, 0.22, shoreMask);
    vec3 foamColor = mix(vec3(0.70, 0.75, 0.72), mat.waterSurfaceColor, 0.22) * mix(0.78, 1.12, light);
    color = mix(color, foamColor, foamAmount * 0.46);

    color += caustic * vec3(0.08, 0.10, 0.10) * (1.0 - waterOpacity);
    color += sun * vec3(0.20, 0.22, 0.20);
    color += glint * vec3(0.26, 0.31, 0.30);
    color += waveCrest * vec3(0.048, 0.088, 0.096) * openWater;
    color += smoothstep(0.34, 0.82, fineRipple + broadWave * 0.18) * vec3(0.018, 0.034, 0.040) * openWater;
    color *= 1.0 + normalDetail * 0.095 * openWater;
    color = adjustSaturation(color, mix(1.10, 1.22, openWater));
    color *= mix(vec3(0.98, 1.00, 1.02), normalizedTint, 0.02);

    vec3 originalSurface = adjustSaturation(textureTint * vertexShade, 1.12);
    originalSurface *= 1.0 + normalDetail * 0.08 * openWater;
    color = mix(color, originalSurface, mix(0.08, 0.16, openWater));

    return clamp(color, 0.0, 1.0);
}

void main() {
    // Sample base texture first for early alpha discard
    vec4 textureColor = texture(u_textures, vec3(v_texCoord, v_texId), -2.0).bgra;
    float alpha = textureColor.a * v_color.a;

#ifdef DISCARD_ALPHA
    // Early discard before expensive operations
    if ((v_texId == 0u && alpha < 0.01) || (textureColor.a < v_alphaCutOff)) {
        discard;
    }
#endif

    // Only fetch material and do animation if texture is animated
    Material mat = getMaterial(v_texId);
    int frameCount = max(mat.frameCount, 1);
    if (frameCount > 1) {
        float frameSpeed = float(max(mat.animSpeed, 1));
        float frameT = mod(u_currentTime * frameSpeed, float(frameCount));
        float frame0 = floor(frameT);
        float frame1 = mod(frame0 + 1.0, float(frameCount));
        float tMix = fract(frameT);
        vec4 tex0 = texture(u_textures, vec3(v_texCoord, float(v_texId) + frame0), -2.0).bgra;
        vec4 tex1 = texture(u_textures, vec3(v_texCoord, float(v_texId) + frame1), -2.0).bgra;
        textureColor = mix(tex0, tex1, tMix);
        alpha = textureColor.a * v_color.a;
    }

    float banding = max(u_colorBanding, 1.0);
    vec3 paletteColor = round(v_color.rgb * banding) / banding;
    vec3 surface;
    if ((mat.flags & MATERIAL_FLAG_WATER) != 0) {
        vec3 waterMask = sampleWaterMask(v_worldUv, v_plane);
        surface =
            shadeWater(v_worldUv, v_worldPos, paletteColor, textureColor.rgb, mat, waterMask, u_currentTime) * u_brightness;
    } else {
        surface = textureColor.rgb * paletteColor * u_brightness;
    }

    float fog = clamp(v_fogAmount, 0.0, 1.0);
    fog = smoothstep(0.0, 1.0, fog);

    vec3 finalRgb = mix(surface, u_skyColor.rgb, fog);

    fragColor = vec4(clamp(finalRgb, 0.0, 1.0), alpha * u_worldEntityOpacity);
}
