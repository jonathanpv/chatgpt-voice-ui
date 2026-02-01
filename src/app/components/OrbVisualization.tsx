"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { postClientLog } from "@/app/lib/clientLog";

const VERTEX_SHADER = `#version 300 es
out vec4 out_position;
out vec2 out_uv;

const vec4 blitFullscreenTrianglePositions[6] = vec4[](
    vec4(-1.0, -1.0, 0.0, 1.0),
    vec4(3.0, -1.0, 0.0, 1.0),
    vec4(-1.0, 3.0, 0.0, 1.0),
    vec4(-1.0, -1.0, 0.0, 1.0),
    vec4(3.0, -1.0, 0.0, 1.0),
    vec4(-1.0, 3.0, 0.0, 1.0)
);

void main() {
    out_position = blitFullscreenTrianglePositions[gl_VertexID];
    out_uv = out_position.xy * 0.5 + 0.5;
    out_uv.y = 1.0 - out_uv.y;
    gl_Position = out_position;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define E (2.71828182846)
#define pi (3.14159265358979323844)
#define NUM_OCTAVES (4)

in vec2 out_uv;
out vec4 fragColor;

// --- UNIFORMS ---
uniform float u_time;
uniform float u_stateTime;
uniform float u_micLevel;
uniform vec2 u_viewport;

// State uniforms
uniform float u_stateListen;
uniform float u_stateThink;
uniform float u_stateSpeak;
uniform float u_stateHalt;
uniform float u_isListening;

// Advanced effect uniforms
uniform sampler2D uTextureNoise;
uniform vec3 u_bloopColorMain;
uniform vec3 u_bloopColorLow;
uniform vec3 u_bloopColorMid;
uniform vec3 u_bloopColorHigh;

// Audio data uniforms
uniform vec4 u_avgMag;
uniform vec4 u_cumulativeAudio;

// --- DATA STRUCTURES ---
struct ColoredSDF {
    float distance;
    vec4 color;
};

struct SDFArgs {
    vec2 st;
    float amount;
    float duration;
    float time;
    float mainRadius;
};

// --- UTILITY & NOISE FUNCTIONS ---
float spring(float t, float d) { return 1.0 - exp(-E * 2.0 * t) * cos((1.0 - d) * 115.0 * t); }
float scaled(float edge0, float edge1, float x) { return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0); }
float fixedSpring(float t, float d) { 
    float s = mix(1.0 - exp(-E * 2.0 * t) * cos((1.0 - d) * 115.0 * t), 1.0, clamp(t, 0.0, 1.0)); 
    return s * (1.0 - t) + t; 
}
float opSmoothUnion(float d1, float d2, float k) { 
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0); 
    return mix(d2, d1, h) - k * h * (1.0 - h); 
}
vec2 rotate(vec2 v, float a) { 
    float s = sin(a); 
    float c = cos(a); 
    return mat2(c, s, -s, c) * v; 
}

vec3 blendLinearBurn_13_5(vec3 base, vec3 blend, float opacity) {
    return (max(base + blend - vec3(1.0), vec3(0.0))) * opacity + base * (1.0 - opacity);
}

vec4 permute(vec4 x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
        mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x),
        u.y
    );
    return res * res;
}

float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0); 
    Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x); 
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = vec4(Pi0.z); vec4 iz1 = vec4(Pi1.z);
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5; 
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0); 
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(vec4(0.0), gx0) - 0.5); 
    gy0 -= sz0 * (step(vec4(0.0), gy0) - 0.5);
    vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5; 
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1); 
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(vec4(0.0), gx1) - 0.5); 
    gy1 -= sz1 * (step(vec4(0.0), gy1) - 0.5);
    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x); vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z); vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x); vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z); vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
    float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}

// --- STATE SHADER LOGIC ---
ColoredSDF getIdleState(SDFArgs args) {
    ColoredSDF sdf;
    float radius = 0.33;
    sdf.distance = length(args.st) - radius;
    sdf.color = vec4(u_bloopColorLow, 1.0);
    return sdf;
}

ColoredSDF getThinkState(SDFArgs args) {
    ColoredSDF sdf;
    float d = 1000.0;
    int count = 5;
    float entryAnimation = spring(scaled(0.0, 1.0, args.duration), 1.0);
    vec3 thinkColor = mix(u_bloopColorMid, u_bloopColorHigh, 0.6);
    for (int i = 0; i < count; i++) {
        float f = float(i + 1) / float(count);
        float a = -f * pi * 2.0 + args.time / 3.0 + spring(scaled(0.0, 10.0, args.duration), 1.0) * pi / 2.0;
        float ringRadi = args.mainRadius * 0.45 * entryAnimation;
        ringRadi -= (sin(entryAnimation * pi * 4.0 + a * pi * 2.0 + args.time * 3.0) * 0.5 + 0.5) * args.mainRadius * 0.1;
        vec2 pos = vec2(cos(a), sin(a)) * ringRadi;
        float dd = length(args.st - pos) - args.mainRadius * 0.5;
        d = opSmoothUnion(d, dd, 0.03 * scaled(0.0, 10.0, args.duration) + 0.8 * (1.0 - entryAnimation));
    }
    sdf.distance = d;
    sdf.color = vec4(thinkColor, 1.0);
    return sdf;
}

ColoredSDF getHaltState(SDFArgs args) {
    ColoredSDF sdf;
    float radius = mix(0.4, 0.45, sin(args.time * 0.25) * 0.5 + 0.5);
    float strokeWidth = mix(radius / 2.0, 0.02, args.amount);
    radius -= strokeWidth;
    radius *= mix(0.7, 1.0, args.amount);
    float circle = abs(length(args.st) - radius) - strokeWidth;
    sdf.distance = circle;
    sdf.color = vec4(1.0, 0.2, 0.2, 0.8);
    return sdf;
}

// Active State (Listen/Speak) - Exact watercolor effect from reference
ColoredSDF getActiveState(SDFArgs args) {
    ColoredSDF sdf;
    float listeningAmount = u_isListening;
    float entryAnimation = fixedSpring(scaled(0.0, 2.0, args.duration), 0.92);
    
    // Radius calculation matching reference exactly
    float baseRadius = mix(0.43, 0.37, listeningAmount);
    float entryScale = mix(0.9, 1.0, entryAnimation);
    float radius = baseRadius * entryScale + u_micLevel * 0.065;
    
    // Oscillation for visual interest
    float maxDisplacement = 0.0;
    float oscillationPeriod = 4.0;
    float displacementOffset = maxDisplacement * sin(2.0 * pi / oscillationPeriod * args.time);
    vec2 adjusted_st = args.st - vec2(0.0, displacementOffset);

    // --- Core watercolor effect from reference ---
    vec4 uAudioAverage = u_avgMag;
    vec4 uCumulativeAudio = u_cumulativeAudio;

    float scaleFactor = 1.0 / (2.0 * radius);
    vec2 uv = adjusted_st * scaleFactor + 0.5;
    uv.y = 1.0 - uv.y;

    // EXACT parameters from reference
    float noiseScale = 1.25;
    float windSpeed = 0.075;
    float warpPower = 0.19;
    float waterColorNoiseScale = 18.0;
    float waterColorNoiseStrength = 0.01;
    float textureNoiseScale = 1.0;
    float textureNoiseStrength = 0.08;
    float verticalOffset = 0.09;
    float waveSpread = 1.0;
    float layer1Amplitude = 1.0;
    float layer1Frequency = 1.0;
    float layer2Amplitude = 1.0;
    float layer2Frequency = 1.0;
    float layer3Amplitude = 1.0;
    float layer3Frequency = 1.0;
    float fbmStrength = 1.0;
    float fbmPowerDamping = 0.55;
    float overallSoundScale = 1.0;
    float blurRadius = 1.0;
    float timescale = 1.0;

    float time = args.time * timescale * 0.85;
    vec3 sinOffsets = vec3(
        uCumulativeAudio.x * 0.15 * overallSoundScale,
        -uCumulativeAudio.y * 0.5 * overallSoundScale,
        uCumulativeAudio.z * 1.5 * overallSoundScale
    );
    verticalOffset += 1.0 - waveSpread;

    // Warp UV with noise
    float noiseX = cnoise(vec3(uv * 1.0 + vec2(0.0, 74.8572), (time + uCumulativeAudio.x * 0.05 * overallSoundScale) * 0.3));
    float noiseY = cnoise(vec3(uv * 1.0 + vec2(203.91282, 10.0), (time + uCumulativeAudio.z * 0.05 * overallSoundScale) * 0.3));
    uv += vec2(noiseX * 2.0, noiseY) * warpPower;

    // Water color noise
    float noiseA = cnoise(vec3(uv * waterColorNoiseScale + vec2(344.91282, 0.0), time * 0.3)) +
                   cnoise(vec3(uv * waterColorNoiseScale * 2.2 + vec2(723.937, 0.0), time * 0.4)) * 0.5;
    uv += noiseA * waterColorNoiseStrength;
    uv.y -= verticalOffset;

    // Texture noise displacement
    vec2 textureUv = uv * textureNoiseScale;
    float textureSampleR0 = texture(uTextureNoise, textureUv).r;
    float textureSampleG0 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
    float textureNoiseDisp0 = mix(textureSampleR0 - 0.5, textureSampleG0 - 0.5, (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5) * textureNoiseStrength;

    textureUv += vec2(63.861 + uCumulativeAudio.x * 0.05, 368.937);
    float textureSampleR1 = texture(uTextureNoise, textureUv).r;
    float textureSampleG1 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
    float textureNoiseDisp1 = mix(textureSampleR1 - 0.5, textureSampleG1 - 0.5, (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5) * textureNoiseStrength;

    textureUv += vec2(272.861, 829.937 + uCumulativeAudio.y * 0.1);
    textureUv += vec2(180.302 - uCumulativeAudio.z * 0.1, 819.871);
    float textureSampleR3 = texture(uTextureNoise, textureUv).r;
    float textureSampleG3 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
    float textureNoiseDisp3 = mix(textureSampleR3 - 0.5, textureSampleG3 - 0.5, (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5) * textureNoiseStrength;
    uv += textureNoiseDisp0;

    // FBM noise
    vec2 st_fbm = uv * noiseScale;
    vec2 q = vec2(0.0);
    q.x = fbm(st_fbm * 0.5 + windSpeed * (time + uCumulativeAudio.a * 0.175 * overallSoundScale));
    q.y = fbm(st_fbm * 0.5 + windSpeed * (time + uCumulativeAudio.x * 0.136 * overallSoundScale));
    vec2 r = vec2(0.0);
    r.x = fbm(st_fbm + 1.0 * q + vec2(0.3, 9.2) + 0.15 * (time + uCumulativeAudio.y * 0.234 * overallSoundScale));
    r.y = fbm(st_fbm + 1.0 * q + vec2(8.3, 0.8) + 0.126 * (time + uCumulativeAudio.z * 0.165 * overallSoundScale));
    float f = fbm(st_fbm + r - q);
    float fullFbm = (f + 0.6 * f * f + 0.7 * f + 0.5) * 0.5;
    fullFbm = pow(fullFbm, fbmPowerDamping);
    fullFbm *= fbmStrength;

    // Wave layers
    blurRadius = blurRadius * 1.5;

    vec2 snUv = (uv + vec2((fullFbm - 0.5) * 1.2) + vec2(0.0, 0.025) + textureNoiseDisp0) * vec2(layer1Frequency, 1.0);
    float sn = noise(snUv * 2.0 + vec2(sin(sinOffsets.x * 0.25), time * 0.5 + sinOffsets.x)) * 2.0 * layer1Amplitude;
    float sn2 = smoothstep(sn - 1.2 * blurRadius, sn + 1.2 * blurRadius, (snUv.y - 0.5 * waveSpread) * (5.0 - uAudioAverage.x * 0.1 * overallSoundScale * 0.5) + 0.5);

    vec2 snUvBis = (uv + vec2((fullFbm - 0.5) * 0.85) + vec2(0.0, 0.025) + textureNoiseDisp1) * vec2(layer2Frequency, 1.0);
    float snBis = noise(snUvBis * 4.0 + vec2(sin(sinOffsets.y * 0.15) * 2.4 + 293.0, time * 1.0 + sinOffsets.y * 0.5)) * 2.0 * layer2Amplitude;
    float sn2Bis = smoothstep(snBis - (0.9 + uAudioAverage.y * 0.4 * overallSoundScale) * blurRadius, snBis + (0.9 + uAudioAverage.y * 0.8 * overallSoundScale) * blurRadius, (snUvBis.y - 0.6 * waveSpread) * (5.0 - uAudioAverage.y * 0.75) + 0.5);
    
    vec2 snUvThird = (uv + vec2((fullFbm - 0.5) * 1.1) + textureNoiseDisp3) * vec2(layer3Frequency, 1.0);
    float snThird = noise(snUvThird * 6.0 + vec2(sin(sinOffsets.z * 0.1) * 2.4 + 153.0, time * 1.2 + sinOffsets.z * 0.8)) * 2.0 * layer3Amplitude;
    float sn2Third = smoothstep(snThird - 0.7 * blurRadius, snThird + 0.7 * blurRadius, (snUvThird.y - 0.9 * waveSpread) * 6.0 + 0.5);
    
    sn2 = pow(sn2, 0.8);
    sn2Bis = pow(sn2Bis, 0.9);

    // Color blending
    vec3 sinColor;
    sinColor = blendLinearBurn_13_5(u_bloopColorMain, u_bloopColorLow, 1.0 - sn2);
    sinColor = blendLinearBurn_13_5(sinColor, mix(u_bloopColorMain, u_bloopColorMid, 1.0 - sn2Bis), sn2);
    sinColor = mix(sinColor, mix(u_bloopColorMain, u_bloopColorHigh, 1.0 - sn2Third), sn2 * sn2Bis);

    sdf.color = vec4(sinColor, 1.0);
    sdf.distance = length(adjusted_st) - radius;

    return sdf;
}

// --- MAIN SHADER ENTRYPOINT ---
void main() {
    vec2 st = out_uv - 0.5;
    st.y *= u_viewport.y / u_viewport.x;
    
    SDFArgs args;
    args.st = st;
    args.time = u_time;
    args.mainRadius = 0.49;
    
    float idleAmount = max(0.0, 1.0 - (u_stateListen + u_stateThink + u_stateSpeak + u_stateHalt));
    float activeAmount = max(u_stateListen, u_stateSpeak);
    
    float totalDist = 0.0;
    vec4 totalColor = vec4(0.0);
    float totalWeight = 0.0;

    // Idle
    if (idleAmount > 0.0) {
        SDFArgs tmp = args;
        tmp.amount = 1.0;
        tmp.duration = u_time;
        ColoredSDF res = getIdleState(tmp);
        totalDist += res.distance * idleAmount;
        totalColor += res.color * idleAmount;
        totalWeight += idleAmount;
    }
    
    // Active
    if (activeAmount > 0.0) {
        SDFArgs tmp = args;
        tmp.amount = 1.0;
        tmp.duration = u_stateTime;
        ColoredSDF res = getActiveState(tmp);
        totalDist += res.distance * activeAmount;
        totalColor += res.color * activeAmount;
        totalWeight += activeAmount;
    }
    
    // Think
    if (u_stateThink > 0.0) {
        SDFArgs tmp = args;
        tmp.amount = 1.0;
        tmp.duration = u_stateTime;
        ColoredSDF res = getThinkState(tmp);
        totalDist += res.distance * u_stateThink;
        totalColor += res.color * u_stateThink;
        totalWeight += u_stateThink;
    }
    
    // Halt
    if (u_stateHalt > 0.0) {
        SDFArgs tmp = args;
        tmp.amount = u_stateHalt; // Use amount for animation
        tmp.duration = u_stateTime;
        ColoredSDF res = getHaltState(tmp);
        totalDist += res.distance * u_stateHalt;
        totalColor += res.color * u_stateHalt;
        totalWeight += u_stateHalt;
    }
    
    // Final Rendering
    float clampingTolerance = 0.0075;
    float clampedShape = smoothstep(clampingTolerance, 0.0, totalDist);
    float alpha = totalColor.a * clampedShape;
    
    // Normalize color by weight to prevent darkening during transitions
    vec3 finalColor = totalColor.rgb;
    if (totalWeight > 0.001) {
        finalColor /= totalWeight;
    }
    
    fragColor = vec4(finalColor * alpha, alpha);
}`;

const COLOR_THEMES = {
  BLUE: {
    main: [0.862, 0.969, 1.0],
    low: [0.004, 0.506, 0.996],
    mid: [0.643, 0.937, 1.0],
    high: [1.0, 0.996, 0.937],
  },
  DARK_BLUE: {
    main: [0.855, 0.961, 1.0],
    low: [0.0, 0.4, 0.8],
    mid: [0.18, 0.776, 0.961],
    high: [0.447, 0.918, 0.961],
  },
  GREYSCALE: {
    main: [0.843, 0.843, 0.843],
    low: [0.188, 0.188, 0.188],
    mid: [0.596, 0.596, 0.596],
    high: [1.0, 1.0, 1.0],
  },
  ANGSTY_BLACK: {
    main: [0.286, 0.286, 0.286],
    low: [0.0, 0.0, 0.0],
    mid: [0.498, 0.498, 0.498],
    high: [0.412, 0.412, 0.412],
  },
  HELLO_TIBOR: {
    main: [1.0, 0.914, 0.529],
    low: [0.898, 0.545, 0.157],
    mid: [0.984, 0.447, 0.337],
    high: [0.953, 0.992, 0.996],
  },
} as const;

type ColorTheme = keyof typeof COLOR_THEMES;

export type OrbState = "idle" | "listen" | "think" | "speak" | "halt";

export type AudioMetrics = {
  avgMag: [number, number, number, number];
  cumulativeAudio: [number, number, number, number];
  micLevel: number;
};

let orbVisualWasReady = false;

type NoiseTextureLoad = {
  texture: WebGLTexture;
  ready: Promise<void>;
  cancel: () => void;
};

type OrbVisualizationProps = {
  audioMetricsRef: React.MutableRefObject<AudioMetrics>;
  orbState: OrbState;
  stateStartTimeMs: number;
  isListening: boolean;
  size?: number;
  theme?: ColorTheme;
  className?: string;
};

function loadNoiseTexture(gl: WebGL2RenderingContext): NoiseTextureLoad {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create texture");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 255, 255])
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let canceled = false;
  const image = new Image();
  const ready = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      if (canceled) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve();
    };
    image.onerror = () => {
      if (canceled) return;
      reject(new Error("Failed to load noise texture"));
    };
  });
  image.src = "/noise-watercolor-m3j88gni.webp";

  const cancel = () => {
    canceled = true;
    image.onload = null;
    image.onerror = null;
    if (image.src) {
      image.src = "";
    }
  };

  return { texture, ready, cancel };
}

export function OrbVisualization({
  audioMetricsRef,
  orbState,
  stateStartTimeMs,
  isListening,
  size = 320,
  theme = "BLUE",
  className,
}: OrbVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const noiseTextureRef = useRef<WebGLTexture | null>(null);
  const noiseReadyTimeRef = useRef<number | null>(null);
  const noiseLoadIdRef = useRef(0);
  const [isVisualReady, setIsVisualReady] = useState(() => orbVisualWasReady);
  const stateRef = useRef<OrbState>(orbState);
  const stateStartTimeRef = useRef<number>(stateStartTimeMs);
  const listeningRef = useRef(isListening);
  const sizeRef = useRef({ width: 0, height: 0 });
  const warnedUniforms = useRef(new Set<string>());
  const [isSupported, setIsSupported] = useState(true);

  const themeColors = useMemo(() => COLOR_THEMES[theme], [theme]);

  useEffect(() => {
    postClientLog({ type: "orb.mount", payload: { size, theme } });
    return () => {
      postClientLog({ type: "orb.unmount" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    postClientLog({
      type: "orb.props",
      payload: { orbState, isListening },
    });
  }, [orbState, isListening]);

  useEffect(() => {
    postClientLog({ type: "orb.visual_ready", payload: { isVisualReady } });
  }, [isVisualReady]);

  useEffect(() => {
    postClientLog({ type: "orb.support", payload: { isSupported } });
  }, [isSupported]);

  useEffect(() => {
    stateRef.current = orbState;
  }, [orbState]);

  useEffect(() => {
    stateStartTimeRef.current = stateStartTimeMs;
  }, [stateStartTimeMs]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (orbVisualWasReady && noiseReadyTimeRef.current === null) {
      noiseReadyTimeRef.current = performance.now();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    sizeRef.current = { width: canvas.width, height: canvas.height };
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      postClientLog({ type: "orb.webgl_context_lost" });
    };
    const handleContextRestored = () => {
      postClientLog({ type: "orb.webgl_context_restored" });
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true });
    if (!gl) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return;
    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      return;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) return;
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    glRef.current = gl;
    programRef.current = program;

    const loadId = noiseLoadIdRef.current + 1;
    noiseLoadIdRef.current = loadId;
    let didCancel = false;
    let noiseLoad: NoiseTextureLoad | null = null;

    try {
      noiseLoad = loadNoiseTexture(gl);
      noiseTextureRef.current = noiseLoad.texture;
    } catch {
      noiseTextureRef.current = null;
    }

    if (noiseLoad) {
      noiseLoad.ready
        .then(() => {
          if (didCancel || noiseLoadIdRef.current !== loadId) {
            gl.deleteTexture(noiseLoad.texture);
            return;
          }
          if (noiseReadyTimeRef.current === null) {
            noiseReadyTimeRef.current = performance.now();
          }
          if (!orbVisualWasReady) {
            setIsVisualReady(true);
            orbVisualWasReady = true;
          }
        })
        .catch(() => {
          if (didCancel || noiseLoadIdRef.current !== loadId) return;
        });
    }

    return () => {
      didCancel = true;
      noiseLoadIdRef.current += 1;
      noiseLoad?.cancel();
      if (noiseLoad?.texture) {
        gl.deleteTexture(noiseLoad.texture);
      }
      if (noiseTextureRef.current === noiseLoad?.texture) {
        noiseTextureRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      glRef.current = null;
      programRef.current = null;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    const stateTargets = {
      idle: { listen: 0, think: 0, speak: 0, halt: 0 },
      listen: { listen: 1, think: 0, speak: 0, halt: 0 },
      speak: { listen: 0, think: 0, speak: 1, halt: 0 },
      think: { listen: 0, think: 1, speak: 0, halt: 0 },
      halt: { listen: 0, think: 0, speak: 0, halt: 1 },
    } as const;

    const interpolatedStates = { listen: 0, think: 0, speak: 0, halt: 0 };
    let interpolatedListening = 1;
    let animationPhase = 0;
    let phaseSpeed = 1.0;

    const setUniform = (name: string, value: number | number[] | boolean) => {
      const location = gl.getUniformLocation(program, name);
      if (location === null) {
        if (!warnedUniforms.current.has(name)) {
          warnedUniforms.current.add(name);
        }
        return;
      }

      if (name === "uTextureNoise") {
        gl.uniform1i(location, Number(value));
        return;
      }

      if (typeof value === "number") {
        gl.uniform1f(location, value);
        return;
      }

      if (typeof value === "boolean") {
        gl.uniform1i(location, value ? 1 : 0);
        return;
      }

      if (value.length === 2) {
        gl.uniform2fv(location, value);
      } else if (value.length === 3) {
        gl.uniform3fv(location, value);
      } else if (value.length === 4) {
        gl.uniform4fv(location, value);
      }
    };

    const render = () => {
      const now = performance.now();
      const effectiveStart =
        noiseReadyTimeRef.current ?? stateStartTimeRef.current;
      const stateTime = noiseReadyTimeRef.current
        ? Math.max(0, (now - Math.max(stateStartTimeRef.current, effectiveStart)) / 1000)
        : 0;

      const PHASE_INCREMENT = 0.016;
      const targetSpeed = listeningRef.current ? 0.65 : 1.5;
      phaseSpeed = phaseSpeed * 0.95 + targetSpeed * 0.05;
      animationPhase += PHASE_INCREMENT * phaseSpeed;

      const STATE_SMOOTHING = 0.7;
      const targets = stateTargets[stateRef.current] || stateTargets.idle;
      interpolatedStates.listen =
        interpolatedStates.listen * STATE_SMOOTHING +
        targets.listen * (1 - STATE_SMOOTHING);
      interpolatedStates.think =
        interpolatedStates.think * STATE_SMOOTHING +
        targets.think * (1 - STATE_SMOOTHING);
      interpolatedStates.speak =
        interpolatedStates.speak * STATE_SMOOTHING +
        targets.speak * (1 - STATE_SMOOTHING);
      interpolatedStates.halt =
        interpolatedStates.halt * STATE_SMOOTHING +
        targets.halt * (1 - STATE_SMOOTHING);

      const LISTENING_SMOOTHING = 0.96;
      const listeningTarget =
        listeningRef.current || stateRef.current === "speak" ? 1.0 : 0.0;
      interpolatedListening =
        interpolatedListening * LISTENING_SMOOTHING +
        listeningTarget * (1 - LISTENING_SMOOTHING);

      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (!noiseReadyTimeRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const audio = audioMetricsRef.current;
      const micLevel =
        stateRef.current === "listen"
          ? audio.micLevel
          : Math.max(audio.micLevel * 0.5, 0.1);

      setUniform("u_time", animationPhase);
      setUniform("u_stateTime", stateTime);
      setUniform("u_micLevel", micLevel);
      setUniform("u_viewport", [width, height]);
      setUniform("u_bloopColorMain", [...themeColors.main]);
      setUniform("u_bloopColorLow", [...themeColors.low]);
      setUniform("u_bloopColorMid", [...themeColors.mid]);
      setUniform("u_bloopColorHigh", [...themeColors.high]);
      setUniform("u_avgMag", audio.avgMag);
      setUniform("u_cumulativeAudio", audio.cumulativeAudio);
      setUniform("u_stateListen", interpolatedStates.listen);
      setUniform("u_stateThink", interpolatedStates.think);
      setUniform("u_stateSpeak", interpolatedStates.speak);
      setUniform("u_stateHalt", interpolatedStates.halt);
      setUniform("u_isListening", interpolatedListening);

      if (noiseTextureRef.current) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noiseTextureRef.current);
        setUniform("uTextureNoise", 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [audioMetricsRef, themeColors]);

  return (
    <div className={cn("flex h-full w-full items-center justify-center", className)}>
      {isSupported ? (
        <canvas
          ref={canvasRef}
          className="rounded-xl"
          style={{
            opacity: isVisualReady ? 1 : 0,
            transition: "opacity 240ms ease-out",
          }}
        />
      ) : (
        <div className="text-sm text-muted-foreground">
          WebGL2 is not supported in this browser.
        </div>
      )}
    </div>
  );
}
