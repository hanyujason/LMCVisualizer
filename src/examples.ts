export const examples = [
  {
    id: 'add',
    en: 'Add two numbers',
    zh: '两数相加',
    input: '12 8',
    source: `; Read two numbers and add them\n        INP\n        STA FIRST\n        INP\n        ADD FIRST\n        OUT\n        HLT\nFIRST   DAT 0`,
  },
  {
    id: 'echo',
    en: 'Input → output',
    zh: '输入与输出',
    input: '42',
    source: `; The smallest conversation with the machine\n        INP\n        OUT\n        HLT`,
  },
  {
    id: 'count',
    en: 'Countdown',
    zh: '倒计时',
    input: '5',
    source: `; Enter a non-negative number\n        INP\nLOOP    OUT\n        BRZ END\n        SUB ONE\n        BRA LOOP\nEND     HLT\nONE     DAT 1`,
  },
  {
    id: 'original',
    en: 'The original JavaFX demo',
    zh: '原版：反复减十',
    input: '',
    source: `; The program from Jason's original JavaFX prototype\n        LDA VALUE\n        SUB TEN\n        STA VALUE\n        BRZ END\n        LDA VALUE\n        OUT\n        BRA 00\n        HLT\nEND     HLT\n        DAT 0\n        DAT 0\n        DAT 0\n        DAT 0\n        DAT 0\nVALUE   DAT 30\nTEN     DAT 10`,
  },
  {
    id: 'max',
    en: 'Choose the larger number',
    zh: '比较两个数',
    input: '17 9',
    source: `        INP\n        STA FIRST\n        INP\n        STA SECOND\n        LDA FIRST\n        SUB SECOND\n        BRP BIGFIRST\n        LDA SECOND\n        BRA PRINT\nBIGFIRST LDA FIRST\nPRINT   OUT\n        HLT\nFIRST   DAT 0\nSECOND  DAT 0`,
  },
];
