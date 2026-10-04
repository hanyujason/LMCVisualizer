/** Teaching variant: 100 signed mailboxes, -999..999, overflow is an explicit error. */
export const SIZE = 100;
export const OPS: Record<string, number> = {
  ADD: 100,
  SUB: 200,
  STA: 300,
  LDA: 500,
  BRA: 600,
  BRZ: 700,
  BRP: 800,
  INP: 901,
  OUT: 902,
  HLT: 0,
  DAT: -1,
};
export type Diagnostic = { line: number; message: string };
export type Program = {
  memory: number[];
  lines: Record<number, number>;
  labels: Record<string, number>;
  source: string;
};
export type Assembly = { program?: Program; errors: Diagnostic[] };
export type Machine = {
  memory: number[];
  pc: number;
  acc: number;
  input: number[];
  output: number[];
  status: 'ready' | 'waiting' | 'halted' | 'error';
  error?: string;
  steps: number;
};
export type Trace = {
  pc: number;
  word: number;
  op: string;
  address?: number;
  value?: number;
  before: number;
  after: number;
  jumped?: boolean;
  target: number;
  output?: number;
};
export type Result = { machine: Machine; trace?: Trace };
export function assemble(source: string): Assembly {
  const errors: Diagnostic[] = [];
  const labels: Record<string, number> = Object.create(null);
  const rows: { line: number; tokens: string[]; address: number }[] = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    const text = raw
      .split(/\/\/|;|#/)[0]
      .trim()
      .toUpperCase();
    if (!text) return;
    const tokens = text.split(/\s+/);
    const first = tokens[0];
    if (first.endsWith(':') || (!(first in OPS) && !/^-?\d+$/.test(first) && tokens.length > 1)) {
      const label = tokens.shift()!.replace(/:$/, '');
      if (!/^[A-Z_][A-Z0-9_]*$/.test(label) || label in OPS)
        errors.push({ line: i + 1, message: `Invalid label: ${label}` });
      else if (label in labels) errors.push({ line: i + 1, message: `Duplicate label: ${label}` });
      else labels[label] = rows.length;
    }
    if (!tokens.length) {
      errors.push({
        line: i + 1,
        message: 'A label needs an instruction or DAT on the same line.',
      });
      return;
    }
    rows.push({ line: i + 1, tokens, address: rows.length });
  });
  if (rows.length > SIZE)
    errors.push({ line: rows[SIZE].line, message: 'Program exceeds 100 mailboxes.' });
  if (!rows.length) errors.push({ line: 1, message: 'Enter at least one instruction.' });
  const memory = Array<number>(SIZE).fill(0);
  const lines: Record<number, number> = {};
  for (const { line, tokens, address } of rows.slice(0, SIZE)) {
    const [op, operand] = tokens;
    lines[address] = line;
    let word = 0;
    if (/^-?\d+$/.test(op) && tokens.length === 1) {
      word = Number(op);
      if (!Number.isInteger(word) || word < -999 || word > 999)
        errors.push({ line, message: 'Mailbox values must be integers from -999 to 999.' });
    } else if (!(op in OPS)) errors.push({ line, message: `Unknown instruction: ${op}` });
    else if (op === 'DAT') {
      word = operand === undefined ? 0 : Number(operand);
      if (tokens.length > 2 || !/^-?\d+$/.test(operand ?? '0') || word < -999 || word > 999)
        errors.push({ line, message: 'DAT needs an integer from -999 to 999.' });
    } else if (['INP', 'OUT', 'HLT'].includes(op)) {
      word = OPS[op];
      if (tokens.length !== 1) errors.push({ line, message: `${op} does not take an operand.` });
    } else {
      const dest = operand !== undefined && operand in labels ? labels[operand] : Number(operand);
      if (tokens.length !== 2 || !Number.isInteger(dest) || dest < 0 || dest >= SIZE)
        errors.push({ line, message: `${op} needs an address 00–99 or a defined label.` });
      else word = OPS[op] + dest;
    }
    memory[address] = word;
  }
  return errors.length ? { errors } : { errors, program: { memory, labels, lines, source } };
}
export function machineFor(program: Program, input: number[] = []): Machine {
  return {
    memory: [...program.memory],
    pc: 0,
    acc: 0,
    input: [...input],
    output: [],
    status: 'ready',
    steps: 0,
  };
}
export function decode(word: number): { op: string; address?: number } {
  if (word === 0) return { op: 'HLT' };
  if (word === 901) return { op: 'INP' };
  if (word === 902) return { op: 'OUT' };
  if (!Number.isInteger(word) || word < 0 || word > 999) return { op: 'INVALID' };
  const op = (
    { 1: 'ADD', 2: 'SUB', 3: 'STA', 5: 'LDA', 6: 'BRA', 7: 'BRZ', 8: 'BRP' } as Record<
      number,
      string
    >
  )[Math.floor(word / 100)];
  return op ? { op, address: word % 100 } : { op: 'INVALID' };
}
export function step(original: Machine): Result {
  if (original.status === 'halted' || original.status === 'error') return { machine: original };
  const fail = (error: string): Result => ({ machine: { ...original, status: 'error', error } });
  if (!Number.isInteger(original.pc) || original.pc < 0 || original.pc >= SIZE)
    return fail(`Program counter ${original.pc} is outside 00–99.`);
  const word = original.memory[original.pc];
  const { op, address } = decode(word);
  if (op === 'INVALID')
    return fail(
      `Invalid instruction ${word} at mailbox ${original.pc.toString().padStart(2, '0')}.`,
    );
  if (op === 'INP' && !original.input.length)
    return { machine: { ...original, status: 'waiting' } };
  if (op === 'INP' && (!Number.isInteger(original.input[0]) || Math.abs(original.input[0]) > 999))
    return fail('Input must be an integer from -999 to 999.');
  const next: Machine = {
    ...original,
    memory: [...original.memory],
    input: [...original.input],
    output: [...original.output],
    status: 'ready',
    error: undefined,
    steps: original.steps + 1,
    pc: original.pc + 1,
  };
  const value = address === undefined ? undefined : original.memory[address];
  let jumped = false;
  switch (op) {
    case 'INP':
      next.acc = next.input.shift()!;
      break;
    case 'OUT':
      next.output.push(next.acc);
      break;
    case 'LDA':
      next.acc = value!;
      break;
    case 'STA':
      next.memory[address!] = next.acc;
      break;
    case 'ADD':
      next.acc += value!;
      break;
    case 'SUB':
      next.acc -= value!;
      break;
    case 'BRA':
      jumped = true;
      break;
    case 'BRZ':
      jumped = next.acc === 0;
      break;
    case 'BRP':
      jumped = next.acc >= 0;
      break;
    case 'HLT':
      next.status = 'halted';
      next.pc = original.pc;
      break;
  }
  if (Math.abs(next.acc) > 999)
    return fail(`Arithmetic overflow: ${next.acc} is outside -999–999.`);
  if (jumped) next.pc = address!;
  return {
    machine: next,
    trace: {
      pc: original.pc,
      word,
      op,
      address,
      value: op === 'INP' ? next.acc : op === 'STA' ? original.acc : value,
      before: original.acc,
      after: next.acc,
      jumped,
      target: next.pc,
      output: op === 'OUT' ? original.acc : undefined,
    },
  };
}
export function parseInput(text: string): number[] | undefined {
  if (!text.trim()) return [];
  const parts = text.trim().split(/[\s,，]+/);
  if (parts.some((x) => !/^-?\d+$/.test(x) || Math.abs(Number(x)) > 999)) return undefined;
  return parts.map(Number);
}
export function fmt(value: number): string {
  return value < 0
    ? `−${Math.abs(value).toString().padStart(3, '0')}`
    : value.toString().padStart(3, '0');
}
export function addr(value: number): string {
  return value.toString().padStart(2, '0');
}
