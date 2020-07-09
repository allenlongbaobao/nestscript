/**
 * 通过 acorn parser 解析 JS，然后将 JS 转化成 nestscript IR
 */

const acorn = require("acorn")
const walk = require("acorn-walk")
import * as et from "estree"
import { NONAME } from 'dns'
import { stat } from 'fs'

const testCode = `
function main() {
  // var a = 1
  window.fuck = damn.good = 1
  window.console[window.sayHei()](fib(5))
  a = 'good'
  // console.log(a.b.c.d.e.f[g.h.i.j.k[l.m['n']['o']]])
}

/*var name = "Jerry"

const main = () => {
  window.console[window.sayHei()](fib(5))
  for (let i = 0; i < 20; i++) {
    if (i % 2 === 0) {
      console.log(fib(i))
    }
  }
  var c = []
  c['good'] = fib
  Object.keys(c).forEach((k) => {
    console.log(k)
  })
}

function fib(n, a, b, c) {
  if (n < 3) { return 1 }
  let i = 1
  let j = 1
  n = n - 2
  while (n-- > 0) {
    let tmp = i
    let j = i + j
    let i = j
    console.log(a, b, c)
  }
  return j
}*/
`

const enum GlobalsType {
  FUNCTION,
  VARIABLE,
}

interface IFunction {
  name: string,
  body: et.FunctionExpression | et.ArrowFunctionExpression | et.FunctionDeclaration,
}

interface IState {
  tmpVariableName: string,
  globals: any,
  locals: any,
  isGlobal: boolean,
  labelIndex: number,
  functionIndex: number,
  functions: IFunction[],
  codes: string[],
  r0: string,
  r1: string,
  r2: string,
  maxRegister: number,

  // $obj: string,
  // $key: string,
  // $val: string,
}

class Codegen {
  public parse(code: string): et.Program {
    return acorn.parse(code)
  }
}

const codegen = new Codegen()
const ret = codegen.parse(testCode)
const state: IState = {
  tmpVariableName: '',
  isGlobal: true,
  globals: {},
  locals: {},
  labelIndex: 0,
  functionIndex: 0,
  functions: [],
  codes: [],
  r0: '', // 寄存器的名字
  r1: '', // 寄存器的名字
  r2: '', //
  maxRegister: 0,
}
const parseToCode = (ast: any): void => {
  const newFunctionName = (): string => {
    return `__$Function$__${state.functionIndex++}`
  }

  const parseFunc = (node: et.FunctionExpression | et.ArrowFunctionExpression, name?: string): string => {
    const funcName = name || newFunctionName()
    state.globals[funcName] = GlobalsType.FUNCTION
    state.functions.push({ name: funcName, body: node })
    return funcName
  }

  let registerCounter = 0
  let maxRegister = 0

  const newRegister = (): string => {
    const r = `_r${registerCounter++}_`
    maxRegister = Math.max(maxRegister, registerCounter)
    return r
  }
  const freeRegister = (): number => registerCounter--

  const newMemberState = (): [string, string, string] => {
    state.r0 = newRegister()
    state.r1 = newRegister()
    state.r2 = newRegister()
    return [state.r0, state.r1, state.r2]
  }

  const freeMember = (): void => {
    freeRegister()
    freeRegister()
    freeRegister()
  }

  const setIdentifierToRegister = (reg: string, id: string, s: any): void => {
    if (s.globals[id] || s.locals[id]) {
      s.codes.push(`MOV ${reg} ${id}`)
    } else {
      s.codes.push(`MOV_CTX ${reg} "${id}"`)
    }
  }

  walk.recursive(ast, state, {
    VariableDeclaration: (node: et.VariableDeclaration, s: any, c: any): void => {
      // console.log("VARIABLE...", node)
      node.declarations.forEach((n: any): void => c(n, state))
    },

    VariableDeclarator: (node: et.VariableDeclarator, s: any, c: any): void => {
      // console.log(node)
      let reg
      if (node.id.type === 'Identifier') {
        if (node.init?.type === 'FunctionExpression' || node.init?.type === 'ArrowFunctionExpression') {
          parseFunc(node.init, state.isGlobal ? node.id.name : '')
          // console.log("--->", funcName)
          return
        }
        if (state.isGlobal) {
          s.codes.push(`GLOBAL ${node.id.name}`)
          s.globals[node.id.name] = GlobalsType.VARIABLE
        } else {
          s.codes.push(`VAR ${node.id.name}`)
          s.locals[node.id.name] = GlobalsType.VARIABLE
        }
        reg = node.id.name
      } else {
        // TODO
      }
      s.r0 = reg
      c(node.init, s)
    },

    FunctionDeclaration(node: et.FunctionDeclaration, s: any, c: any): any {
      state.functions.push({ name: node.id!.name, body: node })
    },

    CallExpression(node: et.CallExpression, s: any, c: any): any {
      const retReg = s.r0
      for (const arg of node.arguments) {
        const reg = s.r0 = newRegister()
        c(arg, s)
        // console.log('---->>', reg, node.callee)
        s.codes.push(`PUSH ${reg}`)
        freeRegister()
      }

      if (node.callee.type === "MemberExpression") {
        const [_, objReg, keyReg] = newMemberState()
        c(node.callee, s)
        s.codes.push(`CALL_VAR ${objReg} ${keyReg} ${node.arguments.length}`)
        freeMember()
      } else if (node.callee.type === "Identifier") {
        s.codes.push(`CALL ${node.callee.name} ${node.arguments.length}`)
      }
      if (retReg) {
        s.codes.push(`MOV ${retReg} RET`)
      }
    },

    Literal: (node: et.Literal, s: any): void => {
      s.codes.push(`MOV ${s.r0} ${node.raw}`)
    },

    ArrowFunctionExpression(node: et.ArrowFunctionExpression, s: any, c: any): any {
      parseFunc(node)
    },

    BlockStatement(node: et.BlockStatement, s: any, c: any): void {
      node.body.forEach((n: any): void => c(n, s))
    },

    MemberExpression(node: et.MemberExpression, s: any, c: any): void {
      const teardowns: any = []
      let valReg = s.r0
      let objReg = s.r1
      let keyReg = s.r2

      if (!valReg) {
        valReg = newRegister()
        teardowns.push(freeRegister)
      }

      if (!objReg) {
        objReg = newRegister()
        teardowns.push(freeRegister)
      }

      if (!keyReg) {
        keyReg = newRegister()
        teardowns.push(freeRegister)
      }

      if (node.object.type === 'MemberExpression') {
        s.r0 = objReg
        s.r1 = newRegister()
        // newMemberState()
        c(node.object, s)
        // freeMember()
        freeRegister()
      } else if (node.object.type === 'Identifier') {
        setIdentifierToRegister(objReg, node.object.name, s)
      } else {
        s.r0 = objReg
        c(node.object, s)
      }

      if (node.property.type === 'MemberExpression') {
        s.r0 = keyReg
        s.r2 = newRegister()
        // newMemberState()
        c(node.property, s)
        // freeMember()
        freeRegister()
      } else if (node.property.type === 'Identifier') {
        // a.b.c.d
        if (node.computed) {
          s.codes.push(`MOV ${keyReg} ${node.property.name}`)
        } else {
          s.codes.push(`MOV ${keyReg} "${node.property.name}"`)
        }
      } else {
        s.r0 = keyReg
        c(node.property, s)
      }

      s.codes.push(`MOV_PROP ${valReg} ${objReg} ${keyReg}`)
      teardowns.forEach((t: any): void => t())
    },

    AssignmentExpression(node: et.AssignmentExpression, s: any, c: any): any {
      const left = node.left
      const right = node.right
      const teardowns: any[] = []

      let rightReg
      if (right.type === 'Identifier') {
        rightReg = right.name
      } else {
        s.r0 = rightReg = newRegister()
        c(right, s)
        teardowns.push(freeRegister)
      }

      if (left.type === 'MemberExpression') {
        s.r0 = newRegister()
        const objReg = s.r1 = newRegister()
        const keyReg = s.r2 = newRegister()
        c(left, s)
        teardowns.push(freeRegister, freeRegister, freeRegister)
        s.codes.push(`SET_KEY ${objReg} ${keyReg} ${rightReg}`)
      } else if (left.type === 'Identifier') {
        s.codes.push(`MOV ${left.name} ${rightReg}`)
      } else {
        throw new Error('Unprocessed assignment')
      }

      teardowns.forEach((t: any): void => t())
    },

    // ExpressionStatement(node: et.ExpressionStatement, s: any, c: any): void {
    //   console.log('=-->', node.expression)
    // },
  })

  state.maxRegister = maxRegister
}

const getFunctionDecleration = (func: IFunction): string => {
  const name = func.name
  const params = func.body.params.map((p: any): string => p.name).join(', ')
  return `func ${name}(${params}) {`
}

parseToCode(ret)

while (state.functions.length > 0) {
  state.isGlobal = false
  state.maxRegister = 0
  const funcAst = state.functions.shift()
  state.locals = {}
  // console.log(funcAst?.body.body, '-->')
  parseToCode(funcAst?.body.body)
  const registersCodes: string[] = []
  for (let i = 0; i < state.maxRegister; i++) {
    registersCodes.push(`VAR _r${i}_`)
  }
  state.codes = [getFunctionDecleration(funcAst!), ...registersCodes, ...state.codes, 'RET', '}']
  // state.codes.push('}')
}

console.log(state)
