/**
 * Probes WebGL2 support and the GPU tier. detect-gpu reads its benchmark tables from files
 * bundled with the app (dynamic imports below), never from a CDN.
 */
import type { GpuProbe } from './renderer.ts';

let cached: Promise<GpuProbe> | null = null;

function probeWebGl(): { webgl2: boolean; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { webgl2: false, renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, renderer: renderer.toLowerCase() };
  } catch {
    return { webgl2: false, renderer: '' };
  }
}

const benchmarks = import.meta.glob<{ default: unknown }>(
  '../../../node_modules/detect-gpu/dist/benchmarks/*.json',
);

async function probeTier(): Promise<number | null> {
  try {
    const { getGPUTier } = await import('detect-gpu');
    const result = await getGPUTier({
      override: {
        loadBenchmarks: async (file: string) => {
          const entry = Object.entries(benchmarks).find(([path]) => path.endsWith(`/${file}`));
          if (!entry) throw new Error(`missing benchmark ${file}`);
          return (await entry[1]()).default as never;
        },
      },
    });
    return result.tier;
  } catch {
    return null;
  }
}

export function probeGpu(): Promise<GpuProbe> {
  cached ??= (async () => {
    const gl = probeWebGl();
    if (!gl.webgl2) return { ...gl, tier: null };
    return { ...gl, tier: await probeTier() };
  })();
  return cached;
}
