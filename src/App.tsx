import { useEffect, useRef, useState } from 'react';
import {
  addr,
  assemble,
  decode,
  fmt,
  machineFor,
  parseInput,
  step,
  type Diagnostic,
  type Machine,
  type Program,
  type Trace,
} from './core';
import { examples } from './examples';

type Lang = 'en' | 'zh';
import { Diagram, explain, DURATION, type Pending } from './animation';
const STORE = 'lmc-visualizer-v1';
function saved(): { source?: string; lang?: Lang } {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return {
      source: typeof value?.source === 'string' ? value.source : undefined,
      lang: value?.lang === 'zh' ? 'zh' : 'en',
    };
  } catch {
    return {};
  }
}

export default function App() {
  const initial = useRef(saved()).current;
  const [lang, setLang] = useState<Lang>(initial.lang === 'zh' ? 'zh' : 'en');
  const t = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const [source, setSource] = useState(initial.source ?? examples[0].source);
  const [program, setProgram] = useState<Program>(
    () =>
      assemble(initial.source ?? examples[0].source).program ??
      assemble(examples[0].source).program!,
  );
  const [machine, setMachine] = useState<Machine>(() => machineFor(program));
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const initialExample = examples.find((e) => e.source === initial.source) ?? examples[0];
  const custom = initial.source !== undefined && !examples.some((e) => e.source === initial.source);
  const [example, setExample] = useState(custom ? 'custom' : initialExample.id);
  const [input, setInput] = useState(custom ? '' : initialExample.input);
  const [inputError, setInputError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [playing, setPlaying] = useState(false);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [animated, setAnimated] = useState(true);
  const [history, setHistory] = useState<Trace[]>([]);
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [classroom, setClassroom] = useState(false);
  const [selected, setSelected] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lineGutter = useRef<HTMLDivElement>(null);
  const sessionStart = useRef(0);
  const dirty = program.source !== source;
  const last = history.at(-1);
  const trace = pending?.trace ?? last;
  const busy = pending !== null || auto;
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ source, lang }));
    } catch {
      /* Export remains available when local storage is disabled. */
    }
  }, [source, lang]);
  const commit = (next: Machine, entry: Trace) => {
    setMachine(next);
    setHistory((h) => [...h.slice(-99), entry]);
    setPending(null);
    if (next.status === 'halted' || next.status === 'error') {
      setPlaying(false);
      setAuto(false);
    }
  };
  const execute = () => {
    if (pending || dirty) return;
    if (machine.steps - sessionStart.current >= 1000) {
      setAuto(false);
      setPlaying(false);
      setNotice(
        t(
          'Paused after 1,000 instructions. Check for a loop, or press Run to continue.',
          '执行 1000 条后自动暂停，请检查循环；也可点击运行继续。',
        ),
      );
      return;
    }
    const result = step(machine);
    if (!result.trace) {
      setMachine(result.machine);
      setAuto(false);
      setPlaying(false);
      return;
    }
    if (animated) setPending({ machine: result.machine, trace: result.trace, elapsed: 0 });
    else commit(result.machine, result.trace);
  };
  useEffect(() => {
    if (!pending || !playing) return;
    const timer = window.setTimeout(() => {
      const elapsed = pending.elapsed + 40 * speed;
      if (elapsed >= DURATION || !animated) {
        commit(pending.machine, pending.trace);
        if (!auto) setPlaying(false);
      } else setPending({ ...pending, elapsed });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [pending, playing, speed, animated, auto]);
  useEffect(() => {
    if (!auto || !playing || pending || machine.status !== 'ready') return;
    const timer = window.setTimeout(execute, animated ? 100 : 15);
    return () => window.clearTimeout(timer);
  }, [auto, playing, pending, machine, animated, source]);
  useEffect(() => {
    if (!help) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [help]);
  const stop = () => {
    setPending(null);
    setPlaying(false);
    setAuto(false);
  };
  const load = (text = source) => {
    stop();
    const a = assemble(text);
    setErrors(a.errors);
    if (a.program) {
      setProgram(a.program);
      setMachine(machineFor(a.program));
      setHistory([]);
      setSelected(0);
      setNotice(
        t(
          'Program assembled. Add inputs, then step or run.',
          '程序已装载。添加输入后，可以单步或运行。',
        ),
      );
    }
  };
  const reset = () => {
    stop();
    setMachine(machineFor(program));
    setHistory([]);
    setNotice('');
    sessionStart.current = 0;
  };
  const choose = (id: string) => {
    const chosen = examples.find((e) => e.id === id)!;
    setExample(id);
    setSource(chosen.source);
    setInput(chosen.input);
    setInputError(false);
    load(chosen.source);
  };
  const addInput = () => {
    const values = parseInput(input);
    if (!values || !values.length) {
      setInputError(true);
      return;
    }
    setMachine((m) => ({
      ...m,
      input: [...m.input, ...values],
      status: m.status === 'waiting' ? 'ready' : m.status,
    }));
    setInput('');
    setInputError(false);
    setNotice('');
  };
  const run = () => {
    sessionStart.current = machine.steps;
    setNotice('');
    setAuto(true);
    setPlaying(true);
  };
  const doStep = () => {
    sessionStart.current = machine.steps;
    setNotice('');
    setAuto(false);
    setPlaying(true);
    execute();
    if (!animated) setPlaying(false);
  };
  const saveFile = () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.lmc';
    a.click();
    // Let the browser begin the download before releasing the blob URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const activePC = pending?.trace.pc ?? machine.pc;
  const selectedWord = machine.memory[selected];
  const selectedInstruction = decode(selectedWord);
  const ready =
    !dirty &&
    machine.status !== 'halted' &&
    machine.status !== 'error' &&
    machine.status !== 'waiting';
  const status = pending
    ? playing
      ? t('In motion', '动画执行中')
      : t('Paused', '已暂停')
    : machine.status === 'halted'
      ? t('Halted', '已停止')
      : machine.status === 'waiting'
        ? t('Needs input', '等待输入')
        : machine.status === 'error'
          ? t('Error', '执行错误')
          : auto
            ? t('Running', '运行中')
            : t('Ready', '就绪');
  return (
    <div className={`app ${classroom ? 'classroom' : ''}`}>
      <header className="header">
        <div className="brand">
          <span className="brand-symbol">↳</span>
          <div>
            <h1>
              LMC <span>LAB</span>
            </h1>
            <p>Little Man Computer</p>
          </div>
        </div>
        <nav>
          <span className="edition">
            {t('A small machine. A big idea.', '小小计算机，理解大原理。')}
          </span>
          <button onClick={() => setClassroom(!classroom)} aria-pressed={classroom}>
            {classroom ? t('Exit classroom', '退出课堂模式') : t('Classroom view', '课堂模式')}
          </button>
          <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {lang === 'en' ? '中文' : 'English'}
          </button>
          <button onClick={() => setHelp(true)}>
            {t('How it works', '使用指南')} <span>↗</span>
          </button>
        </nav>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">
              {t('AN INTERACTIVE COMPUTER SCIENCE WORKBENCH', '交互式计算机原理实验台')}
            </p>
            <h2>{t('Make the invisible visible.', '看见计算机的每一步。')}</h2>
            <p>
              {t(
                'Write a program. Follow the little man. See how a computer thinks.',
                '写下程序，跟随小人，观察指令如何改变机器。',
              )}
            </p>
          </div>
          <div className={`status ${machine.status}`}>
            <span className="status-dot" />
            {status}
          </div>
        </div>
        <div className="workspace">
          <section className="panel editor-panel">
            <div className="panel-title">
              <span className="section-number">01</span>
              <h3>{t('The program', '编写程序')}</h3>
              <span className="small-tag">LMC ASM</span>
            </div>
            <label className="field-label" htmlFor="examples">
              {t('START WITH AN EXAMPLE', '从示例开始')}
            </label>
            <select
              id="examples"
              value={example}
              onChange={(e) => choose(e.target.value)}
              disabled={busy}
            >
              {example === 'custom' && (
                <option value="custom">{t('Custom program', '自定义程序')}</option>
              )}
              {examples.map((e) => (
                <option key={e.id} value={e.id}>
                  {lang === 'en' ? e.en : e.zh}
                </option>
              ))}
            </select>
            <div className="editor">
              <div className="line-gutter" ref={lineGutter}>
                {source.split('\n').map((_, i) => (
                  <div
                    key={i}
                    className={!dirty && program.lines[activePC] === i + 1 ? 'current-line' : ''}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                ref={textarea}
                aria-label={t('LMC assembly program', 'LMC 汇编程序')}
                value={source}
                disabled={busy}
                spellCheck={false}
                onScroll={(e) => {
                  if (lineGutter.current) lineGutter.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onChange={(e) => {
                  setSource(e.target.value);
                  setExample('custom');
                  setErrors([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart,
                      end = e.currentTarget.selectionEnd;
                    setSource(source.slice(0, start) + '    ' + source.slice(end));
                    window.requestAnimationFrame(() =>
                      textarea.current?.setSelectionRange(start + 4, start + 4),
                    );
                  }
                }}
              />
            </div>
            <button className="primary load-button" onClick={() => load()} disabled={busy}>
              {t('Assemble & load', '编译并装载')} <span>→</span>
            </button>
            <div className="editor-tools">
              <button onClick={saveFile}>{t('↓ Export', '↓ 导出')}</button>
              <button disabled={busy} onClick={() => file.current?.click()}>
                {t('↑ Import', '↑ 导入')}
              </button>
              <span>{t('Saved locally', '自动本地保存')}</span>
              <input
                ref={file}
                type="file"
                accept=".lmc,.txt,.asm"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 100_000) {
                      setNotice(
                        t(
                          'Please use a program file smaller than 100 KB.',
                          '请导入小于 100 KB 的程序文件。',
                        ),
                      );
                    } else {
                      setSource(await f.text());
                      setExample('custom');
                      setErrors([]);
                    }
                  }
                  e.target.value = '';
                }}
              />
            </div>
            {dirty && (
              <p className="hint warning">
                {t('Program changed. Assemble before running.', '程序已修改，请重新编译装载。')}
              </p>
            )}
            {!!errors.length && (
              <ul className="diagnostics" role="alert">
                {errors.map((e, i) => (
                  <li key={i}>
                    <strong>
                      {t('Line', '第')} {e.line}
                      {lang === 'zh' ? ' 行' : ''}:
                    </strong>{' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="instruction-tip">
              <span>✦</span>
              <p>
                {t(
                  'Labels name a mailbox. DAT reserves a value. Comments begin with ; or //.',
                  '标签为邮箱命名；DAT 定义数据。使用 ; 或 // 添加注释。',
                )}
              </p>
            </div>
          </section>
          <section className="panel execution-panel">
            <div className="panel-title">
              <span className="section-number">02</span>
              <h3>{t('Inside the machine', '观察机器')}</h3>
              <span className="small-tag">{t('LIVE', '实时')}</span>
            </div>
            <div className="registers">
              <div>
                <span>{t('PROGRAM COUNTER', '程序计数器')}</span>
                <strong>{addr(machine.pc)}</strong>
                <small>{t('next instruction', '下一条指令')}</small>
              </div>
              <div>
                <span>{t('ACCUMULATOR', '累加器')}</span>
                <strong>{fmt(machine.acc)}</strong>
                <small>{t('working value', '当前计算值')}</small>
              </div>
              <div>
                <span>{t('INSTRUCTION', '当前指令')}</span>
                <strong className="instruction-word">
                  {pending ? pending.trace.op : decode(machine.memory[machine.pc] ?? -1).op}
                </strong>
                <small>{fmt(pending?.trace.word ?? machine.memory[machine.pc] ?? 0)}</small>
              </div>
            </div>
            <Diagram machine={machine} pending={pending} last={last} lang={lang} />
            <div className="narration" aria-live="polite">
              <div className="narration-icon">{trace ? '↳' : '✦'}</div>
              <div>
                <span className="field-label">{t('WHAT IS HAPPENING?', '这一刻发生了什么？')}</span>
                <p>
                  {machine.error ??
                    (machine.status === 'waiting'
                      ? t(
                          'INP is waiting. Add a number to the input basket, then continue.',
                          'INP 正在等待输入。添加数字后，再继续执行。',
                        )
                      : trace
                        ? explain(trace, lang)
                        : t(
                            'Your machine is ready. Queue the inputs, then try one step.',
                            '机器已就绪。添加输入，然后试试单步执行。',
                          ))}
                </p>
              </div>
            </div>
            <div className="controls">
              <button className="primary" disabled={!ready && !pending} onClick={run}>
                {pending && !playing ? t('▶ Resume', '▶ 继续') : t('▶ Run', '▶ 运行')}
              </button>
              <button disabled={!ready || !!pending || auto} onClick={doStep}>
                {t('↳ Step', '↳ 单步')}
              </button>
              <button
                disabled={!playing || (!pending && !auto)}
                onClick={() => {
                  setPlaying(false);
                  setAuto(false);
                }}
              >
                {t('Ⅱ Pause', 'Ⅱ 暂停')}
              </button>
              <button onClick={reset}>{t('↺ Reset', '↺ 重置')}</button>
            </div>
            <div className="playback">
              <label>
                <input
                  type="checkbox"
                  checked={animated}
                  onChange={(e) => setAnimated(e.target.checked)}
                />
                {t('Animate', '播放动画')}
              </label>
              <label htmlFor="speed">{t('Speed', '速度')}</label>
              <input
                id="speed"
                type="range"
                min="0.5"
                max="4"
                step="0.5"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <output>{speed}×</output>
              <span>
                {machine.steps} {t('steps', '步')}
              </span>
            </div>
            <div className="io">
              <div>
                <div className="io-title">
                  <h4>{t('Input basket', '输入篮')}</h4>
                  <span>INP</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addInput();
                  }}
                >
                  <input
                    aria-label={t('Input numbers', '输入数字')}
                    placeholder={t('e.g. 12 8', '例如 12 8')}
                    value={input}
                    disabled={
                      !!pending || machine.status === 'halted' || machine.status === 'error'
                    }
                    onChange={(e) => {
                      setInput(e.target.value);
                      setInputError(false);
                    }}
                  />
                  <button
                    disabled={
                      !!pending || machine.status === 'halted' || machine.status === 'error'
                    }
                    type="submit"
                    aria-label={t('Queue inputs', '添加输入')}
                  >
                    +
                  </button>
                </form>
                {inputError && (
                  <small className="error-text" role="alert">
                    {t('Use whole numbers from -999 to 999.', '请输入 −999 到 999 的整数。')}
                  </small>
                )}
                <div className="tokens">
                  {machine.input.length ? (
                    machine.input.map((n, i) => <span key={i}>{n}</span>)
                  ) : (
                    <small>{t('The queue is empty.', '暂无待输入数字。')}</small>
                  )}
                </div>
              </div>
              <div>
                <div className="io-title">
                  <h4>{t('Output basket', '输出篮')}</h4>
                  <span>OUT</span>
                </div>
                <div className="tokens output-tokens" aria-live="polite">
                  {machine.output.length ? (
                    machine.output.map((n, i) => <span key={i}>{n}</span>)
                  ) : (
                    <small>{t('Results will appear here.', '结果会显示在这里。')}</small>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="panel memory-panel">
            <div className="panel-title">
              <span className="section-number">03</span>
              <h3>{t('The mailboxes', '邮箱内存')}</h3>
              <span className="small-tag">00—99</span>
            </div>
            <p className="memory-caption">
              {t(
                'Instructions and data share the same memory.',
                '指令与数据，存放在同一片内存中。',
              )}
            </p>
            <div className="memory-legend">
              <span>
                <i className="legend-current" />
                {t('Instruction', '指令')}
              </span>
              <span>
                <i className="legend-data" />
                {t('Access', '读写')}
              </span>
            </div>
            <div className="memory-grid">
              {machine.memory.map((word, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  aria-label={`${t('Mailbox', '邮箱')} ${addr(i)}: ${word}`}
                  aria-pressed={selected === i}
                  className={`${activePC === i ? 'active-cell' : ''} ${pending?.trace.address === i ? 'access-cell' : ''} ${selected === i ? 'selected-cell' : ''}`}
                >
                  <span>{addr(i)}</span>
                  <strong>{fmt(word)}</strong>
                </button>
              ))}
            </div>
            <div className="memory-inspector">
              <span>
                {t('MAILBOX', '邮箱')} {addr(selected)}
              </span>
              <strong>{fmt(selectedWord)}</strong>
              <small>
                {selectedInstruction.op === 'INVALID'
                  ? 'DAT'
                  : `${selectedInstruction.op}${selectedInstruction.address === undefined ? '' : ' ' + addr(selectedInstruction.address)}`}
              </small>
            </div>
          </section>
        </div>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label={t('Dismiss notice', '关闭提示')} onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        <section className="trace-panel">
          <div className="trace-heading">
            <div>
              <span className="eyebrow">{t('FOLLOW THE LOGIC', '跟随执行过程')}</span>
              <h3>{t('Execution journal', '执行记录')}</h3>
            </div>
            <span>{t('Most recent 100 instructions', '保留最近 100 条指令')}</span>
          </div>
          {history.length ? (
            <div className="trace-list">
              {history
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div key={history.length - i} className="trace-entry">
                    <span className="trace-address">{addr(entry.pc)}</span>
                    <code>
                      {entry.op}
                      {entry.address === undefined ? '' : ' ' + addr(entry.address)}
                    </code>
                    <p>{explain(entry, lang)}</p>
                    <strong>
                      {fmt(entry.before)} <span>→</span> {fmt(entry.after)}
                    </strong>
                  </div>
                ))}
            </div>
          ) : (
            <p className="empty-journal">
              {t(
                'Take your first step. Every instruction will leave a trace here.',
                '执行第一步后，每条指令的变化都会记录在这里。',
              )}
            </p>
          )}
        </section>
      </main>
      <footer>
        <span>
          LMC LAB ·{' '}
          {t('From a JavaFX idea to a browser workbench.', '从 JavaFX 原型，到浏览器教学实验台。')}
        </span>
        <span>{t('Local-first · No account needed', '本地运行 · 无需账号')}</span>
      </footer>
      {help && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelp(false);
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <button
              className="modal-close"
              autoFocus
              onClick={() => setHelp(false)}
              aria-label={t('Close guide', '关闭指南')}
            >
              ×
            </button>
            <p className="eyebrow">LITTLE MAN COMPUTER</p>
            <h2 id="help-title">{t('A computer you can follow.', '一步一步，理解计算机。')}</h2>
            <p>
              {t(
                'Pick an example, assemble it, add its inputs with +, then Step or Run. Reset restores the loaded program and clears inputs and outputs. Pause freezes the current animation; Resume continues it.',
                '选择示例并编译装载，用 + 添加输入，然后单步或运行。重置会恢复装载时的程序并清空输入输出。暂停会冻结当前动画，继续可从暂停处接着运行。',
              )}
            </p>
            <table>
              <thead>
                <tr>
                  <th>{t('Instruction', '指令')}</th>
                  <th>{t('Meaning', '含义')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['INP / OUT', 'Read input / copy accumulator to output', '读取输入 / 输出累加器'],
                  ['LDA / STA', 'Load from / store to a mailbox', '从邮箱读取 / 写入邮箱'],
                  ['ADD / SUB', 'Add / subtract a mailbox value', '加上 / 减去邮箱的值'],
                  ['BRA', 'Unconditional branch', '无条件跳转'],
                  ['BRZ / BRP', 'Branch if zero / nonnegative', '为零 / 非负时跳转'],
                  ['HLT / DAT', 'Halt / reserve a data value', '停止 / 定义数据'],
                ].map(([op, en, zh]) => (
                  <tr key={op}>
                    <td>
                      <code>{op}</code>
                    </td>
                    <td>{t(en, zh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{t('Our teaching rules', '本版教学规则')}</h3>
            <p>
              {t(
                'There are 100 mailboxes, addressed 00–99. Values and inputs are signed integers from -999 to 999. Arithmetic overflow stops with an error; it does not wrap. BRP includes zero. Negative values can be stored but cannot execute as instructions. HLT leaves PC at the halt address. Missing input waits without advancing PC.',
                '共有 100 个邮箱，地址 00–99。数据和输入采用 −999 至 999 的有符号整数；运算溢出会停止报错，不会回绕。BRP 包含零。负数可以存储，但不能作为指令执行。HLT 保持 PC 在停止地址。缺少输入时等待，PC 不前进。',
              )}
            </p>
            <p>
              {t(
                'LMC conventions vary between courses. This signed teaching model is explicit; it does not model a decimal overflow flag. Programs stay in your browser. Export a file for a backup.',
                '不同课程的 LMC 规则可能不同。本版明确采用有符号教学模型，不模拟十进制溢出标志。程序保存在当前浏览器中，可以导出文件备份。',
              )}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
