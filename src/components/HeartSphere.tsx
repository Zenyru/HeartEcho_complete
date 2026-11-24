"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type RGB = [number, number, number];

/*
100+ BPM	
#FF3C5A (255, 60, 90)	
#DC1EAA (220, 30, 170)	crimson-pink → magenta
88 BPM	
#FF2DE1 (255, 45, 225)	
#822DFF (130, 45, 255)	magenta → violet (your reference)
75 BPM	
#9650FF (150, 80, 255)	
#3C5AFF (60, 90, 255)	violet → royal blue
62 BPM and below	
#3CD2FF (60, 210, 255)	
#286EFF (40, 110, 255)	bright cyan → blue
No reading yet	
#FF2DE1 (255, 45, 225)	
#732DFF (115, 45, 255)	starting magenta-violet 
*/



// "top" is the upper colour of the orb, "bottom" the lower one. Values are 0–255.
const COLOR_STOPS: { at: number; top: RGB; bottom: RGB }[] = [
  { at: 100, top: [255, 60, 90], bottom: [220, 30, 170] }, //  fast heart: vivid crimson-pink → magenta
  { at: 88, top: [255, 45, 225], bottom: [130, 45, 255] }, //  settling: magenta → violet (your reference image)
  { at: 75, top: [150, 80, 255], bottom: [60, 90, 255] }, //   calmer: violet → royal blue
  { at: 62, top: [60, 210, 255], bottom: [40, 110, 255] }, //  calm: bright cyan → blue
];
const IDLE = { top: [255, 45, 225] as RGB, bottom: [115, 45, 255] as RGB };

const LAYERS = 7; // how many wavy shells are stacked (more = heavier)

function colorsFor(bpm: number | null): { top: RGB; bottom: RGB } {
  if (bpm === null) return IDLE;
  if (bpm >= COLOR_STOPS[0].at) return COLOR_STOPS[0];
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  if (bpm <= last.at) return last;
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const hi = COLOR_STOPS[i];
    const lo = COLOR_STOPS[i + 1];
    if (bpm <= hi.at && bpm >= lo.at) {
      const f = (hi.at - bpm) / (hi.at - lo.at);
      return { top: mix(hi.top, lo.top, f), bottom: mix(hi.bottom, lo.bottom, f) };
    }
  }
  return last;
}

function mix(a: RGB, b: RGB, f: number): RGB {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}


// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence): smooth random waves
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uLayer;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
${NOISE}

// Push each point out/in along its direction using two layers of noise
vec3 shape(vec3 p){
  float t = uTime * 0.3;
  float l = uLayer * 0.09; // each shell is a slightly shifted copy → layered, wispy edges
  float n = snoise(p * 1.15 + vec3(t + l, t * 0.8 - l, -t * 0.6)) * 0.24
          + snoise(p * 2.1 - vec3(t * 0.9, l * 2.0, t * 0.7)) * 0.07;
  float r = 1.0 + n + uLayer * 0.012 + uPulse * 0.04;
  return p * r;
}

void main(){
  vec3 p = normalize(position);
  vec3 displaced = shape(p);

  // Work out the bent surface's direction from two nearby points
  vec3 helper = abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(p, helper));
  vec3 t2 = cross(p, t1);
  float e = 0.01;
  vec3 a = shape(normalize(p + t1 * e)) - displaced;
  vec3 b = shape(normalize(p + t2 * e)) - displaced;
  vec3 n = normalize(cross(a, b));
  if (dot(n, p) < 0.0) n = -n;

  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * n);
  vView = -mv.xyz;
  vObj = displaced;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uPulse;
uniform float uLayer;
uniform float uLayers;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;

void main(){
  // Bright where the surface is edge-on to you (the rim), see-through in the middle
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(1.0 - facing, 1.6);

  // Fine streaks running around the shell, like the reference's silky texture
  float streak = 0.8 + 0.2 * sin(vObj.y * 140.0 + vObj.x * 20.0 + uLayer * 2.1);

  // Colour: top colour above, bottom colour below
  float g = -vView.y + 0.35 * vView.x; // up and to the left on screen
  vec3 col = mix(uBottom, uTop, smoothstep(-1.0, 0.9, g));

  float layerFade = 1.0 - 0.6 * uLayer / uLayers;
  float alpha = (0.26 + 0.85 * rim) * streak * layerFade * (1.0 + 0.06 * uPulse) * 0.62;
  gl_FragColor = vec4(col * alpha * 1.3, alpha);
}`;

interface HeartSphereProps {
  bpm: number | null; //  latest smoothed heart rate (null = no reading yet)
  beatCount: number; //   increases by 1 on every BEAT message
  size?: number; //       width and height in pixels
}

export function HeartSphere({ bpm, beatCount, size = 340 }: HeartSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const bpmRef = useRef<number | null>(bpm);
  const lastBeatRef = useRef(-10000);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (beatCount > 0) lastBeatRef.current = performance.now();
  }, [beatCount]);

  useEffect(() => {
    const mount = mountRef.current;
    const glowCanvas = glowRef.current;
    const glowCtx = glowCanvas?.getContext("2d");
    if (!mount || !glowCanvas || !glowCtx) return;
    glowCanvas.width = size;
    glowCanvas.height = size;

    // --- 3D scene setup ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0); // transparent background
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.z = 5.4;

    const group = new THREE.Group();
    scene.add(group);

    const startColors = colorsFor(bpmRef.current);
    const top = new THREE.Color(...startColors.top.map((v) => v / 255) as RGB);
    const bottom = new THREE.Color(...startColors.bottom.map((v) => v / 255) as RGB);

    // One shared, finely divided sphere; each layer bends it differently
    const geometry = new THREE.IcosahedronGeometry(1, 26);
    const materials: THREE.ShaderMaterial[] = [];
    for (let i = 0; i < LAYERS; i++) {
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uLayer: { value: i },
          uLayers: { value: LAYERS },
          uTop: { value: top },
          uBottom: { value: bottom },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, // overlapping shells glow brighter
      });
      materials.push(material);
      group.add(new THREE.Mesh(geometry, material));
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let clock = 0;
    let speed = 1;
    let last = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const bpmNow = bpmRef.current;

      // Faster heart → faster waves
      // Swirl speed follows the heart only gently, and changes smoothly (no sudden jumps)
      const targetSpeed = 0.7 + 0.3 * ((bpmNow ?? 60) / 70);
      speed += (targetSpeed - speed) * (1 - Math.exp(-dt * 0.8));
      clock += dt * speed * (reduceMotion ? 0.15 : 1);

      // "Lub-dub": strong swell at the beat, softer one 200 ms later
      const d = now - lastBeatRef.current;
      // One soft swell per beat: eases out over ~150 ms, then eases back over ~450 ms
      const rise = 150, fall = 450;
      const pulse =
        d < rise ? Math.sin((d / rise) * (Math.PI / 2)) ** 2
        : d < rise + fall ? Math.cos(((d - rise) / fall) * (Math.PI / 2)) ** 2
        : 0;

      // Smoothly fade toward the colours for the current heart rate
      const target = colorsFor(bpmNow);
      const fade = 1 - Math.exp(-dt * 1.8); // about 1.5 s to blend to a new colour
      top.lerp(new THREE.Color(target.top[0] / 255, target.top[1] / 255, target.top[2] / 255), fade);
      bottom.lerp(new THREE.Color(target.bottom[0] / 255, target.bottom[1] / 255, target.bottom[2] / 255), fade);

      for (const m of materials) {
        m.uniforms.uTime.value = clock;
        m.uniforms.uPulse.value = pulse;
      }

      // Slow 3D turning
      group.rotation.y = clock * 0.25;
      group.rotation.x = 0.3 + Math.sin(clock * 0.2) * 0.2;

      renderer.render(scene, camera);

      // Copy the picture into the blurred layer behind it → soft dreamy glow (bloom)
      glowCtx.clearRect(0, 0, size, size);
      glowCtx.drawImage(renderer.domElement, 0, 0, size, size);

      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    // Clean up everything when the component disappears
    return () => {
      cancelAnimationFrame(frameId);
      materials.forEach((m) => m.dispose());
      geometry.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      role="img"
      aria-label={bpm === null ? "Heart sphere, waiting for a reading" : `Heart sphere, ${bpm} beats per minute`}
    >
      {/* blurred copy behind = glow */}
      <canvas
        ref={glowRef}
        style={{ position: "absolute", inset: 0, width: size, height: size, filter: "blur(18px) saturate(1.25)", opacity: 0.95 }}
      />
      {/* the sharp 3D picture on top */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, filter: "blur(0.6px)" }} />
    </div>
  );
}