// const b = new ArrayBuffer(16)
// const a = new Float64Array(b)
// a[0] = -0.001
// a[1] = -0.002
// const c = new Float64Array(b)
// console.log(a, b, c[0])

// const d = new Float64Array(b.slice(8))
// a[1] = 0.03
// console.log(c, d[0])

export const concatBuffer = (buffer1: ArrayBuffer, buffer2: ArrayBuffer): ArrayBuffer => {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength)
  tmp.set(new Uint8Array(buffer1), 0)
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength)
  return tmp.buffer
}

/**
 * Converts an ArrayBuffer to a String.
 *
 * @param buffer - Buffer to convert.
 * @returns String.
 */
export const arrayBufferToString = (buffer: ArrayBuffer): string => {
  return String.fromCharCode.apply(null, Array.from(new Uint16Array(buffer)))
}

/**
 * Converts a String to an ArrayBuffer.
 *
 * @param str - String to convert.
 * @returns ArrayBuffer.
 */
export const stringToArrayBuffer = (str: string): ArrayBuffer => {
  const stringLength = str.length
  const buffer = new ArrayBuffer(stringLength * 2)
  const bufferView = new Uint16Array(buffer)
  for (let i = 0; i < stringLength; i++) {
    bufferView[i] = str.charCodeAt(i)
  }
  return buffer
}

export const getByProp = (obj: any, prop: string): any =>
  String(prop).split('.').reduce((o: any, p: string): any => o[p], obj)

// const u = { name: { age: "TOMY" } }
// console.time("check")
// for (let i = 0; i < 10000; i++) {
//   console.log(u.name.age)
//   console.log("LOG SOMETHING...")
//   console.log("LOG SOMETHING...3", "LOG SOMETHING...2")
// }
// console.timeEnd("check")
