// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const status = () => document.querySelector('.status')!.textContent;
const regs = () => [...document.querySelectorAll('.registers strong')].map((x) => x.textContent);
function tick(count: number, ms = 40) {
  for (let i = 0; i < count; i++)
    act(() => {
      vi.advanceTimersByTime(ms);
    });
}
function example(id: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: id } });
}
function queue(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Input numbers' }), {
    target: { value: text },
  });
  click('Queue inputs');
}
function fast() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Animate' }));
}

describe('classroom workflows', () => {
  it('executes addition and restores original memory on reset', () => {
    render(<App />);
    queue('12 8');
    fast();
    click('▶ Run');
    tick(12);
    expect(status()).toBe('Halted');
    expect(document.querySelector('.output-tokens')!.textContent).toBe('20');
    expect(screen.getByRole('button', { name: 'Mailbox 06: 12' })).toBeDefined();
    click('↺ Reset');
    expect(regs().slice(0, 2)).toEqual(['00', '000']);
    expect(screen.getByRole('button', { name: 'Mailbox 06: 0' })).toBeDefined();
    expect(document.querySelector('.output-tokens')!.textContent).toContain('Results will appear');
  });
  it('freezes animation and PC when paused, then resumes correctly', () => {
    render(<App />);
    example('echo');
    queue('42');
    click('↳ Step');
    tick(8);
    click('Ⅱ Pause');
    const transform = document
      .querySelector('.machine-svg > g:last-of-type')!
      .getAttribute('transform');
    tick(100);
    expect(status()).toBe('Paused');
    expect(regs().slice(0, 2)).toEqual(['00', '000']);
    expect(document.querySelector('.machine-svg > g:last-of-type')!.getAttribute('transform')).toBe(
      transform,
    );
    click('▶ Resume');
    tick(260);
    expect(status()).toBe('Halted');
    expect(document.querySelector('.output-tokens')!.textContent).toBe('42');
  });
  it('waits for input, accepts it and continues at the same instruction', () => {
    render(<App />);
    example('echo');
    fast();
    click('▶ Run');
    tick(2);
    expect(status()).toBe('Needs input');
    expect(regs()[0]).toBe('00');
    queue('7');
    click('▶ Run');
    tick(8);
    expect(status()).toBe('Halted');
    expect(document.querySelector('.output-tokens')!.textContent).toBe('7');
  });
  it('blocks overlapping steps and cancels pending changes on reset', () => {
    render(<App />);
    queue('12 8');
    click('↳ Step');
    expect((screen.getByRole('button', { name: '↳ Step' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    tick(8);
    click('↺ Reset');
    tick(100);
    expect(regs().slice(0, 2)).toEqual(['00', '000']);
    expect(status()).toBe('Ready');
  });
  it('requires assembly after edits and identifies an invalid line', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'LMC assembly program' }), {
      target: { value: 'ADD WRONG\nHLT' },
    });
    expect((screen.getByRole('button', { name: '▶ Run' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    click('Assemble & load →');
    expect(screen.getByRole('alert').textContent).toContain('Line 1');
  });
  it('rejects fractional input without adding it to the queue', () => {
    render(<App />);
    queue('1.5');
    expect(screen.getByRole('alert').textContent).toContain('whole numbers');
    expect(document.querySelector('.tokens')!.textContent).toContain('empty');
  });
  it('runs the original JavaFX program and retains both outputs', () => {
    render(<App />);
    example('original');
    fast();
    click('▶ Run');
    tick(30);
    expect(status()).toBe('Halted');
    expect([...document.querySelectorAll('.output-tokens span')].map((x) => x.textContent)).toEqual(
      ['20', '10'],
    );
  });
  it('stops runaway loops and allows an explicit continuation', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'LMC assembly program' }), {
      target: { value: 'BRA 00' },
    });
    click('Assemble & load →');
    fast();
    click('▶ Run');
    tick(1002, 20);
    expect(status()).toBe('Ready');
    expect(document.querySelector('.notice')!.textContent).toContain('1,000');
    click('▶ Run');
    tick(2, 20);
    expect(status()).toBe('Running');
    // This deliberately renders 1,000 steps; shared CI runners need a longer wall-clock budget.
  }, 30000);
  it('switches language, opens instructions and enables classroom view', () => {
    render(<App />);
    click('中文');
    expect(screen.getByRole('heading', { name: '看见计算机的每一步。' })).toBeDefined();
    click('使用指南 ↗');
    expect(screen.getByRole('dialog')).toBeDefined();
    click('关闭指南');
    click('课堂模式');
    expect(document.querySelector('.app.classroom')).not.toBeNull();
  });
  it('restores the saved source on a fresh page', () => {
    localStorage.setItem('lmc-visualizer-v1', JSON.stringify({ source: 'OUT\nHLT', lang: 'en' }));
    render(<App />);
    expect(
      (screen.getByRole('textbox', { name: 'LMC assembly program' }) as HTMLTextAreaElement).value,
    ).toBe('OUT\nHLT');
    expect(regs()[2]).toBe('OUT');
  });
  it('exports a text file and releases its URL after download begins', () => {
    const create = vi.fn(() => 'blob:lmc-test');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    let exportedName = '';
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      exportedName = this.download;
      expect(this.href).toBe('blob:lmc-test');
    });
    render(<App />);
    click('↓ Export');
    expect(exportedName).toBe('program.lmc');
    expect(create.mock.calls.length).toBe(1);
    expect(revoke).not.toHaveBeenCalled();
    tick(25);
    expect(revoke).toHaveBeenCalledWith('blob:lmc-test');
    anchor.mockRestore();
  });
  it('loads imported text but requires assembly before running', async () => {
    render(<App />);
    const file = { size: 20, text: () => Promise.resolve('OUT\nHLT') };
    await act(async () => {
      fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
    });
    expect(
      (screen.getByRole('textbox', { name: 'LMC assembly program' }) as HTMLTextAreaElement).value,
    ).toBe('OUT\nHLT');
    expect((screen.getByRole('button', { name: '▶ Run' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    click('Assemble & load →');
    expect(regs()[2]).toBe('OUT');
  });
});
