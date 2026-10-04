import { addr, fmt, type Machine, type Trace } from './core';
type Lang = 'en' | 'zh';
export type Pending = { machine: Machine; trace: Trace; elapsed: number };
export const DURATION = 3200;
export function explain(trace: Trace, lang: Lang): string {
  const { op, address, before, after, value, jumped, target, output } = trace;
  const a = addr(address ?? 0);
  const zh = lang === 'zh';
  switch (op) {
    case 'INP':
      return zh
        ? `从输入篮取出 ${value}，放入累加器。`
        : `Take ${value} from the input basket and place it in the accumulator.`;
    case 'OUT':
      return zh
        ? `将累加器中的 ${output} 复制到输出篮。`
        : `Copy ${output} from the accumulator to the output basket.`;
    case 'LDA':
      return zh
        ? `读取邮箱 ${a} 的值 ${value}，累加器更新为 ${after}。`
        : `Read ${value} from mailbox ${a}. The accumulator becomes ${after}.`;
    case 'STA':
      return zh
        ? `把累加器中的 ${before} 保存到邮箱 ${a}。`
        : `Store the accumulator's ${before} in mailbox ${a}.`;
    case 'ADD':
      return zh
        ? `加上邮箱 ${a} 的值 ${value}：${before} + ${value} = ${after}。`
        : `Add mailbox ${a}: ${before} + (${value}) = ${after}.`;
    case 'SUB':
      return zh
        ? `减去邮箱 ${a} 的值 ${value}：${before} − ${value} = ${after}。`
        : `Subtract mailbox ${a}: ${before} − (${value}) = ${after}.`;
    case 'BRA':
      return zh
        ? `无条件跳转，下一条指令在邮箱 ${addr(target)}。`
        : `Branch unconditionally. The next instruction is at mailbox ${addr(target)}.`;
    case 'BRZ':
      return zh
        ? `累加器 ${before} ${jumped ? '等于' : '不等于'}零，${jumped ? `跳到 ${addr(target)}` : '继续下一条'}。`
        : `The accumulator is ${before === 0 ? '' : 'not '}zero. ${jumped ? `Branch to ${addr(target)}.` : 'Continue to the next instruction.'}`;
    case 'BRP':
      return zh
        ? `累加器 ${before} ${jumped ? '非负' : '为负'}，${jumped ? `跳到 ${addr(target)}` : '继续下一条'}。`
        : `The accumulator is ${before >= 0 ? 'nonnegative' : 'negative'}. ${jumped ? `Branch to ${addr(target)}.` : 'Continue to the next instruction.'}`;
    default:
      return zh
        ? '遇到 HLT，程序停止。可以重置后再次运行。'
        : 'HLT stops the machine. Reset to run the program again.';
  }
}
function point(trace: Trace, phase: number): [number, number] {
  // Fetch, decode, collect operand, deliver/execute, return. Dock beside each unit.
  if (phase === 0) return [425, 180];
  if (phase === 1 || phase === 4) return [315, 305];
  if (phase === 2) {
    if (trace.op === 'INP') return [100, 205];
    if (['STA', 'OUT'].includes(trace.op)) return [315, 180];
    if (['LDA', 'ADD', 'SUB'].includes(trace.op)) return [425, 180];
    return [420, 315];
  }
  if (trace.op === 'OUT') return [190, 310];
  if (trace.op === 'STA') return [425, 180];
  if (['BRA', 'BRZ', 'BRP'].includes(trace.op)) return [420, 315];
  if (trace.op === 'HLT') return [315, 305];
  return [315, 180];
}
export function Diagram({
  machine,
  pending,
  last,
  lang,
}: {
  machine: Machine;
  pending: Pending | null;
  last?: Trace;
  lang: Lang;
}) {
  const t = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const trace = pending?.trace ?? last;
  const progress = pending ? pending.elapsed / DURATION : 0;
  const phase = Math.min(4, Math.floor(progress * 5));
  const home: [number, number] = [315, 305];
  let location = home;
  if (pending) {
    const from = phase === 0 ? home : point(pending.trace, phase - 1);
    const to = point(pending.trace, phase);
    const fraction = Math.min(1, (progress * 5 - phase) * 1.5);
    const ease = fraction * fraction * (3 - 2 * fraction);
    location = [from[0] + (to[0] - from[0]) * ease, from[1] + (to[1] - from[1]) * ease];
  }
  return (
    <svg
      className="machine-svg"
      viewBox="0 0 650 420"
      role="img"
      aria-label={t('Animated Little Man Computer', '小人计算机动画')}
    >
      <defs>
        <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#d6ddd9" />
        </pattern>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#bbc9c6" />
        </marker>
      </defs>
      <rect x="0" y="0" width="650" height="420" rx="16" fill="url(#dots)" />
      <path
        d="M155 130H245 M385 100H470 M245 330H155"
        stroke="#bbc9c6"
        strokeWidth="2"
        strokeDasharray="5 7"
        markerEnd="url(#arrow)"
        fill="none"
      />
      <g>
        <rect x="30" y="45" width="135" height="110" rx="14" fill="#e4eee7" stroke="#c4d7ca" />
        <text x="48" y="70" className="svg-label">
          {t('INPUT', '输入篮')}
        </text>
        <text x="98" y="120" textAnchor="middle" className="svg-value">
          {machine.input.length ? fmt(machine.input[0]) : '—'}
        </text>
        <text x="98" y="144" textAnchor="middle" className="svg-small">
          {t(`${machine.input.length} queued`, `剩余 ${machine.input.length} 个`)}
        </text>
      </g>
      <g>
        <rect x="240" y="35" width="150" height="90" rx="14" fill="#fff" stroke="#c4d7ca" />
        <text x="315" y="60" textAnchor="middle" className="svg-label">
          {t('ACCUMULATOR', '累加器')}
        </text>
        <text x="315" y="101" textAnchor="middle" className="svg-value">
          {fmt(machine.acc)}
        </text>
      </g>
      <g>
        <rect x="465" y="45" width="155" height="130" rx="14" fill="#fff" stroke="#c4d7ca" />
        <text x="543" y="70" textAnchor="middle" className="svg-label">
          {t('MAILBOX', '邮箱')}
        </text>
        <text x="543" y="112" textAnchor="middle" className="svg-value">
          {addr(
            pending && phase >= 2 && trace?.address !== undefined
              ? trace.address
              : (trace?.pc ?? machine.pc),
          )}
        </text>
        <text x="543" y="146" textAnchor="middle" className="svg-small">
          {t('100 memory locations', '100 个存储单元')}
        </text>
      </g>
      <g>
        <rect x="30" y="260" width="135" height="80" rx="14" fill="#f9ecd7" stroke="#e4cfaa" />
        <text x="48" y="285" className="svg-label">
          {t('OUTPUT', '输出篮')}
        </text>
        <text x="98" y="321" textAnchor="middle" className="svg-value">
          {machine.output.length ? fmt(machine.output.at(-1)!) : '—'}
        </text>
      </g>
      <g>
        <rect x="455" y="280" width="165" height="95" rx="14" fill="#e8edf3" />
        <text x="537" y="306" textAnchor="middle" className="svg-label">
          {t('PROGRAM COUNTER', '程序计数器')}
        </text>
        <text x="537" y="353" textAnchor="middle" className="svg-value">
          {addr(machine.pc)}
        </text>
      </g>
      <g transform={`translate(${location[0]},${location[1]})`}>
        <ellipse cx="0" cy="53" rx="25" ry="6" fill="#20394d" opacity=".12" />
        <path d="M-12 12Q0 2 12 12L15 32H-15Z" fill="#e9b65e" stroke="#20394d" strokeWidth="2.5" />
        <path
          d="M-8 33L-13 49M8 33L13 49M-12 15L-25 26M12 15L25 26"
          stroke="#20394d"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="0" cy="-8" r="19" fill="#fff4df" stroke="#20394d" strokeWidth="2.5" />
        <path d="M-18-13Q-16-34 3-28Q18-25 18-13" fill="#20394d" />
        <circle cx="-6" cy="-9" r="2" fill="#20394d" />
        <circle cx="6" cy="-9" r="2" fill="#20394d" />
        <path
          d="M-5-1Q0 3 5-1"
          fill="none"
          stroke="#20394d"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {pending && phase < 4 && (
          <g>
            <rect x="-30" y="-64" width="60" height="25" rx="8" fill="#20394d" />
            <text
              x="0"
              y="-47"
              textAnchor="middle"
              fill="white"
              fontSize="13"
              fontFamily="monospace"
            >
              {phase < 2
                ? fmt(pending.trace.word)
                : pending.trace.op === 'OUT'
                  ? fmt(pending.trace.before)
                  : pending.trace.value !== undefined
                    ? fmt(pending.trace.value)
                    : pending.trace.op}
            </text>
          </g>
        )}
      </g>
      <text x="315" y="399" textAnchor="middle" className="svg-small">
        {pending
          ? [
              t('Fetch the instruction', '读取指令'),
              t('Decode the instruction', '解释指令'),
              t('Collect the value', '获取数据或目标'),
              t('Deliver & execute', '交付数据并执行'),
              t('Return & update', '返回并更新状态'),
            ][phase]
          : t('Every instruction has a story.', '每条指令，都有一个过程。')}
      </text>
    </svg>
  );
}
