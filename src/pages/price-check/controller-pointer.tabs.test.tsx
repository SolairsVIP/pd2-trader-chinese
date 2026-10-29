// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { switchControllerTab } from './controller-pointer';

afterEach(() => cleanup());

describe('controller tab switching with Radix Tabs', () => {
  it.each(['automatic', 'manual'] as const)(
    'switches %s tabs in the active panel, skipping disabled tabs and wrapping',
    (activationMode) => {
      const changed = vi.fn();
      const { getByTestId } = render(
        <>
          <div data-testid="panel">
            <div hidden>
              <Tabs defaultValue="hidden-one">
                <TabsList>
                  <TabsTrigger value="hidden-one">Hidden one</TabsTrigger>
                  <TabsTrigger value="hidden-two">Hidden two</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Tabs defaultValue="first" activationMode={activationMode} onValueChange={changed}>
              <TabsList>
                <TabsTrigger value="first">First</TabsTrigger>
                <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
                <TabsTrigger value="third">Third</TabsTrigger>
                <TabsTrigger value="fourth">Fourth</TabsTrigger>
              </TabsList>
              <TabsContent value="first">First content</TabsContent>
              <TabsContent value="third">Third content</TabsContent>
              <TabsContent value="fourth">Fourth content</TabsContent>
            </Tabs>
          </div>
          <div data-testid="other-panel">
            <Tabs defaultValue="outside-one">
              <TabsList>
                <TabsTrigger value="outside-one">Outside one</TabsTrigger>
                <TabsTrigger value="outside-two">Outside two</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </>,
      );
      const panel = getByTestId('panel');
      const panelTabs = within(panel);
      const selected = (name: string) => panelTabs.getByRole('tab', { name }).getAttribute('aria-selected');
      const step = (direction: -1 | 1, name: string) => {
        act(() => expect(switchControllerTab(panel, direction)).toBe(true));
        expect(selected(name)).toBe('true');
        expect(panelTabs.getByRole('tabpanel').textContent).toBe(`${name} content`);
      };

      expect(selected('First')).toBe('true');
      expect(panelTabs.getByRole('tab', { name: 'Disabled' }).hasAttribute('disabled')).toBe(true);
      step(1, 'Third');
      step(1, 'Fourth');
      step(1, 'First');
      step(-1, 'Fourth');
      step(-1, 'Third');
      step(-1, 'First');
      expect(changed.mock.calls.map(([value]) => value)).toEqual(['third', 'fourth', 'first', 'fourth', 'third', 'first']);
      expect(within(getByTestId('other-panel')).getByRole('tab', { name: 'Outside one' }).getAttribute('aria-selected')).toBe('true');
    },
  );
});
