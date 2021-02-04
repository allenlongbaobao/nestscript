class VirtualMachine {
  public codes: string[][]
  public stack: []
  public ip: number
  public sp: number
  public fp: number
  public symbols: {}

  constructor(codes: string[][]) {
    this.codes = codes
    this.stack = [] // 内存
    this.ip = 0 // 当前指令地址
    this.sp = 0 // 当前内存指针
    this.fp = 0 // 函数栈基地址
    this.symbols = {} // 给变量分配在 stack 上的地址，比如 a: 0
  }

  public run() {
    while (true) {
      const cmd = this.codes[this.ip]
      const operator = cmd[0] // 取操作符
      switch(operator) {
        case 'VAR': {
          // 变量定义，将其定义到 symbol 中
          const [_, name, value = null] = cmd
          this.symbols[name] = value
          this.ip++ // 顺序执行下一步

          break
        }
        case 'MOV': {
          // 变量赋值
          const [_, name, value] = cmd
          if (this.symbols[value]) {
            // value 是一个变量
            this.symbols[name] = this.symbols[value]
          } else {
            // value 是值
            this.symbols[name] = value
          }
          this.ip++

          break
        }
        
        case 'ADD': {
          // TODO:
          break
        }

        case 'SUB': {
          // TODO:
          break
        }

        case 'CALL': {
          // TODO:
          break
        }

        case 'JMP': {
          // TODO:
          break
        }

      
      }
    }

  }
}