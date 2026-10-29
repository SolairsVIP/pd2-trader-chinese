// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveControllerPointer, clickControllerPointer, scrollControllerPointer } from './controller-pointer';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('controller pointer', () => {
  it('ignores stick drift, moves with the stick and stays inside the panel', () => {
    const bounds = { left: 100, top: 50, right: 300, bottom: 250 };
    expect(moveControllerPointer({ x: 150, y: 100 }, [130, 128], 0.1, bounds)).toEqual({ x: 150, y: 100 });
    expect(moveControllerPointer({ x: 290, y: 100 }, [255, 128], 0.1, bounds)).toEqual({ x: 299, y: 100 });
  });
  it('uses the configured pointer speed and bounds invalid stored values', () => {
    const bounds = { left: 0, top: 0, right: 1000, bottom: 1000 };
    const start = { x: 100, y: 100 };
    expect(moveControllerPointer(start, [255, 128], 0.1, bounds, 50).x).toBeCloseTo(135);
    expect(moveControllerPointer(start, [255, 128], 0.1, bounds, 200).x).toBeCloseTo(240);
    expect(moveControllerPointer(start, [255, 128], 0.1, bounds, NaN).x).toBeCloseTo(170);
    expect(moveControllerPointer(start, [255, 128], 0.1, bounds, 500).x).toBeCloseTo(240);
  });
  it('clicks a control inside the panel but never clicks outside it', () => {
    document.body.innerHTML = '<div id="panel"><button>inside</button></div><button id="outside">outside</button>';
    const panel = document.getElementById('panel')!;
    const inside = panel.querySelector('button')!;
    const outside = document.getElementById('outside')!;
    const clicked = vi.fn();
    inside.addEventListener('click', clicked);
    outside.addEventListener('click', clicked);
    const point = vi.spyOn(document, 'elementFromPoint').mockReturnValue(inside);
    clickControllerPointer(panel, { x: 10, y: 10 });
    expect(clicked).toHaveBeenCalledTimes(1);
    point.mockReturnValue(outside);
    clickControllerPointer(panel, { x: 10, y: 10 });
    expect(clicked).toHaveBeenCalledTimes(1);
  });
  it('can click an icon inside a button', () => {
    document.body.innerHTML = '<div id="panel"><button><svg><path></path></svg></button></div>';
    const panel = document.getElementById('panel')!;
    const button = panel.querySelector('button')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(panel.querySelector('path')!);
    clickControllerPointer(panel, { x: 10, y: 10 });
    expect(clicked).toHaveBeenCalledTimes(1);
  });
  it('scrolls the area under the pointer or the result list, with deadzone and bounded frame time', () => {
    document.body.innerHTML = '<div id="panel"><div data-slot="scroll-area"><div data-slot="scroll-area-viewport"><span id="target"></span></div><div id="bar" data-slot="scroll-area-scrollbar"></div></div><div data-controller-scroll-default><div id="results" data-slot="scroll-area-viewport"></div></div></div>';
    const panel = document.getElementById('panel')!;
    const viewport = panel.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    const results = document.getElementById('results')!;
    for (const node of [viewport, results]) {
      Object.defineProperties(node, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } });
      node.style.overflowY = 'auto';
      node.scrollBy = vi.fn();
    }
    const point = vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.getElementById('bar'));
    scrollControllerPointer(panel, { x: 1, y: 1 }, 130, 1);
    expect(viewport.scrollBy).not.toHaveBeenCalled();
    scrollControllerPointer(panel, { x: 1, y: 1 }, 255, 1);
    expect(viewport.scrollBy).toHaveBeenCalledWith({ top: expect.closeTo(60, 1) });
    point.mockReturnValue(panel);
    scrollControllerPointer(panel, { x: 1, y: 1 }, 0, 0.1);
    expect(results.scrollBy).toHaveBeenCalledWith({ top: expect.closeTo(-60, 1) });
    point.mockReturnValue(document.body);
    scrollControllerPointer(panel, { x: 1, y: 1 }, 255, 0.1);
    expect(results.scrollBy).toHaveBeenCalledTimes(1);
  });
});
