// Malla de gradiente en WebGL (ruido fBm animado, estilo Stripe/whatamesh).
// Los 4 colores se toman de la portada de la canción activa y se interpolan al cambiar.

export type RGB = [number, number, number];

export const hexToRgb01 = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `precision highp float;
uniform vec2 R; uniform float T;
uniform vec3 C0, C1, C2, C3;
float h(vec2 x){ return fract(sin(dot(x, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 x){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1,0)), u.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 x){
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++){ v += a * noise(x); x = x * 2.03 + vec2(1.7); a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 q = uv * 1.4; q.x *= R.x / R.y;
  float n1 = fbm(q + vec2(T * 0.03, T * 0.02));
  float n2 = fbm(q * 1.6 - vec2(T * 0.025, T * 0.04) + 3.1);
  vec3 col = mix(C0, C1, smoothstep(0.15, 0.85, n1));
  col = mix(col, C2, smoothstep(0.35, 0.95, n2) * 0.75);
  col = mix(col, C3, pow(smoothstep(0.55, 1.0, n1 * n2), 2.0) * 0.4);
  float vig = smoothstep(1.25, 0.35, length(uv - 0.5));
  col *= mix(0.55, 1.0, vig);
  col += (h(gl_FragCoord.xy + T) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class MeshGradient {
  private gl: WebGLRenderingContext | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private reduced: boolean;
  /** color actual (interpolado) y objetivo; los tween externos (GSAP) escriben en tgt */
  cur: RGB[] = [];
  tgt: RGB[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;
    this.gl = gl;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.gl = null;
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const k of ['R', 'T', 'C0', 'C1', 'C2', 'C3']) {
      this.uni[k] = gl.getUniformLocation(prog, k);
    }
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get ok() {
    return !!this.gl;
  }

  setColors(cols: RGB[], instant = false) {
    this.tgt = cols.map((c) => [...c] as RGB);
    if (instant || !this.cur.length) this.cur = cols.map((c) => [...c] as RGB);
  }

  private resize() {
    if (!this.gl) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.uniform2f(this.uni.R, this.canvas.width, this.canvas.height);
  }

  start() {
    if (!this.gl) return;
    let t0 = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      for (let i = 0; i < this.tgt.length; i++) {
        const c = (this.cur[i] ??= [...this.tgt[i]] as RGB);
        for (let j = 0; j < 3; j++) c[j] += (this.tgt[i][j] - c[j]) * Math.min(1, dt * 1.8);
      }
      const gl = this.gl!;
      gl.uniform1f(this.uni.T, this.reduced ? 0 : now / 1000);
      gl.uniform3fv(this.uni.C0, this.cur[0] ?? [0.1, 0.1, 0.12]);
      gl.uniform3fv(this.uni.C1, this.cur[1] ?? [0.2, 0.15, 0.25]);
      gl.uniform3fv(this.uni.C2, this.cur[2] ?? [0.9, 0.6, 0.3]);
      gl.uniform3fv(this.uni.C3, this.cur[3] ?? [0.02, 0.02, 0.03]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
