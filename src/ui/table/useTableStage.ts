import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphicsSetting } from '../../app/settings.ts';
import { strings } from '../../i18n/index.ts';
import { probeGpu } from './gpu-probe.ts';
import { chooseRenderer, type QualityTier, type RendererChoice } from './renderer.ts';

const TOAST_MS = 3_500;

/**
 * Picks the table renderer for the "Gráficos" setting (AGENTS.md §20.3). The 2D table shows
 * until the GPU probe answers. Runtime downgrades and WebGL failures last for this table only;
 * the setting itself is never rewritten.
 */
export function useTableStage(setting: GraphicsSetting) {
  const [probed, setProbed] = useState<{ setting: GraphicsSetting; choice: RendererChoice } | null>(
    null,
  );
  const [lowered, setLowered] = useState<{ setting: GraphicsSetting; tier: QualityTier } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    if (setting === '2d') return;
    void probeGpu().then((probe) => {
      if (live) setProbed({ setting, choice: chooseRenderer(setting, probe) });
    });
    return () => {
      live = false;
    };
  }, [setting]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => {
      setToast(null);
    }, TOAST_MS);
  }, []);

  const lowerTo = useCallback(
    (tier: QualityTier) => {
      setLowered({ setting, tier });
      show(strings.table.graphicsLowered(strings.settings.graphicsOptions[tier]));
    },
    [setting, show],
  );

  const fallBack = useCallback(() => {
    setFailed(true);
    show(strings.table.graphicsFallback);
  }, [show]);

  let stage: RendererChoice = { kind: '2d' };
  if (setting !== '2d' && !failed && probed?.setting === setting && probed.choice.kind === '3d') {
    const tier = lowered?.setting === setting ? lowered.tier : probed.choice.tier;
    stage = { kind: '3d', tier };
  }
  return { stage, lowerTo, fallBack, toast };
}
