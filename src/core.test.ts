import { describe, it, expect } from 'vitest';
import { assemble, machineFor, step, parseInput, type Machine } from './core';
import { examples } from './examples';
function run(source: string, input: number[] = []) {
  const a = assemble(source);
  expect(a.errors).toEqual([]);
  let m = machineFor(a.program!, input);
  for (let n = 0; n < 1000 && m.status === 'ready'; n++) m = step(m).machine;
  return m;
}
describe('assembler', () => {
  it('resolves forward labels, comments, colon syntax and DAT', () => {
    expect(assemble('LDA END ; hi\nHLT\nEND: DAT -7').program?.memory.slice(0, 3)).toEqual([
      502, 0, -7,
    ]);
  });
  it.each([
    'ADD',
    'LDA MISSING',
    'HLT 2',
    'INP 3',
    'DAT 1000',
    'DAT 1.5',
    'BRA 100',
    'FOO',
    'X DAT 1\nX DAT 2',
    'ADD 1 2',
  ])('reports errors for %s', (source) =>
    expect(assemble(source).errors.length).toBeGreaterThan(0),
  );
  it('rejects empty and oversized programs', () => {
    expect(assemble('; comment').errors.length).toBe(1);
    expect(assemble(Array(101).fill('DAT').join('\n')).errors.length).toBeGreaterThan(0);
  });
  it('allows mailbox 99 and raw machine code', () =>
    expect(assemble('599\n000').program?.memory.slice(0, 2)).toEqual([599, 0]));
});
describe('execution', () => {
  it.each([
    ['add', [12, 8], [20]],
    ['echo', [42], [42]],
    ['count', [3], [3, 2, 1, 0]],
    ['original', [], [20, 10]],
    ['max', [17, 9], [17]],
    ['max', [9, 17], [17]],
  ] as [string, number[], number[]][])('runs %s', (id, input, output) => {
    const m = run(examples.find((e) => e.id === id)!.source, input);
    expect(m.status).toBe('halted');
    expect(m.output).toEqual(output);
  });
  it('waits for input without advancing', () => {
    const m = machineFor(assemble('INP\nOUT\nHLT').program!);
    const waiting = step(m).machine;
    expect(waiting.status).toBe('waiting');
    expect(waiting.pc).toBe(0);
    expect(waiting.steps).toBe(0);
    expect(step({ ...waiting, input: [5] }).machine.acc).toBe(5);
  });
  it('does not mutate the prior state', () => {
    const m = machineFor(assemble('INP\nSTA 9\nHLT').program!, [8]);
    const n = step(m).machine;
    expect(m.input).toEqual([8]);
    expect(m.acc).toBe(0);
    const stored = step(n).machine;
    expect(stored.memory[9]).toBe(8);
    expect(n.memory[9]).toBe(0);
  });
  it('handles zero and nonnegative branches including negative subtraction', () => {
    expect(run('LDA V\nSUB ONE\nBRP POS\nOUT\nHLT\nPOS HLT\nV DAT 0\nONE DAT 1').output).toEqual([
      -1,
    ]);
    expect(run('BRP END\nDAT 400\nEND HLT').status).toBe('halted');
  });
  it('detects overflow, invalid instructions and PC bounds', () => {
    expect(run('LDA X\nADD ONE\nHLT\nX DAT 999\nONE DAT 1').status).toBe('error');
    expect(run('400').status).toBe('error');
    const m = machineFor(assemble('HLT').program!);
    expect(step({ ...m, pc: 100 }).machine.status).toBe('error');
  });
  it('retains the halt address and ignores further execution', () => {
    const m = run('HLT');
    expect(m.pc).toBe(0);
    expect(step(m).machine).toBe(m);
  });
  it('rejects invalid runtime input', () => expect(run('INP\nHLT', [1000]).status).toBe('error'));
  it('can execute self-modified instructions', () =>
    expect(run('LDA WORD\nSTA DEST\nBRA DEST\nDEST DAT 400\nWORD DAT 0').status).toBe('halted'));
});
describe('input', () => {
  it('parses spaces, commas and signed values', () =>
    expect(parseInput('1, -2，3\n4')).toEqual([1, -2, 3, 4]));
  it.each(['1.5', '1000', 'x', '1e2'])('rejects %s', (text) =>
    expect(parseInput(text)).toBeUndefined(),
  );
});
